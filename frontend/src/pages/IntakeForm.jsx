import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserCircle, ArrowRight, Loader2, Calendar, Copy, Check } from 'lucide-react'
import { createPatientSession } from '../api/client'

const EDUCATION_OPTIONS = [
  'Less than High School',
  'High School / GED',
  'Some College',
  "Associate's Degree",
  "Bachelor's Degree",
  "Master's Degree",
  'Doctoral Degree (PhD/PsyD/MD)',
  'Professional Degree (JD/MBA)',
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
  const [form, setForm] = useState({
    name: '',
    dob: '',
    gender: '',
    nationality: '',
    education: '',
  })

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
    await navigator.clipboard.writeText(resumeCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (resumeCode) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Session Created</h2>
          <p className="mt-2 text-gray-500">Save this code to resume your assessment if you take a break.</p>

          <div className="mx-auto mt-6 max-w-xs rounded-xl border-2 border-dashed border-primary-300 bg-primary-50 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-primary-500">Your Resume Code</p>
            <p className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-primary-700">
              {resumeCode}
            </p>
            <button onClick={copyCode} className="mt-3 flex items-center gap-1.5 mx-auto text-xs font-medium text-primary-600 hover:text-primary-700">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Code</>}
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Write this down or take a screenshot. You'll need it to resume later.
          </p>

          <button
            onClick={() => navigate('/test/questions')}
            className="btn-primary mt-6 text-base"
          >
            Begin Assessment
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
            <UserCircle className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patient Information</h1>
            <p className="text-sm text-gray-500">All fields are required to begin the assessment</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text" className="input-field" placeholder="Enter full name"
              value={form.name} onChange={(e) => update('name', e.target.value)}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  Date of Birth
                </span>
              </label>
              <input
                type="date" className="input-field" max={today}
                value={form.dob} onChange={(e) => update('dob', e.target.value)}
              />
              {form.dob && age !== null && (
                <p className={`mt-1.5 text-xs ${age >= 18 ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                  {age >= 18 ? `Age: ${age} years` : `Age: ${age} — must be at least 18 years old`}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Gender <span className="text-xs text-gray-400">(used for norm comparison)</span>
              </label>
              <div className="flex gap-3 pt-1">
                {['Male', 'Female'].map((g) => (
                  <button
                    key={g} type="button" onClick={() => update('gender', g)}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                      form.gender === g
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nationality</label>
            <input
              type="text" className="input-field" placeholder="e.g. American"
              value={form.nationality} onChange={(e) => update('nationality', e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Highest Education</label>
            <select className="input-field" value={form.education} onChange={(e) => update('education', e.target.value)}>
              <option value="">Select education level</option>
              {EDUCATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="pt-2">
            <button type="submit" className="btn-primary w-full" disabled={!isValid || loading}>
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Creating Session...</>
              ) : (
                <><ArrowRight className="h-5 w-5" /> Continue</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
