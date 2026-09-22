import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getPublicBookingSlots, createPublicBooking } from '../api/client'

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ')

function formatTime(iso) {
  const s = new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  return s.replace('AM', 'am').replace('PM', 'pm')
}

function dayParts(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    date: d.getDate(),
    ariaLabel: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
  }
}

function submitLabel(dateStr, slot) {
  if (!dateStr || !slot) return 'Choose time'
  const d = new Date(`${dateStr}T00:00:00`)
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' })
  const day = d.getDate()
  const month = d.toLocaleDateString('en-IN', { month: 'short' })
  return `Request ${weekday} ${day} ${month}, ${formatTime(slot.start)}`
}

// Builds a minimal .ics for the requested (not yet confirmed) time, so a
// visitor can hold the slot on their own calendar while payment is pending.
function buildIcs({ start, end, practitionerName }) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Therapist Nook//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@therapistnook.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Session with ${practitionerName}`,
    'DESCRIPTION:Requested via Therapist Nook. Confirmed once payment is complete.',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

function downloadIcs(event) {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'session.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * .pp-sheet booking flow — one screen (mode, day, time, details, submit)
 * replacing the old three-step PublicBooking wizard. Bottom sheet on
 * mobile, centred dialog on desktop (CSS handles the breakpoint).
 *
 * What this actually books: a free introductory screening call, not a paid
 * session. Submitting creates a pending BookingRequest that lands in the
 * practitioner's patients list for her to accept or decline after calling
 * the prospective client — see accept_booking_request in main.py. No
 * payment happens here or is owed for this call; real payment only starts
 * from the first real session onward, set by the practitioner separately.
 * That's why the confirmation screen only offers Add to calendar / Done,
 * per spec — there's nothing to pay yet.
 *
 * Deviation from spec: there's no data source for which session modes
 * (online / at clinic) a given practice actually offers — SESSION_MODES
 * is only ever set per-appointment, never as a practice-level setting —
 * so both mode options are always shown here rather than being filtered
 * to "what the practice offers".
 */
export default function BookingSheet({ slug, practitionerName, initialDate, initialSlot, onClose }) {
  const sheetRef = useRef(null)
  const previouslyFocused = useRef(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [slotsData, setSlotsData] = useState(null)

  const [mode, setMode] = useState('online')
  const [selectedDate, setSelectedDate] = useState(initialDate || null)
  const [selectedSlot, setSelectedSlot] = useState(initialSlot || null)
  const [slotTakenNotice, setSlotTakenNotice] = useState(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '', concern: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [bookingResult, setBookingResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await getPublicBookingSlots(slug, null, 14)
        if (cancelled) return
        setSlotsData(data)
        const availableDays = data.days.filter((d) => d.is_available && d.slots.length > 0)
        const stillValid = initialDate && availableDays.some((d) => d.date === initialDate)
        if (!stillValid) {
          setSelectedDate(availableDays[0]?.date || null)
          setSelectedSlot(null)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.userMessage || 'Could not load available times.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Focus trap, Escape-to-close, return focus on unmount — same pattern as
  // components/ui/Modal.jsx, reimplemented here because the .pp-sheet
  // markup (handle bar, custom head/foot) doesn't fit that component's shape.
  useEffect(() => {
    previouslyFocused.current = document.activeElement
    document.body.style.overflow = 'hidden'

    const panel = sheetRef.current
    const raf = requestAnimationFrame(() => {
      const first = panel?.querySelector(FOCUSABLE_SELECTOR)
      ;(first || panel)?.focus()
    })

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = ''
      previouslyFocused.current?.focus?.()
    }
  }, [onClose])

  const availableDays = useMemo(
    () => slotsData?.days.filter((d) => d.is_available && d.slots.length > 0) || [],
    [slotsData]
  )
  const daySlots = availableDays.find((d) => d.date === selectedDate)?.slots || []
  const duration = selectedSlot?.duration_minutes || slotsData?.session_types?.[0]?.duration_minutes

  const surname = (practitionerName || '').trim().split(/\s+/).pop()
  const isScrolling = availableDays.length > 5

  async function refreshSlots() {
    try {
      const data = await getPublicBookingSlots(slug, null, 14)
      setSlotsData(data)
    } catch {
      // keep the stale list rather than blank the sheet — the error alert
      // already told the visitor what happened
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedDate || !selectedSlot || !form.name.trim() || !form.email.trim()) return

    setSubmitting(true)
    setSubmitError(null)
    setSlotTakenNotice(null)
    try {
      const result = await createPublicBooking(slug, {
        patient_name: form.name.trim(),
        patient_email: form.email.trim(),
        patient_phone: form.phone.trim() || null,
        requested_date: selectedDate,
        requested_start_time: selectedSlot.start,
        // The backend always books this as the free intro call regardless
        // of what's sent here (create_public_booking hardcodes "consultation")
        // — there's no patient-facing session-type choice on this form.
        session_mode: mode,
        patient_notes: form.concern.trim() || null,
      })
      setBookingResult(result)
    } catch (err) {
      if (err.response?.status === 400) {
        // Most likely the double-booking guard in booking_service.py — the
        // slot was taken between page load and submit. Return to the time
        // grid with a fresh slot list rather than a dead-end error.
        setSlotTakenNotice('That time was just booked. Here are the next open ones.')
        setSelectedSlot(null)
        await refreshSlots()
      } else {
        setSubmitError(err.userMessage || 'Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!(selectedDate && selectedSlot && form.name.trim() && form.email.trim())

  return (
    <div className="pp-sheet-scrim" onClick={onClose}>
      <div
        ref={sheetRef}
        className="pp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pp-sheet-handle" />

        {bookingResult ? (
          <div className="pp-sheet-done">
            <h2>Request sent</h2>
            <p>
              {dayParts(selectedDate).ariaLabel}, {formatTime(selectedSlot.start)} with {practitionerName}.
            </p>
            <p>
              Nothing to pay for this call — {surname ? `Dr. ${surname}` : practitionerName} will review your request and call you to confirm.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadIcs({ start: selectedSlot.start, end: selectedSlot.end, practitionerName })}
            >
              Add to calendar
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="pp-sheet-head">
              <div>
                <h2 id="book-title" className="pp-sheet-title">Book a session</h2>
                <p className="pp-sheet-sub">
                  {/* This books a free introductory call, not the real
                      session — the practice's actual fee (shown elsewhere
                      on the page) isn't charged for this call, so it isn't
                      repeated here as if it were the price of booking. */}
                  {[duration && `${duration} min`, 'Free', practitionerName]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {loading && <p className="t-caption">Loading available times…</p>}
            {loadError && <div className="alert alert-error">{loadError}</div>}

            {!loading && !loadError && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <span className="pp-sheet-group-label">How you'd like to meet</span>
                  <div className="pp-mode toggle-group">
                    <button
                      type="button"
                      className="toggle-opt"
                      aria-pressed={mode === 'online'}
                      aria-label="Online"
                      onClick={() => setMode('online')}
                    >
                      Online
                    </button>
                    <button
                      type="button"
                      className="toggle-opt"
                      aria-pressed={mode === 'offline'}
                      aria-label="At clinic"
                      onClick={() => setMode('offline')}
                    >
                      At clinic
                    </button>
                  </div>
                </div>

                <div>
                  <span className="pp-sheet-group-label">Day</span>
                  {availableDays.length === 0 ? (
                    <p className="t-caption">No open times in the next two weeks.</p>
                  ) : (
                    <div className={`pp-days toggle-group${isScrolling ? ' is-scrolling' : ''}`}>
                      {availableDays.map((day) => {
                        const parts = dayParts(day.date)
                        return (
                          <button
                            key={day.date}
                            type="button"
                            className="toggle-opt"
                            aria-pressed={selectedDate === day.date}
                            aria-label={parts.ariaLabel}
                            onClick={() => {
                              setSelectedDate(day.date)
                              setSelectedSlot(null)
                              setSlotTakenNotice(null)
                            }}
                          >
                            {parts.weekday}<br />{parts.date}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {selectedDate && (
                  <div>
                    <span className="pp-sheet-group-label">Time</span>
                    {slotTakenNotice && <div className="alert" style={{ marginBottom: '10px' }}>{slotTakenNotice}</div>}
                    {daySlots.length === 0 ? (
                      <p className="t-caption">No open times on this day.</p>
                    ) : (
                      <div className="pp-times toggle-group">
                        {daySlots.map((slot) => (
                          <button
                            key={slot.start}
                            type="button"
                            className="toggle-opt"
                            aria-pressed={selectedSlot?.start === slot.start}
                            onClick={() => setSelectedSlot(slot)}
                          >
                            {formatTime(slot.start)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <hr className="pp-sheet-divider" />

                <div className="pp-sheet-fields">
                  <div className="field">
                    <div className="field-head">
                      <label htmlFor="pp-name">Your name</label>
                    </div>
                    <input
                      id="pp-name"
                      className="input"
                      type="text"
                      autoComplete="name"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  <div className="pp-sheet-pair">
                    <div className="field">
                      <div className="field-head">
                        <label htmlFor="pp-email">Email</label>
                      </div>
                      <input
                        id="pp-email"
                        className="input"
                        type="email"
                        autoComplete="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <div className="field-head">
                        <label htmlFor="pp-phone">Phone</label>
                        <span className="field-optional">Optional</span>
                      </div>
                      <input
                        id="pp-phone"
                        className="input"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+91"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <div className="field-head">
                      <label htmlFor="pp-concern">What would you like support with?</label>
                      <span className="field-optional">Optional</span>
                    </div>
                    <textarea
                      id="pp-concern"
                      className="textarea"
                      placeholder="A sentence is enough."
                      value={form.concern}
                      onChange={(e) => setForm({ ...form, concern: e.target.value })}
                    />
                  </div>
                </div>

                {submitError && <div className="alert alert-error">{submitError}</div>}

                <button type="submit" className="btn btn-primary pp-sheet-submit" disabled={!canSubmit || submitting}>
                  {submitting ? 'Sending…' : submitLabel(selectedDate, selectedSlot)}
                </button>

                <p className="pp-sheet-foot">
                  Nothing to pay for this call. {surname ? `Dr. ${surname}` : practitionerName} will review your request and call you to confirm.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
