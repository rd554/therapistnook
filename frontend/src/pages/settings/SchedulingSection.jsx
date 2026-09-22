import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { getAvailability, updateAvailability, listUnavailableDates } from '../../api/client'
import { useDirtyForm } from '../../hooks/useDirtyForm'
import { useRegisterSettingsGuard } from './SettingsGuardContext'
import { DAY_NAMES, DAY_ABBR, formatTimeLabel, buildReadback } from './schedulingReadback'
import { validateScheduling } from './schedulingValidation'
import BlockDatesModal from './BlockDatesModal'

// Half-hour slots across the full day — the spec's "Opens"/"Closes"/break
// selects all draw from the same list, just filtered differently by caller.
const TIME_OPTIONS = []
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
}

const SESSION_LENGTH_OPTIONS = []
for (let d = 15; d <= 120; d += 5) SESSION_LENGTH_OPTIONS.push(d)

const GAP_OPTIONS = [0, 5, 10, 15, 20, 30]
const NOTICE_OPTIONS = [1, 2, 4, 12, 24, 48]
const ADVANCE_OPTIONS = [7, 14, 30, 60, 90]

const FIELD_LABELS = {
  working_days: 'working days',
  work_start_time: 'opening time',
  work_end_time: 'closing time',
  timezone: 'timezone',
  has_break: 'daily break',
  break_start_time: 'break start',
  break_end_time: 'break end',
  default_session_duration: 'session length',
  buffer_minutes: 'gap after each session',
  min_booking_notice_hours: 'earliest booking notice',
  max_advance_booking_days: 'booking window',
}

function toFormShape(availability) {
  return {
    working_days: availability.working_days || [],
    work_start_time: availability.work_start_time,
    work_end_time: availability.work_end_time,
    timezone: availability.timezone,
    has_break: Boolean(availability.break_start_time && availability.break_end_time),
    break_start_time: availability.break_start_time || '13:00',
    break_end_time: availability.break_end_time || '14:00',
    default_session_duration: availability.default_session_duration,
    buffer_minutes: availability.buffer_minutes,
    min_booking_notice_hours: availability.min_booking_notice_hours,
    max_advance_booking_days: availability.max_advance_booking_days,
  }
}

export default function SchedulingSection() {
  const { refreshNavStatus } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [unavailableDates, setUnavailableDates] = useState([])
  const [showBlockDates, setShowBlockDates] = useState(false)

  const { form, setField, isDirty, changedLabels, discard, commit } = useDirtyForm({}, FIELD_LABELS)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [availability, dates] = await Promise.all([getAvailability(), listUnavailableDates()])
        if (cancelled) return
        commit(toFormShape(availability))
        setUnavailableDates(dates)
      } catch (err) {
        if (!cancelled) setServerError(err.userMessage || 'Failed to load scheduling settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fieldErrors = useMemo(() => validateScheduling(form), [form])
  const errorCount = Object.keys(fieldErrors).length
  const readback = useMemo(() => buildReadback(form), [form])

  useRegisterSettingsGuard(isDirty, changedLabels)

  const formStatusText = errorCount > 0
    ? `${errorCount} field${errorCount > 1 ? 's' : ''} need${errorCount > 1 ? '' : 's'} attention`
    : (isDirty ? `Unsaved: ${changedLabels}` : '')

  const toggleDay = (dayValue) => {
    const days = form.working_days || []
    setField('working_days', days.includes(dayValue)
      ? days.filter((d) => d !== dayValue)
      : [...days, dayValue].sort((a, b) => a - b))
  }

  const [showZeroDaysConfirm, setShowZeroDaysConfirm] = useState(false)
  const keepEditingRef = useRef(null)

  useEffect(() => {
    if (showZeroDaysConfirm) keepEditingRef.current?.focus()
  }, [showZeroDaysConfirm])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (errorCount > 0) return
    // Saving with no working days is allowed, but it's a one-way trip for
    // bookability — confirm before it happens rather than silently going
    // live. Not a validation error: the field itself carries no fieldError.
    if (form.working_days.length === 0) {
      setShowZeroDaysConfirm(true)
      return
    }
    performSave()
  }

  const performSave = async () => {
    setSaving(true)
    setServerError('')
    setShowZeroDaysConfirm(false)
    try {
      const saved = await updateAvailability({
        working_days: form.working_days,
        work_start_time: form.work_start_time,
        work_end_time: form.work_end_time,
        timezone: form.timezone,
        break_start_time: form.has_break ? form.break_start_time : null,
        break_end_time: form.has_break ? form.break_end_time : null,
        default_session_duration: form.default_session_duration,
        buffer_minutes: form.buffer_minutes,
        min_booking_notice_hours: form.min_booking_notice_hours,
        max_advance_booking_days: form.max_advance_booking_days,
      })
      commit(toFormShape(saved))
      await refreshNavStatus()
    } catch (err) {
      setServerError(err.userMessage || 'Failed to save scheduling settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card settings-section"><p className="t-caption">Loading…</p></div>
  }

  const timeOffDesc = unavailableDates.length === 0
    ? "No dates blocked — you're bookable every working day."
    : `${unavailableDates.length} date${unavailableDates.length > 1 ? 's' : ''} blocked`

  return (
    <>
    <form onSubmit={handleSubmit} noValidate>
      {serverError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="settings-readback" aria-live="polite" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="settings-readback-label">In plain words</span>
        <p className={`settings-readback-text${readback.isError ? ' is-error' : ''}`}>
          {readback.segments.map((seg, i) => (
            seg.strong ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
          ))}
        </p>
      </div>

      <div className="card settings-section" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="t-h2">Working week</h2>

        <div>
          <div className="field-head"><label>Days</label></div>
          <div className="day-picker">
            {DAY_NAMES.map((name, i) => (
              <button
                key={name}
                type="button"
                className="toggle-opt"
                aria-pressed={form.working_days.includes(i)}
                aria-label={name}
                onClick={() => toggleDay(i)}
              >
                {DAY_ABBR[i]}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-range">
          <div className="field">
            <div className="field-head"><label htmlFor="work_start_time">Opens</label></div>
            <select
              id="work_start_time"
              className="select"
              value={form.work_start_time}
              onChange={(e) => setField('work_start_time', e.target.value)}
            >
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTimeLabel(t)}</option>)}
            </select>
          </div>
          <span className="settings-range-sep">to</span>
          <div className="field">
            <div className="field-head"><label htmlFor="work_end_time">Closes</label></div>
            <select
              id="work_end_time"
              className="select"
              aria-invalid={fieldErrors.work_end_time ? 'true' : undefined}
              value={form.work_end_time}
              onChange={(e) => setField('work_end_time', e.target.value)}
            >
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTimeLabel(t)}</option>)}
            </select>
            {fieldErrors.work_end_time && <p className="input-error-text">{fieldErrors.work_end_time}</p>}
          </div>
          <div className="field">
            <div className="field-head"><label htmlFor="timezone">Timezone</label></div>
            <select
              id="timezone"
              className="select"
              value={form.timezone}
              onChange={(e) => setField('timezone', e.target.value)}
            >
              <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
            </select>
          </div>
        </div>

        <hr className="settings-divider" />

        <div className="settings-row has-switch">
          <div>
            <p className="settings-row-title">Daily break</p>
            <p className="settings-row-desc">Block out time in the middle of the day when patients can&rsquo;t book.</p>
          </div>
          <div className="settings-row-control">
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={form.has_break}
              aria-label="Daily break"
              onClick={() => setField('has_break', !form.has_break)}
            />
          </div>
        </div>

        {form.has_break && (
          <div className="settings-range">
            <div className="field">
              <div className="field-head"><label htmlFor="break_start_time">From</label></div>
              <select
                id="break_start_time"
                className="select"
                value={form.break_start_time}
                onChange={(e) => setField('break_start_time', e.target.value)}
              >
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTimeLabel(t)}</option>)}
              </select>
            </div>
            <span className="settings-range-sep">to</span>
            <div className="field">
              <div className="field-head"><label htmlFor="break_end_time">Until</label></div>
              <select
                id="break_end_time"
                className="select"
                aria-invalid={fieldErrors.break_end_time ? 'true' : undefined}
                value={form.break_end_time}
                onChange={(e) => setField('break_end_time', e.target.value)}
              >
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTimeLabel(t)}</option>)}
              </select>
              {fieldErrors.break_end_time && <p className="input-error-text">{fieldErrors.break_end_time}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="card settings-section" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="t-h2">Sessions and booking</h2>

        <div className="form-grid">
          <div>
            <div className="field-head"><label htmlFor="default_session_duration">Session length</label></div>
            <select
              id="default_session_duration"
              className="select"
              aria-invalid={fieldErrors.default_session_duration ? 'true' : undefined}
              value={form.default_session_duration}
              onChange={(e) => setField('default_session_duration', parseInt(e.target.value, 10))}
            >
              {SESSION_LENGTH_OPTIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </select>
            {fieldErrors.default_session_duration && <p className="input-error-text">{fieldErrors.default_session_duration}</p>}
          </div>

          <div>
            <div className="field-head"><label htmlFor="buffer_minutes">Gap after each session</label></div>
            <select
              id="buffer_minutes"
              className="select"
              value={form.buffer_minutes}
              onChange={(e) => setField('buffer_minutes', parseInt(e.target.value, 10))}
            >
              {GAP_OPTIONS.map((g) => <option key={g} value={g}>{g === 0 ? 'No gap' : `${g} minutes`}</option>)}
            </select>
            <p className="field-hint">Time blocked after a session before the next one can start.</p>
          </div>

          <div>
            <div className="field-head"><label htmlFor="min_booking_notice_hours">Earliest booking notice</label></div>
            <select
              id="min_booking_notice_hours"
              className="select"
              value={form.min_booking_notice_hours}
              onChange={(e) => setField('min_booking_notice_hours', parseInt(e.target.value, 10))}
            >
              {NOTICE_OPTIONS.map((h) => (
                <option key={h} value={h}>{h < 24 ? `${h} hour${h > 1 ? 's' : ''} before` : `${h / 24} day${h > 24 ? 's' : ''} before`}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="field-head"><label htmlFor="max_advance_booking_days">Furthest ahead</label></div>
            <select
              id="max_advance_booking_days"
              className="select"
              value={form.max_advance_booking_days}
              onChange={(e) => setField('max_advance_booking_days', parseInt(e.target.value, 10))}
            >
              {ADVANCE_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card settings-section">
        <div className="settings-row">
          <div>
            <p className="settings-section-title settings-row-title">Time off</p>
            <p className="settings-row-desc">{timeOffDesc}</p>
          </div>
          <div className="settings-row-control">
            <button type="button" className="btn btn-secondary" onClick={() => setShowBlockDates(true)}>
              Block dates
            </button>
          </div>
        </div>
      </div>

      {isDirty && (
        <div className="form-actions">
          {formStatusText && (
            <span className="form-status t-caption" style={errorCount > 0 ? { color: 'var(--error)' } : undefined}>
              {formStatusText}
            </span>
          )}
          <button type="button" className="btn btn-secondary" onClick={discard} disabled={saving}>Discard</button>
          <button type="submit" className="btn btn-primary" disabled={errorCount > 0 || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </form>

    {/* Deliberately outside the <form> above: Modal.jsx renders inline (no
        portal), and BlockDatesModal has its own <form>. Nesting it inside
        this one would be invalid HTML and, worse, would let a submit inside
        the modal bubble up through React's synthetic event tree and trigger
        handleSubmit, silently saving whatever is unsaved in this form too. */}
    <BlockDatesModal
      open={showBlockDates}
      onClose={() => setShowBlockDates(false)}
      unavailableDates={unavailableDates}
      onChange={setUnavailableDates}
    />

    {showZeroDaysConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }}>
        <div
          className="modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="zero-days-confirm-title"
          onKeyDown={(e) => { if (e.key === 'Escape') setShowZeroDaysConfirm(false) }}
        >
          <h3 id="zero-days-confirm-title" className="modal-title">Save with no working days?</h3>
          <p className="modal-body">Patients won&rsquo;t be able to book any sessions. Save anyway?</p>
          <div className="modal-actions">
            <button type="button" ref={keepEditingRef} className="btn btn-secondary" onClick={() => setShowZeroDaysConfirm(false)}>
              Keep editing
            </button>
            <button type="button" className="btn btn-primary" onClick={performSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save anyway'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
