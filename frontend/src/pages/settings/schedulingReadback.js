// Pure functions for Scheduling's live readback sentence (settings spec §Scheduling,
// "1. Readback"). No React, no fetching — takes plain form state, returns strings.
// Kept separate from SchedulingSection.jsx so the grammar rules (day-range collapsing,
// break-clause dropping, timezone phrasing) can be read and reasoned about on their own.

// Backend convention (confirmed against booking_service.py's use of Python's
// date.weekday()): 0 = Monday ... 6 = Sunday. Every day-integer in this module
// follows that, NOT JS Date.getDay()'s 0 = Sunday.
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "09:00" (24h) -> "9:00 AM". Also accepts "09:00:00". */
export function formatTimeLabel(time24) {
  if (!time24) return ''
  const [hStr, mStr] = time24.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr ?? '00'
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${suffix}`
}

/** Joins day-range/singleton parts in prose: ["A"] -> "A"; ["A","B"] -> "A and B";
    ["A","B","C"] -> "A, B and C". */
function joinProse(parts) {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** [0,1,2,3,4] -> "Monday to Friday". [0,1,3,5] -> "Monday, Tuesday, Thursday and Saturday".
    [0,1,3,4,5] -> "Monday, Tuesday and Thursday to Saturday" (runs of 2+ collapse to a
    range, runs of 1 stay singular, all parts joined in day order). */
export function formatWorkingDays(days) {
  if (!days || days.length === 0) return ''
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  const parts = []
  let runStart = sorted[0]
  let runEnd = sorted[0]
  const flushRun = () => {
    parts.push(runEnd - runStart >= 2 ? `${DAY_NAMES[runStart]} to ${DAY_NAMES[runEnd]}` : (runStart === runEnd ? DAY_NAMES[runStart] : `${DAY_NAMES[runStart]} and ${DAY_NAMES[runEnd]}`))
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === runEnd + 1) {
      runEnd = sorted[i]
    } else {
      flushRun()
      runStart = sorted[i]
      runEnd = sorted[i]
    }
  }
  flushRun()
  return joinProse(parts)
}

/** Compact form for the nav status line ("Mon–Fri", not "Monday to Friday") —
    spec example: "Mon–Fri · 9:00 AM–6:00 PM". */
export function formatWorkingDaysCompact(days) {
  if (!days || days.length === 0) return 'No working days'
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  const parts = []
  let runStart = sorted[0]
  let runEnd = sorted[0]
  const flushRun = () => parts.push(runEnd > runStart ? `${DAY_ABBR[runStart]}–${DAY_ABBR[runEnd]}` : DAY_ABBR[runStart])
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === runEnd + 1) {
      runEnd = sorted[i]
    } else {
      flushRun()
      runStart = sorted[i]
      runEnd = sorted[i]
    }
  }
  flushRun()
  return parts.join(', ')
}

/** "Asia/Kolkata" -> "India"; "America/New_York" -> "New York"; falls back to the
    last path segment of the IANA zone with underscores turned into spaces. */
export function timezoneCityLabel(timezone) {
  if (!timezone) return ''
  if (timezone === 'Asia/Kolkata') return 'India'
  const last = timezone.split('/').pop() || timezone
  return last.replace(/_/g, ' ')
}

/**
 * Builds the readback sentence as a list of { text, strong } segments (so the
 * component can render it with real <strong> elements — no dangerouslySetInnerHTML
 * for what's ultimately server-derived numbers/strings).
 * @param {object} form
 * @param {number[]} form.working_days
 * @param {string} form.work_start_time  "HH:MM"
 * @param {string} form.work_end_time    "HH:MM"
 * @param {boolean} form.has_break
 * @param {string} [form.break_start_time]
 * @param {string} [form.break_end_time]
 * @param {number} form.default_session_duration  minutes
 * @param {number} form.min_booking_notice_hours
 * @param {number} form.max_advance_booking_days
 * @param {string} form.timezone
 * @returns {{ segments: {text: string, strong: boolean}[], isError: boolean }}
 */
export function buildReadback(form) {
  const days = form.working_days || []
  if (days.length === 0) {
    return {
      segments: [{ text: "Patients can't book any sessions — no working days are selected.", strong: false }],
      isError: true,
    }
  }

  const dayPhrase = formatWorkingDays(days)
  const hoursPhrase = `${formatTimeLabel(form.work_start_time)} – ${formatTimeLabel(form.work_end_time)}`
  const breakPhrase = form.has_break && form.break_start_time && form.break_end_time
    ? ` with a break from ${formatTimeLabel(form.break_start_time)} to ${formatTimeLabel(form.break_end_time)}`
    : ''
  const tz = timezoneCityLabel(form.timezone)
  const tzPhrase = tz === 'India' ? 'in India time' : `in ${tz} time`

  const segments = [
    { text: `${form.default_session_duration}-minute`, strong: true },
    { text: ' sessions, ', strong: false },
    { text: dayPhrase, strong: true },
    { text: ', ', strong: false },
    { text: hoursPhrase, strong: true },
    { text: `${breakPhrase}. Bookable from `, strong: false },
    { text: `${form.min_booking_notice_hours} hours`, strong: true },
    { text: ' up to ', strong: false },
    { text: `${form.max_advance_booking_days} days`, strong: true },
    { text: ` ahead, ${tzPhrase}.`, strong: false },
  ]

  return { segments, isError: false }
}
