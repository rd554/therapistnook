import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Clock, BookOpen, ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
import { getPractitionerByRef, resumeSession } from '../api/client'

const FACTS = [
  { icon: Clock, title: 'Duration', sub: '60–90 minutes typical' },
  { icon: BookOpen, title: '567 items', sub: 'True or false responses' },
  { icon: ShieldCheck, title: 'Confidential', sub: 'Responses are private' },
]

export default function PatientEntry({ onSessionResumed }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const refCode = params.get('ref') || ''

  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [showResume, setShowResume] = useState(false)
  const [resumeCode, setResumeCode] = useState('')
  const [resumeError, setResumeError] = useState('')
  const [resuming, setResuming] = useState(false)

  // Only used to confirm the link is live before showing the form — the
  // response carries no practitioner identity (see Bug 2), and this page
  // never has a patient identity to show either, since the ref link isn't
  // bound to any one patient.
  useEffect(() => {
    if (!refCode) { setInvalid(true); setLoading(false); return }
    ;(async () => {
      try {
        await getPractitionerByRef(refCode)
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
        <Loader2 className="h-8 w-8 animate-spin text-content-muted" />
      </div>
    )
  }

  if (invalid) {
    return (
      <div className="public-card" style={{ textAlign: 'center' }}>
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-content-muted" strokeWidth={1.5} />
        <h1 className="t-h2">Invalid test link</h1>
        <p className="t-body-s mt-2">
          This link is not valid or the practitioner's account has been deactivated.
          Please contact your clinician for a valid link.
        </p>
      </div>
    )
  }

  return (
    <div className="public-card">
      <div className="mb-8 text-center">
        <h1 className="t-h1">MMPI-2 personality assessment</h1>
      </div>

      <div className="card-narrative mb-8">
        <h2 className="t-h3 mb-3">Instructions</h2>
        <div className="t-narrative">
          <p>
            This inventory consists of numbered statements. Read each statement and decide
            whether it is true as applied to you or false as applied to you.
          </p>
          <p className="mt-3">
            Mark True if the statement is true or mostly true as applied to you. Mark False
            if the statement is false or not usually true as applied to you.
          </p>
          <p className="mt-3">
            Give your own opinion of yourself. Do not leave any statements unanswered. Answer
            based on your first thought — the more you think, the more confused you may get.
            Mark based on what applies to you most recently or in the last 6 months.
          </p>
          <p className="mt-3">
            There are no right or wrong answers. The test has built-in validity checks, so
            please answer honestly. No one will see your individual responses — only an
            overall analysis is generated.
          </p>
        </div>
      </div>

      <div className="fact-row mb-8">
        {FACTS.map(({ icon: Icon, title, sub }) => (
          <div key={title} className="fact">
            <span className="icon-badge" aria-hidden="true">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div>
              <p className="fact-title">{title}</p>
              <p className="fact-sub">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => navigate(`/test/intake?ref=${refCode}`)}
        >
          Start assessment
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-lg"
          onClick={() => setShowResume(!showResume)}
        >
          Resume previous
        </button>
      </div>

      {showResume && (
        <form onSubmit={handleResume} className="mt-6" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-5)' }}>
          <label className="field">
            <span>Enter your 6-character resume code</span>
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              className="input flex-1"
              style={{ textAlign: 'center', letterSpacing: '0.2em', fontWeight: 600 }}
              placeholder="ABC123"
              maxLength={6}
              value={resumeCode}
              onChange={(e) => setResumeCode(e.target.value.toUpperCase())}
            />
            <button type="submit" className="btn btn-secondary" disabled={resumeCode.length < 6 || resuming}>
              {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume'}
            </button>
          </div>
          {resumeError && <p className="input-error-text">{resumeError}</p>}
        </form>
      )}
    </div>
  )
}
