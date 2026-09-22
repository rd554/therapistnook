import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Loader2, Plus, ChevronDown, ChevronUp,
  CheckCircle, Search,
} from 'lucide-react'
import { createAppointmentWithPayment, getCalendarEvents, getPatient } from '../api/client'

const SESSION_TYPES = [
  { value: 'therapy_session', label: 'Therapy session' },
  { value: 'assessment_session', label: 'Assessment' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'emergency', label: 'Emergency' },
]

const SESSION_MODES = [
  { value: 'offline', label: 'In person' },
  { value: 'online', label: 'Online' },
]

const DURATION_CHIPS = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 50, label: '50 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90 min' },
  { value: null, label: 'Custom' },
]

function formatDateForInput(date) {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimeForInput(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toTimeString().slice(0, 5)
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function ScheduleModal({
  initialDate,
  initialStartTime,
  initialEndTime,
  patients,
  onSubmit,
  onClose,
  onScheduled,
  editMode = false,
  initialData = null,
}) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [showPaymentSection, setShowPaymentSection] = useState(false)
  const [customDuration, setCustomDuration] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [conflicts, setConflicts] = useState([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [patientLastFee, setPatientLastFee] = useState(null) // rupees, what the selected patient was last charged
  // Condensed summary of the patient's last processed transcript session, if
  // any — replaces the old free-text Notes field with "what happened last
  // time" instead, so there's no separate scratchpad field to keep in sync.
  const [lastSessionSummary, setLastSessionSummary] = useState(null)

  const searchInputRef = useRef(null)
  const dropdownRef = useRef(null)
  // Tracks the currently-selected patient synchronously so an in-flight
  // getPatient() fetch can tell, once it resolves, whether the user has
  // since picked a different patient and its result is now stale.
  const selectedPatientIdRef = useRef(null)

  const [form, setForm] = useState(() => {
    if (editMode && initialData) {
      return {
        patientId: initialData.patient_id,
        patientName: initialData.patient_name,
        date: formatDateForInput(initialData.date),
        startTime: formatTimeForInput(initialData.start_time),
        duration: initialData.duration_minutes,
        sessionType: initialData.session_type,
        sessionMode: initialData.session_mode,
        sessionFee: '',
        discountAmount: '',
        discountReason: '',
        taxPercentage: '',
      }
    }

    const defaultDuration = 50
    let startTime = '09:00'
    let date = formatDateForInput(new Date())

    if (initialDate) {
      date = formatDateForInput(initialDate)
    }
    if (initialStartTime) {
      startTime = formatTimeForInput(initialStartTime)
    }
    if (initialEndTime && initialStartTime) {
      const duration = Math.round((new Date(initialEndTime) - new Date(initialStartTime)) / (1000 * 60))
      return {
        patientId: '',
        patientName: '',
        date,
        startTime,
        duration: DURATION_CHIPS.find(d => d.value === duration)?.value || defaultDuration,
        sessionType: 'therapy_session',
        sessionMode: 'offline',
        sessionFee: '',
        discountAmount: '',
        discountReason: '',
        taxPercentage: '',
      }
    }

    return {
      patientId: '',
      patientName: '',
      date,
      startTime,
      duration: defaultDuration,
      sessionType: 'therapy_session',
      sessionMode: 'offline',
      notes: '',
      sessionFee: '',
      discountAmount: '',
      discountReason: '',
      taxPercentage: '',
    }
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowPatientDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Check for conflicts when date/time changes
  useEffect(() => {
    const checkConflicts = async () => {
      if (!form.date || !form.startTime) return

      setCheckingConflicts(true)
      try {
        const events = await getCalendarEvents(form.date, form.date)
        const startDateTime = new Date(`${form.date}T${form.startTime}:00`)
        const endDateTime = new Date(startDateTime.getTime() + form.duration * 60 * 1000)

        const overlapping = events.filter(event => {
          if (editMode && initialData && event.id === initialData.id) return false
          const eventStart = new Date(event.start)
          const eventEnd = new Date(event.end)
          return (startDateTime < eventEnd && endDateTime > eventStart)
        })

        setConflicts(overlapping)
      } catch {
        setConflicts([])
      } finally {
        setCheckingConflicts(false)
      }
    }

    const timeoutId = setTimeout(checkConflicts, 500)
    return () => clearTimeout(timeoutId)
  }, [form.date, form.startTime, form.duration])


  const filteredPatients = useMemo(() => {
    if (!searchQuery) return patients.slice(0, 8)
    return patients.filter(p =>
      p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 8)
  }, [patients, searchQuery])

  // Mark recently scheduled patients
  const recentPatients = useMemo(() => {
    return patients.slice(0, 3).map(p => p.id)
  }, [patients])

  const handlePatientSelect = (patient) => {
    setForm(f => ({ ...f, patientId: patient.id, patientName: patient.full_name }))
    setShowPatientDropdown(false)
    setSearchQuery('')
    selectedPatientIdRef.current = patient.id

    // Pre-fill the session fee with what this specific patient was last
    // charged — only when the field is still untouched, so it never
    // overwrites something the user already typed. Same round trip also
    // pulls their last processed session summary, if they have one.
    setPatientLastFee(null)
    setLastSessionSummary(null)
    if (editMode) return
    getPatient(patient.id).then((full) => {
      // The practitioner may have picked a different patient while this was
      // in flight — don't let a stale response apply to the new selection.
      if (selectedPatientIdRef.current !== patient.id) return
      if (full.last_session_fee) {
        setPatientLastFee(full.last_session_fee / 100)
        setForm(f => (f.patientId === patient.id && !f.sessionFee
          ? { ...f, sessionFee: String(full.last_session_fee / 100) }
          : f))
      }
      if (full.last_session_summary) {
        setLastSessionSummary(full.last_session_summary)
      }
    }).catch(() => {})
  }

  const handleDurationSelect = (duration) => {
    if (duration === null) {
      setCustomDuration(true)
    } else {
      setCustomDuration(false)
      setForm(f => ({ ...f, duration }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.patientId) {
      setError('Please select a patient')
      return
    }
    if (!form.date || !form.startTime) {
      setError('Please select date and time')
      return
    }

    const sessionFee = form.sessionFee ? parseInt(form.sessionFee) * 100 : 0
    if (sessionFee < 0) {
      setError('Session fee cannot be negative')
      return
    }

    // Check for past time (skip when editing an existing appointment, since
    // corrections like an AM/PM slip are often made after the slot has passed)
    const startDateTime = new Date(`${form.date}T${form.startTime}:00`)
    if (!editMode && startDateTime < new Date()) {
      setError('Cannot schedule appointments in the past')
      return
    }

    setLoading(true)

    try {
      const endDateTime = new Date(startDateTime.getTime() + form.duration * 60 * 1000)

      const discountAmount = form.discountAmount ? parseInt(form.discountAmount) * 100 : 0
      const taxPercentage = form.taxPercentage ? parseInt(form.taxPercentage) * 100 : null

      if (sessionFee > 0) {
        const data = {
          patient_id: form.patientId,
          date: form.date,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          session_type: form.sessionType,
          session_mode: form.sessionMode,
          session_fee: sessionFee,
          discount_amount: discountAmount,
          discount_reason: form.discountReason || null,
          tax_percentage: taxPercentage,
        }

        await createAppointmentWithPayment(data)
        // The payment path bypasses onSubmit (it creates the appointment
        // itself), so the parent's calendar/list never learns a new
        // appointment exists unless we tell it directly here.
        await onScheduled?.()
      } else {
        const data = {
          patient_id: form.patientId,
          date: form.date,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          session_type: form.sessionType,
          session_mode: form.sessionMode,
        }

        await onSubmit(data)
      }

      setShowSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to schedule appointment')
    } finally {
      setLoading(false)
    }
  }

  const calculateTotal = () => {
    const sessionFee = form.sessionFee ? parseInt(form.sessionFee) : 0
    const discount = form.discountAmount ? parseInt(form.discountAmount) : 0
    const taxRate = form.taxPercentage ? parseInt(form.taxPercentage) / 100 : 0
    const subtotal = sessionFee - discount
    const tax = Math.round(subtotal * taxRate)
    return { sessionFee, discount, taxRate, subtotal, tax, total: subtotal + tax }
  }

  const handleScheduleAnother = () => {
    setShowSuccess(false)
    selectedPatientIdRef.current = null
    setPatientLastFee(null)
    setLastSessionSummary(null)
    setForm(f => ({
      ...f,
      patientId: '',
      patientName: '',
      // No patient selected yet — the fee/summary re-fill once one is picked again.
      sessionFee: '',
      discountAmount: '',
      discountReason: '',
      taxPercentage: '',
    }))
  }

  // Success state
  if (showSuccess) {
    return (
      <div className="clinical-ink">
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" style={{ padding: 'var(--space-4)' }} onClick={onClose}>
          <div className="modal" style={{ maxWidth: '420px', padding: 0, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 'var(--space-7) var(--space-6) var(--space-6)' }}>
              <div style={{
                margin: '0 auto var(--space-5)', display: 'flex', height: '56px', width: '56px',
                alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--selected)',
              }}>
                <CheckCircle size={28} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
              </div>
              <h2 className="t-h3" style={{ marginBottom: 'var(--space-2)' }}>Appointment scheduled</h2>
              <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
                Session with <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{form.patientName}</span> on{' '}
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDateDisplay(form.date)}</span> at{' '}
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{form.startTime}</span>
              </p>
            </div>
            <div className="modal-actions" style={{ margin: 0, padding: 'var(--space-5)', borderTop: 'var(--border-width) solid var(--hairline)' }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                View calendar
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleScheduleAnother}>
                Schedule another
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="clinical-ink">
      <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" style={{ padding: 'var(--space-4)' }} onClick={onClose}>
        <div className="modal as-sheet is-wide" onClick={(e) => e.stopPropagation()}>
          {/* The form wraps head/body/foot itself and re-establishes the
              same flex-column context .modal.as-sheet uses, rather than
              relying on `display: contents` to pass a <form>'s children
              through as flex items — Safari has a history of unreliable
              behavior with `display: contents` on form elements, and this
              sidesteps it entirely with plain nested flexbox. */}
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            <div className="sheet-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 className="t-h3">{editMode ? 'Edit appointment' : 'Schedule session'}</h2>
                <p className="t-caption" style={{ marginTop: '2px' }}>
                  {editMode ? 'Update the session details below' : 'Create a new appointment'}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="sheet-body">
              {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>{error}</div>}

              {conflicts.length > 0 && (
                <div className="alert alert-warn" style={{ marginBottom: 'var(--space-5)' }}>
                  <p style={{ margin: 0 }}>
                    <strong>Scheduling conflict.</strong>{' '}
                    This time overlaps with {conflicts.length} existing appointment{conflicts.length > 1 ? 's' : ''}.
                    {conflicts[0]?.patient_name && ` (${conflicts[0].patient_name})`}
                  </p>
                </div>
              )}

              <div className="form-grid">
                {/* Patient — full width */}
                <div className="span-2" ref={dropdownRef}>
                  <div className="field-head"><label>Patient</label></div>
                  <div style={{ position: 'relative' }}>
                    {form.patientId ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        height: '40px', padding: '0 12px', background: 'var(--surface)',
                        border: 'var(--border-width) solid var(--border)', borderRadius: 'var(--radius-md)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div style={{
                            display: 'flex', height: '28px', width: '28px', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '50%', background: 'var(--selected)', color: 'var(--accent)',
                            font: '600 12px/1 var(--font-ui)',
                          }}>
                            {form.patientName.charAt(0)}
                          </div>
                          <span style={{ font: '500 14px/20px var(--font-ui)', color: 'var(--text-primary)' }}>{form.patientName}</span>
                        </div>
                        {/* The update endpoint can't reassign a patient, so don't
                            offer a way to clear/change the selection in edit mode. */}
                        {!editMode && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-icon-sm"
                            aria-label="Change patient"
                            onClick={() => {
                              selectedPatientIdRef.current = null
                              setPatientLastFee(null)
                              setLastSessionSummary(null)
                              setForm(f => ({ ...f, patientId: '', patientName: '' }))
                            }}
                          >
                            <X size={14} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="input-search">
                          <Search size={16} strokeWidth={1.5} />
                          <input
                            ref={searchInputRef}
                            type="text"
                            className="input"
                            placeholder="Search patients"
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value)
                              setShowPatientDropdown(true)
                            }}
                            onFocus={() => setShowPatientDropdown(true)}
                          />
                        </div>
                        {showPatientDropdown && (
                          <div className="card" style={{
                            position: 'absolute', zIndex: 20, marginTop: 'var(--space-2)', width: '100%',
                            padding: 'var(--space-2)', maxHeight: '280px', overflow: 'auto',
                          }}>
                            {filteredPatients.length === 0 ? (
                              <div style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
                                <p className="t-caption" style={{ marginBottom: 'var(--space-3)' }}>No patients found</p>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => navigate('/patients', { state: { openCreate: true } })}
                                >
                                  <Plus size={14} strokeWidth={1.5} />
                                  Create new patient
                                </button>
                              </div>
                            ) : (
                              filteredPatients.map((patient) => (
                                <button
                                  key={patient.id}
                                  type="button"
                                  className="btn btn-ghost btn-block"
                                  style={{ justifyContent: 'flex-start', height: 'auto', padding: 'var(--space-2)', gap: 'var(--space-3)' }}
                                  onClick={() => handlePatientSelect(patient)}
                                >
                                  <div style={{
                                    display: 'flex', height: '32px', width: '32px', flex: 'none', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '50%', background: 'var(--selected)', color: 'var(--accent)',
                                    font: '600 13px/1 var(--font-ui)',
                                  }}>
                                    {patient.full_name.charAt(0)}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                      <span style={{ font: '500 14px/20px var(--font-ui)', color: 'var(--text-primary)' }}>{patient.full_name}</span>
                                      {recentPatients.includes(patient.id) && (
                                        <span className="t-caption">Recent</span>
                                      )}
                                    </div>
                                    <p className="t-caption">{patient.age} years · {patient.gender}</p>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <div className="field-head"><label htmlFor="sched_date">Date</label></div>
                  <input
                    id="sched_date"
                    type="date"
                    className="input"
                    value={form.date}
                    onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>

                {/* Start time */}
                <div>
                  <div className="field-head"><label htmlFor="sched_start">Start time</label></div>
                  <input
                    id="sched_start"
                    type="time"
                    className="input"
                    value={form.startTime}
                    onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))}
                    required
                  />
                </div>

                {/* Session type */}
                <div>
                  <div className="field-head"><label htmlFor="sched_type">Session type</label></div>
                  <select
                    id="sched_type"
                    className="select"
                    value={form.sessionType}
                    onChange={(e) => setForm(f => ({ ...f, sessionType: e.target.value }))}
                  >
                    {SESSION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                {/* Session mode — two equal halves, no emoji */}
                <div>
                  <div className="field-head"><label>Session mode</label></div>
                  <div className="seg" style={{ width: '100%' }} role="group" aria-label="Session mode">
                    {SESSION_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        className="seg-option"
                        style={{ flex: 1 }}
                        aria-pressed={form.sessionMode === mode.value}
                        onClick={() => setForm(f => ({ ...f, sessionMode: mode.value }))}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration — full width, equal-width wrapping options */}
                <div className="span-2">
                  <div className="field-head"><label>Duration</label></div>
                  <div className="toggle-group">
                    {DURATION_CHIPS.map((chip) => {
                      const isSelected = chip.value === null ? customDuration : form.duration === chip.value && !customDuration
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          className="toggle-opt"
                          aria-pressed={isSelected}
                          onClick={() => handleDurationSelect(chip.value)}
                        >
                          {chip.label}
                        </button>
                      )
                    })}
                  </div>
                  {customDuration && (
                    <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type="number"
                        className="input"
                        style={{ width: '96px' }}
                        value={form.duration}
                        onChange={(e) => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 0 }))}
                        min="15"
                        max="240"
                      />
                      <span className="t-caption">minutes</span>
                    </div>
                  )}
                </div>

                {/* Last session summary — only when the selected patient has a
                    processed transcript session on file. */}
                {lastSessionSummary && (
                  <div className="span-2">
                    <div className="field-head"><label>Last session summary</label></div>
                    <div className="card card-compact" style={{ background: 'var(--surface)' }}>
                      <p className="t-caption" style={{ marginBottom: 'var(--space-2)' }}>
                        {formatDateDisplay(lastSessionSummary.session_date)}
                      </p>
                      <div className="space-y-3">
                        {[
                          ['Presenting issues', lastSessionSummary.presenting_issues],
                          ['Key discussion points', lastSessionSummary.key_discussion_points],
                          ['Emotional themes', lastSessionSummary.emotional_themes],
                          ['Homework discussed', lastSessionSummary.homework_discussed],
                        ].filter(([, text]) => text).map(([label, text]) => (
                          <div key={label}>
                            <p className="field-label" style={{ marginBottom: '2px' }}>{label}</p>
                            <p className="field-value">{text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment — full width */}
                {!editMode && (
                  <div className="span-2">
                    <div className="card card-flush">
                      <button
                        type="button"
                        className="btn btn-ghost btn-block"
                        style={{ justifyContent: 'space-between', height: '52px', padding: '0 var(--space-4)', borderRadius: 0 }}
                        aria-expanded={showPaymentSection}
                        onClick={() => setShowPaymentSection(!showPaymentSection)}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', font: '500 14px/20px var(--font-ui)', color: 'var(--text-primary)' }}>
                          Payment details
                          {form.sessionFee && (
                            <span className="t-caption" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{calculateTotal().total}</span>
                          )}
                        </span>
                        {showPaymentSection ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
                      </button>

                      {showPaymentSection && (
                        <div style={{ padding: 'var(--space-4)', borderTop: 'var(--border-width) solid var(--hairline)' }} className="space-y-4">
                          <div>
                            <div className="field-head"><label htmlFor="sched_fee">Session fee (₹)</label></div>
                            <input
                              id="sched_fee"
                              type="number"
                              className="input"
                              placeholder="e.g., 2000"
                              value={form.sessionFee}
                              onChange={(e) => setForm(f => ({ ...f, sessionFee: e.target.value }))}
                              min="0"
                            />
                            <p className="field-hint">
                              {patientLastFee
                                ? `Defaults to ${form.patientName}'s last session fee — clear it for no payment tracking on this session`
                                : 'Leave empty for no payment tracking'}
                            </p>
                          </div>

                          {form.sessionFee && (
                            <div className="form-grid">
                              <div>
                                <div className="field-head"><label htmlFor="sched_discount">Discount (₹)</label></div>
                                <input
                                  id="sched_discount"
                                  type="number"
                                  className="input"
                                  placeholder="0"
                                  value={form.discountAmount}
                                  onChange={(e) => setForm(f => ({ ...f, discountAmount: e.target.value }))}
                                  min="0"
                                />
                              </div>
                              <div>
                                <div className="field-head"><label htmlFor="sched_discount_reason">Discount reason</label></div>
                                <input
                                  id="sched_discount_reason"
                                  type="text"
                                  className="input"
                                  placeholder="e.g., First session"
                                  value={form.discountReason}
                                  onChange={(e) => setForm(f => ({ ...f, discountReason: e.target.value }))}
                                />
                              </div>
                            </div>
                          )}

                          {form.sessionFee && (
                            <div style={{ maxWidth: '50%' }}>
                              <div className="field-head"><label htmlFor="sched_tax">Tax (%)</label></div>
                              <input
                                id="sched_tax"
                                type="number"
                                className="input"
                                placeholder="e.g., 18"
                                value={form.taxPercentage}
                                onChange={(e) => setForm(f => ({ ...f, taxPercentage: e.target.value }))}
                                min="0"
                                max="100"
                              />
                            </div>
                          )}

                          {form.sessionFee && (
                            <div className="card card-compact" style={{ background: 'var(--surface)' }}>
                              <div className="space-y-2">
                                <div style={{ display: 'flex', justifyContent: 'space-between' }} className="t-caption">
                                  <span>Session fee</span>
                                  <span>₹{calculateTotal().sessionFee}</span>
                                </div>
                                {calculateTotal().discount > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }} className="t-caption">
                                    <span>Discount</span>
                                    <span>-₹{calculateTotal().discount}</span>
                                  </div>
                                )}
                                {calculateTotal().tax > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }} className="t-caption">
                                    <span>Tax ({form.taxPercentage}%)</span>
                                    <span>₹{calculateTotal().tax}</span>
                                  </div>
                                )}
                                <div style={{
                                  display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-2)',
                                  borderTop: 'var(--border-width) solid var(--hairline)', font: '600 14px/20px var(--font-ui)', color: 'var(--text-primary)',
                                }}>
                                  <span>Total</span>
                                  <span>₹{calculateTotal().total}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sheet-foot">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ minWidth: '160px' }} disabled={loading || checkingConflicts}>
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" strokeWidth={2} />
                    {editMode ? 'Saving…' : 'Scheduling…'}
                  </>
                ) : (
                  editMode ? 'Save changes' : 'Schedule session'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
