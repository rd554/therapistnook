// ISO timestamp -> "1 Jan 1998" — the app's one date format, shared by every
// screen that renders a plain date (patient profile, patients list, clinical
// intelligence). See ClinicalIntelligenceTab's formatDate, which this mirrors.
// Month token is built via 'en-US' rather than a single en-GB call: en-GB's
// short-month format renders September as "Sept" (4 letters), same ICU quirk
// formatDateBadge below already works around.
export function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  return `${d.getDate()} ${month} ${d.getFullYear()}`
}

// ISO timestamp -> { month: 'SEP', day: '20' } for .date-badge's two-line
// layout. Deliberately 'en-US' rather than formatDate's 'en-GB': en-GB's
// short-month format can return 4-letter abbreviations ("Sept"), which is
// exactly what forced the Patients-list "Created" column fix — a 44px-wide
// badge has even less room to absorb that than a table column did.
export function formatDateBadge(value) {
  if (!value) return { month: '', day: '' }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { month: '', day: '' }
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  }
}

// ISO timestamp -> "13 Aug 2026 · 5:00 PM" — date + time, tabular-friendly,
// for rows that need to disambiguate same-day entries (Session Intelligence).
export function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart} · ${timePart}`
}

// ISO start/end timestamps -> "9:00 – 9:50 AM · 50 min" for .session-time —
// the AM/PM suffix only prints once, on the later time, when both ends of
// the range share the same period.
export function formatSessionTime(startValue, endValue, durationMinutes) {
  const start = new Date(startValue)
  const end = new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  const fmt = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const startLabel = fmt(start)
  const endLabel = fmt(end)
  const samePeriod = startLabel.slice(-2) === endLabel.slice(-2)
  const startTrimmed = samePeriod ? startLabel.slice(0, -3) : startLabel
  const duration = durationMinutes ?? Math.round((end - start) / 60000)
  return `${startTrimmed} – ${endLabel} · ${duration} min`
}
