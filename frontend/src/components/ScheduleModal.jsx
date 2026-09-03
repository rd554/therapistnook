import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Calendar, Clock, User, Video, Building, Loader2,
  AlertCircle, Plus, ChevronDown, ChevronUp, IndianRupee, Percent, Tag,
  Stethoscope, ClipboardCheck, MessageSquare, RefreshCw, AlertTriangle,
  CheckCircle, CalendarPlus, Search, History,
} from 'lucide-react'
import { createAppointmentWithPayment, getCalendarEvents, getPatient } from '../api/client'

const SESSION_TYPES = [
  { value: 'therapy_session', label: 'Therapy Session', icon: Stethoscope },
  { value: 'assessment_session', label: 'Assessment', icon: ClipboardCheck },
  { value: 'consultation', label: 'Consultation', icon: MessageSquare },
  { value: 'follow_up', label: 'Follow-up', icon: RefreshCw },
  { value: 'emergency', label: 'Emergency', icon: AlertTriangle },
]

const SESSION_MODES = [
  { value: 'offline', label: 'In Person', icon: Building, emoji: '🏥' },
  { value: 'online', label: 'Online', icon: Video, emoji: '💻' },
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
  return d.toISOString().split('T')[0]
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

  // Success State
  if (showSuccess) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          style={{ borderRadius: '24px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success-bg">
              <CheckCircle className="h-8 w-8 text-success-text" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-semibold text-content-primary mb-2">Appointment Scheduled</h2>
            <p className="text-content-secondary">
              Session with <span className="font-medium text-content-primary">{form.patientName}</span> on{' '}
              <span className="font-medium text-content-primary">{formatDateDisplay(form.date)}</span> at{' '}
              <span className="font-medium text-content-primary">{form.startTime}</span>
            </p>
          </div>
          <div className="flex gap-3 border-t border-[#F1F5F9] p-5">
            <button
              onClick={onClose}
              className="flex-1 btn-secondary"
            >
              View Calendar
            </button>
            <button
              onClick={handleScheduleAnother}
              className="flex-1 btn-primary"
            >
              <CalendarPlus className="h-4 w-4" strokeWidth={1.5} />
              Schedule Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[800px] max-h-[90vh] bg-white shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200"
        style={{ borderRadius: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F1F5F9] px-7 py-5 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-content-primary">
              {editMode ? 'Edit Appointment' : 'Schedule Session'}
            </h2>
            <p className="text-sm text-content-secondary mt-0.5">
              {editMode ? 'Update the session details below' : 'Create a new appointment'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="flex h-10 w-10 items-center justify-center rounded-[12px] text-content-muted hover:bg-lavender hover:text-content-primary transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-7 py-6">
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-[14px] border border-error-bg bg-error-bg/50 px-4 py-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-error-text mt-0.5" strokeWidth={1.5} />
                <p className="text-sm text-error-text">{error}</p>
              </div>
            )}

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="mb-5 flex items-start gap-3 rounded-[14px] border border-warning-bg bg-warning-bg/50 px-4 py-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning-text mt-0.5" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-warning-text">Scheduling Conflict</p>
                  <p className="text-sm text-warning-text/80 mt-0.5">
                    This time overlaps with {conflicts.length} existing appointment{conflicts.length > 1 ? 's' : ''}.
                    {conflicts[0]?.patient_name && ` (${conflicts[0].patient_name})`}
                  </p>
                </div>
              </div>
            )}

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-5">
              {/* Patient Selection - Full Width */}
              <div className="col-span-2" ref={dropdownRef}>
                <label className="label">
                  <User className="mr-1.5 inline h-4 w-4 text-content-muted" strokeWidth={1.5} />
                  Patient
                </label>
                <div className="relative">
                  {form.patientId ? (
                    <div className="flex items-center justify-between rounded-[12px] border border-[#E2E8F0] bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
                          {form.patientName.charAt(0)}
                        </div>
                        <span className="font-medium text-content-primary">{form.patientName}</span>
                      </div>
                      {/* The update endpoint can't reassign a patient, so don't
                          offer a way to clear/change the selection in edit mode. */}
                      {!editMode && (
                        <button
                          type="button"
                          onClick={() => {
                            selectedPatientIdRef.current = null
                            setPatientLastFee(null)
                            setLastSessionSummary(null)
                            setForm(f => ({ ...f, patientId: '', patientName: '' }))
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-content-muted hover:bg-slate-200 hover:text-content-primary transition-colors"
                        >
                          <X className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" strokeWidth={1.5} />
                        <input
                          ref={searchInputRef}
                          type="text"
                          className="input-field !pl-11"
                          placeholder="Search patients..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setShowPatientDropdown(true)
                          }}
                          onFocus={() => setShowPatientDropdown(true)}
                        />
                      </div>
                      {showPatientDropdown && (
                        <div className="absolute z-20 mt-2 w-full rounded-[16px] border border-[#E8ECF4] bg-white shadow-lg max-h-[280px] overflow-auto">
                          {filteredPatients.length === 0 ? (
                            <div className="p-5 text-center">
                              <p className="text-sm text-content-muted mb-3">No patients found</p>
                              <button
                                type="button"
                                onClick={() => navigate('/patients', { state: { openCreate: true } })}
                                className="inline-flex items-center gap-1.5 rounded-[12px] bg-primary-light px-4 py-2 text-sm font-medium text-primary hover:bg-lavender transition-colors"
                              >
                                <Plus className="h-4 w-4" strokeWidth={1.5} />
                                Create New Patient
                              </button>
                            </div>
                          ) : (
                            <>
                              {filteredPatients.map((patient) => (
                                <button
                                  key={patient.id}
                                  type="button"
                                  onClick={() => handlePatientSelect(patient)}
                                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-lavender/50 transition-colors first:rounded-t-[16px] last:rounded-b-[16px]"
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
                                    {patient.full_name.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-content-primary truncate">{patient.full_name}</span>
                                      {recentPatients.includes(patient.id) && (
                                        <span className="rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-medium text-info-text uppercase tracking-wide">Recent</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-content-muted">{patient.age} years • {patient.gender}</p>
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="label">
                  <Calendar className="mr-1.5 inline h-4 w-4 text-content-muted" strokeWidth={1.5} />
                  Date
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={form.date}
                  onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>

              {/* Start Time */}
              <div>
                <label className="label">
                  <Clock className="mr-1.5 inline h-4 w-4 text-content-muted" strokeWidth={1.5} />
                  Start Time
                </label>
                <input
                  type="time"
                  className="input-field"
                  value={form.startTime}
                  onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))}
                  required
                />
              </div>

              {/* Session Type */}
              <div>
                <label className="label">Session Type</label>
                <div className="relative">
                  <select
                    className="input-field appearance-none cursor-pointer pr-10"
                    value={form.sessionType}
                    onChange={(e) => setForm(f => ({ ...f, sessionType: e.target.value }))}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748B' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 12px center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '20px',
                    }}
                  >
                    {SESSION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Session Mode */}
              <div>
                <label className="label">Session Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {SESSION_MODES.map((mode) => {
                    const Icon = mode.icon
                    const isSelected = form.sessionMode === mode.value
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, sessionMode: mode.value }))}
                        className={`flex items-center justify-center gap-2 rounded-[14px] h-[52px] text-sm font-medium transition-all duration-150 ${
                          isSelected
                            ? 'bg-primary text-white shadow-sm'
                            : 'border border-[#E2E8F0] text-content-secondary hover:border-primary/30 hover:bg-lavender/50'
                        }`}
                      >
                        <span className="text-base">{mode.emoji}</span>
                        {mode.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Duration - Full Width */}
              <div className="col-span-2">
                <label className="label">Duration</label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_CHIPS.map((chip) => {
                    const isSelected = chip.value === null ? customDuration : form.duration === chip.value && !customDuration
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => handleDurationSelect(chip.value)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 ${
                          isSelected
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-slate-100 text-content-secondary hover:bg-lavender'
                        }`}
                      >
                        {chip.label}
                      </button>
                    )
                  })}
                </div>
                {customDuration && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      className="input-field !w-24"
                      value={form.duration}
                      onChange={(e) => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 0 }))}
                      min="15"
                      max="240"
                    />
                    <span className="text-sm text-content-muted">minutes</span>
                  </div>
                )}
              </div>

              {/* Last Session Summary - Full Width. Only appears when the
                  selected patient has a processed transcript session on
                  file — otherwise this space is simply absent. */}
              {lastSessionSummary && (
                <div className="col-span-2">
                  <label className="label">
                    <History className="mr-1.5 inline h-4 w-4 text-content-muted" strokeWidth={1.5} />
                    Last Session Summary
                  </label>
                  <div className="rounded-[14px] border border-[#E8ECF4] bg-slate-50 p-4 space-y-3">
                    <p className="text-xs font-medium text-content-muted">
                      {formatDateDisplay(lastSessionSummary.session_date)}
                    </p>
                    {[
                      ['Presenting Issues', lastSessionSummary.presenting_issues],
                      ['Key Discussion Points', lastSessionSummary.key_discussion_points],
                      ['Emotional Themes', lastSessionSummary.emotional_themes],
                      ['Homework Discussed', lastSessionSummary.homework_discussed],
                    ].filter(([, text]) => text).map(([label, text]) => (
                      <div key={label}>
                        <p className="text-xs font-semibold text-content-secondary mb-0.5">{label}</p>
                        <p className="text-sm text-content-primary">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Section - Full Width */}
              {!editMode && (
                <div className="col-span-2">
                  <div className="rounded-[16px] border border-[#E8ECF4] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowPaymentSection(!showPaymentSection)}
                      className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-4 text-left transition-colors hover:bg-slate-100/80"
                    >
                      <span className="flex items-center gap-2.5 text-sm font-medium text-content-primary">
                        <IndianRupee className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
                        Payment Details
                        {form.sessionFee && (
                          <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success-text">
                            ₹{calculateTotal().total}
                          </span>
                        )}
                      </span>
                      {showPaymentSection ? (
                        <ChevronUp className="h-5 w-5 text-content-muted" strokeWidth={1.5} />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-content-muted" strokeWidth={1.5} />
                      )}
                    </button>
                    
                    {showPaymentSection && (
                      <div className="p-5 space-y-4 bg-white border-t border-[#F1F5F9]">
                        {/* Session Fee */}
                        <div>
                          <label className="label">Session Fee (₹)</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted">₹</span>
                            <input
                              type="number"
                              className="input-field !pl-9"
                              placeholder="e.g., 2000"
                              value={form.sessionFee}
                              onChange={(e) => setForm(f => ({ ...f, sessionFee: e.target.value }))}
                              min="0"
                            />
                          </div>
                          <p className="helper-text">
                            {patientLastFee
                              ? `Defaults to ${form.patientName}'s last session fee — clear it for no payment tracking on this session`
                              : 'Leave empty for no payment tracking'}
                          </p>
                        </div>

                        {/* Discount */}
                        {form.sessionFee && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="label">
                                <Tag className="mr-1.5 inline h-3.5 w-3.5 text-content-muted" strokeWidth={1.5} />
                                Discount (₹)
                              </label>
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted">₹</span>
                                <input
                                  type="number"
                                  className="input-field !pl-9"
                                  placeholder="0"
                                  value={form.discountAmount}
                                  onChange={(e) => setForm(f => ({ ...f, discountAmount: e.target.value }))}
                                  min="0"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="label">Discount Reason</label>
                              <input
                                type="text"
                                className="input-field"
                                placeholder="e.g., First session"
                                value={form.discountReason}
                                onChange={(e) => setForm(f => ({ ...f, discountReason: e.target.value }))}
                              />
                            </div>
                          </div>
                        )}

                        {/* Tax */}
                        {form.sessionFee && (
                          <div className="w-1/2">
                            <label className="label">
                              <Percent className="mr-1.5 inline h-3.5 w-3.5 text-content-muted" strokeWidth={1.5} />
                              Tax (%)
                            </label>
                            <input
                              type="number"
                              className="input-field"
                              placeholder="e.g., 18"
                              value={form.taxPercentage}
                              onChange={(e) => setForm(f => ({ ...f, taxPercentage: e.target.value }))}
                              min="0"
                              max="100"
                            />
                          </div>
                        )}

                        {/* Summary */}
                        {form.sessionFee && (
                          <div className="rounded-[14px] bg-slate-50 p-4 space-y-2">
                            <div className="flex justify-between text-sm text-content-secondary">
                              <span>Session Fee</span>
                              <span>₹{calculateTotal().sessionFee}</span>
                            </div>
                            {calculateTotal().discount > 0 && (
                              <div className="flex justify-between text-sm text-success-text">
                                <span>Discount</span>
                                <span>-₹{calculateTotal().discount}</span>
                              </div>
                            )}
                            {calculateTotal().tax > 0 && (
                              <div className="flex justify-between text-sm text-content-secondary">
                                <span>Tax ({form.taxPercentage}%)</span>
                                <span>₹{calculateTotal().tax}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-semibold text-content-primary pt-2 border-t border-[#E2E8F0]">
                              <span>Total</span>
                              <span>₹{calculateTotal().total}</span>
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

          {/* Sticky Footer */}
          <div className="shrink-0 flex items-center justify-between border-t border-[#F1F5F9] px-7 py-5 bg-white">
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary min-w-[160px]" 
              disabled={loading || checkingConflicts}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  {editMode ? 'Saving...' : 'Scheduling...'}
                </>
              ) : (
                <>
                  <CalendarPlus className="h-4 w-4" strokeWidth={1.5} />
                  {editMode ? 'Save Changes' : 'Schedule Session'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
