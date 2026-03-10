import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, RotateCcw, BookOpen, ShieldCheck, Clock, Loader2, AlertCircle } from 'lucide-react'
import { getPractitionerByRef, resumeSession } from '../api/client'

export default function PatientEntry({ onSessionResumed }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const refCode = params.get('ref') || ''

  const [pracName, setPracName] = useState('')
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [showResume, setShowResume] = useState(false)
  const [resumeCode, setResumeCode] = useState('')
  const [resumeError, setResumeError] = useState('')
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    if (!refCode) { setInvalid(true); setLoading(false); return }
    (async () => {
      try {
        const data = await getPractitionerByRef(refCode)
        setPracName(data.name)
      } catch {
        setInvalid(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [refCode])

  const handleResume = async (e) => {
    e.preventDefault()
    if (!resumeCode.trim()) return
    setResuming(true)
    setResumeError('')
    try {
      const session = await resumeSession(resumeCode.trim())
      onSessionResumed(session)
      navigate('/test/questions')
    } catch (err) {
      setResumeError(err.response?.data?.detail || 'Could not resume session')
    } finally {
      setResuming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (invalid) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
        <h1 className="text-xl font-bold text-gray-800">Invalid Test Link</h1>
        <p className="mt-2 text-gray-500">
          This link is not valid or the practitioner's account has been deactivated.
          Please contact your clinician for a valid link.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100">
            <BookOpen className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">MMPI-2 Personality Assessment</h1>
          <p className="mt-2 text-gray-500">
            Administered by <strong className="text-gray-700">{pracName}</strong>
          </p>
        </div>

        <div className="mb-8 rounded-xl bg-blue-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Instructions</h2>
          <div className="space-y-3 text-sm leading-relaxed text-gray-700">
            <p>
              This inventory consists of numbered statements. Read each statement and decide
              whether it is <strong>true as applied to you</strong> or <strong>false as applied to you</strong>.
            </p>
            <p>
              Mark <strong>True</strong> if the statement is true or mostly true as applied to you.
              Mark <strong>False</strong> if the statement is false or not usually true as applied to you.
            </p>
            <p>
              Give <strong>your own opinion</strong> of yourself. Do not leave any statements unanswered.
              Answer based on your <strong>first thought</strong> — the more you think, the more confused you may get.
              Mark based on what applies to you <strong>most recently or in the last 6 months</strong>.
            </p>
            <p>
              There are no "right" or "wrong" answers. The test has built-in validity checks, so please answer honestly.
              No one will see your individual responses — only an overall analysis is generated.
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Duration</p>
              <p className="text-xs text-gray-500">60 – 90 minutes typical</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
              <BookOpen className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">567 Items</p>
              <p className="text-xs text-gray-500">True or False responses</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Confidential</p>
              <p className="text-xs text-gray-500">Responses are private</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <button onClick={() => navigate(`/test/intake?ref=${refCode}`)} className="btn-primary text-base">
            Start New Assessment
            <ArrowRight className="h-5 w-5" />
          </button>
          <button onClick={() => setShowResume(!showResume)} className="btn-secondary text-base">
            <RotateCcw className="h-5 w-5" />
            Resume Previous
          </button>
        </div>

        {showResume && (
          <form onSubmit={handleResume} className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Enter your 6-character resume code
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                className="input-field flex-1 text-center text-lg font-mono tracking-widest uppercase"
                placeholder="ABC123"
                maxLength={6}
                value={resumeCode}
                onChange={(e) => setResumeCode(e.target.value.toUpperCase())}
              />
              <button type="submit" className="btn-primary" disabled={resumeCode.length < 6 || resuming}>
                {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume'}
              </button>
            </div>
            {resumeError && (
              <p className="mt-2 text-sm text-red-600">{resumeError}</p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
