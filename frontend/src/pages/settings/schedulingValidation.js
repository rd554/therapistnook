// Pure field-level validation for Scheduling (spec: "close after open; break
// inside working hours and end after start; session length + gap must fit at
// least once between open and close"). Returns { field: message } — components
// render each message next to its own field via .input-error-text/aria-invalid.

function toMinutes(time24) {
  if (!time24) return null
  const [h, m] = time24.split(':').map(Number)
  return h * 60 + m
}

export function validateScheduling(form) {
  const errors = {}

  const openMin = toMinutes(form.work_start_time)
  const closeMin = toMinutes(form.work_end_time)
  if (openMin != null && closeMin != null && closeMin <= openMin) {
    errors.work_end_time = 'Closing time must be after opening time.'
  }

  if (form.has_break && form.break_start_time && form.break_end_time) {
    const breakStart = toMinutes(form.break_start_time)
    const breakEnd = toMinutes(form.break_end_time)
    if (breakEnd <= breakStart) {
      errors.break_end_time = 'Break end must be after break start.'
    } else if (openMin != null && closeMin != null && (breakStart < openMin || breakEnd > closeMin)) {
      errors.break_end_time = 'Break must fall within working hours.'
    }
  }

  if (!errors.work_end_time && openMin != null && closeMin != null) {
    const available = closeMin - openMin
    const needed = (form.default_session_duration || 0) + (form.buffer_minutes || 0)
    if (needed > available) {
      errors.default_session_duration = "Session length and gap don't fit within your working hours."
    }
  }

  return errors
}
