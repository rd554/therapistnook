import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserCircle, Loader2, Check, Copy } from 'lucide-react'
import { createPatientSession } from '../api/client'
import { copyToClipboard } from '../utils/clipboard'

const EDUCATION_OPTIONS = [
  'Less than high school',
  'High school / GED',
  'Some college',
  "Associate's degree",
  "Bachelor's degree",
  "Master's degree",
  'Doctoral degree (PhD/PsyD/MD)',
  'Professional degree (JD/MBA)',
]

function computeAge(dobStr) {
  if (!dobStr) return null
  const dob = new Date(dobStr)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--
  return age
}

export default function IntakeForm({ onSessionCreated }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const refCode = params.get('ref') || ''

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resumeCode, setResumeCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    name: '',
    dob: '',
    gender: '',
    nationality: '',
    education: '',
  })

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const age = useMemo(() => computeAge(form.dob), [form.dob])
  const isValid = form.name.trim() && form.dob && age >= 18 && form.gender && form.nationality.trim() && form.education
  const today = new Date().toISOString().split('T')[0]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      const session = await createPatientSession({ ...form, ref_code: refCode })
      setResumeCode(session.resume_code)
      onSessionCreated(session)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create session. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const copyCode = async () => {
    const ok = await copyToClipboard(resumeCode)
    setCopied(ok)
    setToast(ok ? 'Resume code copied' : 'Could not copy — select and copy manually')
    if (ok) setTimeout(() => setCopied(false), 2000)
  }

  if (resumeCode) {
    return (
      <div className="public-card" style={{ textAlign: 'center', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
        <span className="icon-badge" style={{ width: 48, height: 48, margin: '0 auto var(--space-4)' }} aria-hidden="true">
          <Check className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h2 className="t-h2">Session created</h2>
        <p className="t-body-s mt-2">Save this code to resume your assessment if you take a break.</p>

        <div className="code-display mt-6" style={{ maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
          <p className="code-label">Your resume code</p>
          <p className="code-value">{resumeCode}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={copyCode}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <p className="t-caption mt-4">Write this down or take a screenshot. You'll need it to resume later.</p>

        <button
          type="button"
          onClick={() => navigate('/test/questions')}
          className="btn btn-primary btn-lg mt-6"
        >
          Begin assessment
        </button>

        {toast && (
          <div className="toast toast-wrap" role="status" aria-live="polite" style={{ marginTop: 'var(--space-4)' }}>
            {toast}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="public-card" style={{ maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
      <div className="mb-6 flex items-center gap-3">
        <span className="icon-badge" aria-hidden="true">
          <UserCircle className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="t-h2">Patient information</h1>
          <p className="t-body-s">All fields are required to begin the assessment</p>
        </div>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Full name</label>
          <input
            type="text" className="input" placeholder="Enter full name"
            value={form.name} onChange={(e) => update('name', e.target.value)}
          />
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Date of birth</label>
            <input
              type="date" className="input" max={today}
              value={form.dob} onChange={(e) => update('dob', e.target.value)}
            />
            {form.dob && age !== null && (
              <p className="field-hint" style={age < 18 ? { color: 'var(--error)' } : undefined}>
                {age >= 18 ? `Age: ${age} years` : `Age: ${age} — must be at least 18 years old`}
              </p>
            )}
          </div>
          <div className="field">
            <label>Gender</label>
            <div className="seg" style={{ width: '100%' }}>
              {['Male', 'Female'].map((g) => (
                <button
                  key={g} type="button"
                  className="seg-option" style={{ flex: 1 }}
                  aria-pressed={form.gender === g}
                  onClick={() => update('gender', g)}
                >
                  {g}
                </button>
              ))}
            </div>
            <p className="field-hint">Used for norm comparison</p>
          </div>
        </div>

        <div className="field">
          <label>Nationality</label>
          <input
            type="text" className="input" placeholder="e.g. American"
            value={form.nationality} onChange={(e) => update('nationality', e.target.value)}
          />
        </div>

        <div className="field">
          <label>Highest education</label>
          <select className="select" value={form.education} onChange={(e) => update('education', e.target.value)}>
            <option value="">Select education level</option>
            {EDUCATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-primary btn-lg btn-block mt-2" disabled={!isValid || loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating session…</> : 'Continue'}
        </button>
      </form>
    </div>
  )
}
