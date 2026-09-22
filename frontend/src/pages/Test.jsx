import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, AlertCircle, Key } from 'lucide-react'
import { getQuestions, saveAnswers, getAnswers, finishSession } from '../api/client'

const TOTAL_QUESTIONS = 567
const PER_PAGE = 20

export default function Test({ sessionId, resumeCode }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [questions, setQuestions] = useState([])
  const [totalPages, setTotalPages] = useState(1)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState('')
  const [loadingPage, setLoadingPage] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [showUnanswered, setShowUnanswered] = useState(false)
  const topRef = useRef(null)

  const totalAnswered = Object.keys(answers).length
  const allDone = totalAnswered >= TOTAL_QUESTIONS

  useEffect(() => {
    if (!sessionId) return
    ;(async () => {
      try {
        const existing = await getAnswers(sessionId)
        const parsed = {}
        for (const [k, v] of Object.entries(existing)) {
          parsed[parseInt(k)] = v
        }
        setAnswers(parsed)
        // Jump to first unanswered page
        const count = Object.keys(parsed).length
        if (count > 0 && count < TOTAL_QUESTIONS) {
          for (let i = 1; i <= Math.ceil(TOTAL_QUESTIONS / PER_PAGE); i++) {
            const start = (i - 1) * PER_PAGE + 1
            const end = Math.min(i * PER_PAGE, TOTAL_QUESTIONS)
            let allAnswered = true
            for (let q = start; q <= end; q++) {
              if (parsed[q] === undefined) { allAnswered = false; break }
            }
            if (!allAnswered) { setPage(i); break }
          }
        }
      } catch { /* fresh start */ }
    })()
  }, [sessionId])

  const fetchPage = useCallback(async (p) => {
    setLoadingPage(true)
    try {
      const data = await getQuestions(p, PER_PAGE)
      setQuestions(data.questions)
      setTotalPages(data.total_pages)
    } catch {
      setError('Failed to load questions. Is the backend running?')
    } finally {
      setLoadingPage(false)
    }
  }, [])

  useEffect(() => { fetchPage(page) }, [page, fetchPage])

  const handleAnswer = (qNum, value) => {
    setAnswers(prev => ({ ...prev, [qNum]: value }))
    setShowUnanswered(false)
  }

  const currentPageAnswers = () => {
    return questions
      .filter(q => answers[q.number] !== undefined)
      .map(q => ({ question_number: q.number, response: answers[q.number] }))
  }

  const autoSave = async () => {
    const batch = currentPageAnswers()
    if (batch.length === 0) return
    setSaving(true)
    setSaveStatus('')
    try {
      await saveAnswers(sessionId, batch)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const goToPage = async (newPage) => {
    setShowUnanswered(false)
    await autoSave()
    setPage(newPage)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleNext = () => {
    if (pageAnsweredCount < questions.length) {
      setShowUnanswered(true)
      return
    }
    goToPage(page + 1)
  }

  const handleFinish = async () => {
    await autoSave()
    setScoring(true)
    setError('')
    try {
      await finishSession(sessionId)
      localStorage.removeItem('mmpi_patient_session')
      navigate('/test/complete')
    } catch (err) {
      setError(err.response?.data?.detail || 'Scoring failed')
    } finally {
      setScoring(false)
    }
  }

  const pageAnsweredCount = questions.filter(q => answers[q.number] !== undefined).length
  const isLastPage = page === totalPages
  const progressPct = Math.round((totalAnswered / TOTAL_QUESTIONS) * 100)

  const firstUnansweredPage = () => {
    for (let i = 1; i <= totalPages; i++) {
      const start = (i - 1) * PER_PAGE + 1
      const end = Math.min(i * PER_PAGE, TOTAL_QUESTIONS)
      for (let q = start; q <= end; q++) {
        if (answers[q] === undefined) return i
      }
    }
    return totalPages
  }

  if (!sessionId) {
    return (
      <div className="py-16 text-center t-body-s">
        No active session. Please start from the test link provided by your practitioner.
      </div>
    )
  }

  return (
    <div ref={topRef} className="mx-auto max-w-3xl">
      {resumeCode && (
        <div className="alert alert-info mb-4">
          <Key className="h-4 w-4 shrink-0" />
          <p>
            Your resume code: <strong>{resumeCode}</strong> — save this to continue later.
          </p>
        </div>
      )}

      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <span className="t-body-s">
            {totalAnswered} / {TOTAL_QUESTIONS} answered
          </span>
        </div>
        <div className="progress mt-2">
          <span className="progress-bar is-neutral" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="page-grid mt-3">
          {Array.from({ length: totalPages }, (_, i) => {
            const p = i + 1
            const start = (p - 1) * PER_PAGE + 1
            const end = Math.min(p * PER_PAGE, TOTAL_QUESTIONS)
            let answeredInPage = 0
            for (let q = start; q <= end; q++) {
              if (answers[q] !== undefined) answeredInPage++
            }
            const pageTotal = end - start + 1
            const complete = answeredInPage === pageTotal
            return (
              <button
                key={p} onClick={() => goToPage(p)}
                className={`page-cell ${p === page ? 'is-current' : complete ? 'is-answered' : ''}`}
                title={`Page ${p}: ${answeredInPage}/${pageTotal}`}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="card card-flush">
        <div className="flex items-center justify-between" style={{ padding: 'var(--space-4)', borderBottom: 'var(--border-width) solid var(--hairline)' }}>
          <h2 className="t-h4">Page {page} of {totalPages}</h2>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveStatus === 'saved' && <span className="t-caption">Saved</span>}
            {saveStatus === 'error' && <span className="status-warn">Save failed</span>}
          </div>
        </div>

        {loadingPage ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div>
            {questions.map((q) => {
              const answered = answers[q.number]
              const unanswered = answered === undefined
              return (
                <div key={q.number} className={`q-row ${showUnanswered && unanswered ? 'is-unanswered' : ''}`}>
                  <span className="q-num">{q.number}</span>
                  <p className="q-text">{q.text}</p>
                  <div className="seg">
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        className="seg-option"
                        aria-pressed={answered === val}
                        onClick={() => handleAnswer(q.number, val)}
                      >
                        {val ? 'True' : 'False'}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="q-nav">
        <button onClick={() => goToPage(page - 1)} disabled={page <= 1} className="btn btn-secondary">
          Previous
        </button>
        <span className={pageAnsweredCount < questions.length ? 'status-warn' : 't-caption'}>
          {pageAnsweredCount}/{questions.length} on this page
        </span>
        {isLastPage ? (
          <button
            onClick={handleFinish} disabled={!allDone || scoring} className="btn btn-primary"
            title={allDone ? 'Submit' : `${TOTAL_QUESTIONS - totalAnswered} remaining`}
          >
            {scoring ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> Finish</>
            )}
          </button>
        ) : (
          <button onClick={handleNext} className="btn btn-primary">
            Next
          </button>
        )}
      </div>

      {!allDone && isLastPage && (
        <div className="alert alert-warn mt-4">
          {TOTAL_QUESTIONS - totalAnswered} unanswered items remain.
          <button className="btn btn-ghost btn-sm" onClick={() => goToPage(firstUnansweredPage())}>
            Go to first unanswered
          </button>
        </div>
      )}
    </div>
  )
}
