import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Calendar } from 'lucide-react'
import { getPatient, updatePatient, getErrorMessage, getFieldErrors } from '../api/client'
import { splitPhone, joinPhone } from '../utils/phone'
import { COUNTRY_CODES } from '../constants/countryCodes'
import { PageLoader } from '../components/ui'

// API-facing field names — also the fieldRefs/fieldErrors keys, so a 422's
// { field: message } map lines up directly with both the visual field order
// (for "focus the first invalid field") and the rendered inputs.
const FIELD_ORDER = [
  'full_name', 'date_of_birth', 'gender', 'phone',
  'email', 'emergency_contact', 'referral_source', 'address',
]

const EMPTY_FORM = {
  full_name: '', date_of_birth: '', gender: '',
  phone_code: '', phone_local: '', email: '',
  emergency_contact: '', referral_source: '', address: '',
}

function toForm(patient) {
  const { code, local } = splitPhone(patient.phone)
  return {
    full_name: patient.full_name || '',
    date_of_birth: patient.date_of_birth || '',
    gender: patient.gender || '',
    phone_code: code,
    phone_local: local,
    email: patient.email || '',
    emergency_contact: patient.emergency_contact || '',
    referral_source: patient.referral_source || '',
    address: patient.address || '',
  }
}

function serialize(f) {
  return {
    full_name: f.full_name.trim(),
    date_of_birth: f.date_of_birth,
    gender: f.gender,
    phone: joinPhone(f.phone_code, f.phone_local) || null,
    email: f.email.trim() || null,
    emergency_contact: f.emergency_contact.trim() || null,
    referral_source: f.referral_source.trim() || null,
    address: f.address.trim() || null,
  }
}

function validate(f) {
  const errors = {}
  if (!f.full_name.trim()) errors.full_name = 'Full name is required.'
  if (!f.date_of_birth) errors.date_of_birth = 'Date of birth is required.'
  if (!f.gender) errors.gender = 'Gender is required.'
  return errors
}

export default function PatientEdit() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const profileUrl = `/patients/${patientId}`
  const focusTarget = useMemo(() => searchParams.get('focus'), [searchParams])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [patientName, setPatientName] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [toast, setToast] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const fieldRefs = useRef({})
  const alertRef = useRef(null)
  const keepEditingRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getPatient(patientId)
        if (cancelled) return
        const next = toForm(data)
        setForm(next)
        setInitialForm(next)
        setPatientName(data.full_name || '')
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [patientId])

  // Runs once the form has actually mounted (refs only attach after
  // `loading` flips false), so the "Add" links on the profile screen
  // (?focus=email / emergency_contact / address) land on the right field.
  useEffect(() => {
    if (!loading && focusTarget && fieldRefs.current[focusTarget]) {
      fieldRefs.current[focusTarget].focus()
    }
  }, [loading, focusTarget])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (showConfirm) keepEditingRef.current?.focus()
  }, [showConfirm])

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm])
  const errorCount = Object.keys(fieldErrors).length
  const formStatusText = errorCount > 0
    ? `${errorCount} field${errorCount > 1 ? 's' : ''} need${errorCount > 1 ? '' : 's'} attention`
    : (isDirty ? 'Unsaved changes' : '')

  function setField(name, value) {
    setForm(f => ({ ...f, [name]: value }))
    setFieldErrors(errs => {
      if (!errs[name]) return errs
      const next = { ...errs }
      delete next[name]
      return next
    })
  }

  function setFieldRef(name) {
    return (el) => { fieldRefs.current[name] = el }
  }

  function focusFirstError(errs) {
    const first = FIELD_ORDER.find(k => errs[k])
    if (first && fieldRefs.current[first]) {
      fieldRefs.current[first].focus()
    } else {
      alertRef.current?.focus()
    }
  }

  function attemptLeave() {
    if (isDirty) {
      setShowConfirm(true)
    } else {
      navigate(profileUrl)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validate(form)
    if (Object.keys(errors).length > 0) {
      setServerError('')
      setFieldErrors(errors)
      focusFirstError(errors)
      return
    }
    setSaving(true)
    setServerError('')
    setFieldErrors({})
    try {
      await updatePatient(patientId, serialize(form))
      setToast('Patient updated')
      setTimeout(() => navigate(profileUrl), 900)
    } catch (err) {
      setSaving(false)
      const errs = getFieldErrors(err)
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs)
        focusFirstError(errs)
      } else {
        setServerError(getErrorMessage(err))
        alertRef.current?.focus()
      }
    }
  }

  if (loading) return <PageLoader />

  if (loadError) {
    return (
      <div className="clinical-ink max-w-[1120px]">
        <div className="empty">
          <p className="empty-title">Couldn&rsquo;t load this patient</p>
          <p className="empty-body">{loadError}</p>
          <Link to="/patients" className="btn btn-secondary">Back to patients</Link>
        </div>
      </div>
    )
  }

  const alertMessage = errorCount > 0
    ? `${errorCount} field${errorCount > 1 ? 's' : ''} need${errorCount > 1 ? '' : 's'} attention.`
    : serverError

  return (
    <div className="clinical-ink max-w-[1120px]">
      {/* Desktop header — matches the profile screen's back+title treatment
          exactly. No right-hand action group here: unlike Overview (primary
          action + section switcher), this screen's only primary action is
          Save, which lives in the sticky .form-actions bar, not the header —
          putting it in both places would double-count against the 2-object
          desktop accent budget (nav + Save changes). */}
      <div className="hidden sm:block">
        <div className="profile-head">
          <div className="profile-id">
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patient" title="Back to patient" onClick={attemptLeave}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="profile-name">
              <h1 className="t-h1">Edit patient</h1>
              <span className="t-body-s">{patientName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-7)' }}>
        <div className="profile-id">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patient" onClick={attemptLeave}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="profile-name">
            <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>Edit patient</h1>
            <span className="t-body-s">{patientName}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="card form-card">
          {alertMessage && (
            <div
              className="alert alert-error"
              role="alert"
              aria-live="polite"
              tabIndex={-1}
              ref={alertRef}
              style={{ marginBottom: 'var(--space-5)' }}
            >
              <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
              <span>{alertMessage}</span>
            </div>
          )}

          <div className="form-grid">
            <div>
              <div className="field-head">
                <label htmlFor="full_name">Full name</label>
              </div>
              <input
                id="full_name"
                ref={setFieldRef('full_name')}
                type="text"
                className="input"
                required
                aria-required="true"
                aria-invalid={fieldErrors.full_name ? 'true' : undefined}
                value={form.full_name}
                onChange={(e) => setField('full_name', e.target.value)}
              />
              {fieldErrors.full_name && <p className="input-error-text">{fieldErrors.full_name}</p>}
            </div>

            <div>
              <div className="field-head">
                <label htmlFor="date_of_birth">Date of birth</label>
              </div>
              <div className="date-field">
                <input
                  id="date_of_birth"
                  ref={setFieldRef('date_of_birth')}
                  type="date"
                  className="input"
                  required
                  aria-required="true"
                  aria-invalid={fieldErrors.date_of_birth ? 'true' : undefined}
                  max={new Date().toISOString().split('T')[0]}
                  value={form.date_of_birth}
                  onChange={(e) => setField('date_of_birth', e.target.value)}
                />
                <Calendar size={16} strokeWidth={1.5} className="date-field-icon" aria-hidden="true" />
              </div>
              {fieldErrors.date_of_birth && <p className="input-error-text">{fieldErrors.date_of_birth}</p>}
            </div>

            <div>
              <div className="field-head">
                <label htmlFor="gender">Gender</label>
              </div>
              <select
                id="gender"
                ref={setFieldRef('gender')}
                className="select"
                required
                aria-required="true"
                aria-invalid={fieldErrors.gender ? 'true' : undefined}
                value={form.gender}
                onChange={(e) => setField('gender', e.target.value)}
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {fieldErrors.gender && <p className="input-error-text">{fieldErrors.gender}</p>}
            </div>

            <div>
              <div className="field-head">
                <label htmlFor="phone_local">Phone</label>
                <span className="field-optional">Optional</span>
              </div>
              <div className="input-group">
                <select
                  className="select"
                  aria-label="Country code"
                  value={form.phone_code}
                  onChange={(e) => setField('phone_code', e.target.value)}
                >
                  <option value="">—</option>
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                  ))}
                </select>
                <input
                  id="phone_local"
                  ref={setFieldRef('phone')}
                  type="tel"
                  className="input"
                  placeholder="Phone number"
                  aria-invalid={fieldErrors.phone ? 'true' : undefined}
                  value={form.phone_local}
                  onChange={(e) => setField('phone_local', e.target.value)}
                />
              </div>
              {fieldErrors.phone && <p className="input-error-text">{fieldErrors.phone}</p>}
            </div>

            <div>
              <div className="field-head">
                <label htmlFor="email">Email</label>
                <span className="field-optional">Optional</span>
              </div>
              <input
                id="email"
                ref={setFieldRef('email')}
                type="email"
                className="input"
                placeholder="patient@example.com"
                aria-invalid={fieldErrors.email ? 'true' : undefined}
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
              {fieldErrors.email && <p className="input-error-text">{fieldErrors.email}</p>}
            </div>

            <div>
              <div className="field-head">
                <label htmlFor="emergency_contact">Emergency contact</label>
                <span className="field-optional">Optional</span>
              </div>
              <input
                id="emergency_contact"
                ref={setFieldRef('emergency_contact')}
                type="text"
                className="input"
                placeholder="Name – phone"
                aria-invalid={fieldErrors.emergency_contact ? 'true' : undefined}
                value={form.emergency_contact}
                onChange={(e) => setField('emergency_contact', e.target.value)}
              />
              {fieldErrors.emergency_contact && <p className="input-error-text">{fieldErrors.emergency_contact}</p>}
            </div>

            <div className="span-2">
              <div className="field-head">
                <label htmlFor="referral_source">Referral source</label>
                <span className="field-optional">Optional</span>
              </div>
              <input
                id="referral_source"
                ref={setFieldRef('referral_source')}
                type="text"
                className="input"
                aria-invalid={fieldErrors.referral_source ? 'true' : undefined}
                value={form.referral_source}
                onChange={(e) => setField('referral_source', e.target.value)}
              />
              {fieldErrors.referral_source && <p className="input-error-text">{fieldErrors.referral_source}</p>}
            </div>

            <div className="span-2">
              <div className="field-head">
                <label htmlFor="address">Billing address</label>
                <span className="field-optional">Optional</span>
              </div>
              <textarea
                id="address"
                ref={setFieldRef('address')}
                className="textarea"
                rows={3}
                aria-invalid={fieldErrors.address ? 'true' : undefined}
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
              />
              <p className="field-hint">Appears in the Bill to section of invoice PDFs.</p>
              {fieldErrors.address && <p className="input-error-text">{fieldErrors.address}</p>}
            </div>
          </div>
        </div>

        <div className="form-actions">
          {formStatusText && (
            <span className="form-status t-caption" style={errorCount > 0 ? { color: 'var(--error)' } : undefined}>
              {formStatusText}
            </span>
          )}
          <button type="button" className="btn btn-secondary" onClick={attemptLeave}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!isDirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-changes-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setShowConfirm(false) }}
          >
            <h3 id="discard-changes-title" className="modal-title">Unsaved changes</h3>
            <p className="modal-body">Leaving now will discard the changes you&rsquo;ve made to this patient.</p>
            <div className="modal-actions">
              <button type="button" ref={keepEditingRef} className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                Keep editing
              </button>
              <button type="button" className="btn btn-danger" onClick={() => navigate(profileUrl)}>
                Discard changes
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast toast-wrap" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
