import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertCircle, Save, Key,
} from 'lucide-react'
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
    await autoSave()
    setPage(newPage)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
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
      <div className="py-16 text-center text-gray-500">
        No active session. Please start from the test link provided by your practitioner.
      </div>
    )
  }

  return (
    <div ref={topRef} className="mx-auto max-w-3xl">
      {/* Resume code reminder */}
      {resumeCode && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
          <Key className="h-4 w-4 shrink-0 text-primary-500" />
          <p className="text-xs text-primary-700">
            Your resume code: <strong className="font-mono tracking-widest">{resumeCode}</strong> — save this to continue later.
          </p>
        </div>
      )}

      {/* Progress Bar */}
      <div className="card mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-600">
            Progress: {totalAnswered} / {TOTAL_QUESTIONS} answered
          </span>
          <span className="font-bold text-primary-600">{progressPct}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
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
            const partial = answeredInPage > 0 && !complete
            return (
              <button
                key={p} onClick={() => goToPage(p)}
                className={`h-7 w-7 rounded text-[10px] font-bold transition-colors ${
                  p === page
                    ? 'bg-primary-600 text-white'
                    : complete ? 'bg-green-100 text-green-700'
                    : partial ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={`Page ${p}: ${answeredInPage}/${pageTotal}`}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Questions */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Page {page} of {totalPages}</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-green-600"><Save className="h-3.5 w-3.5" /> Saved</span>
            )}
            {saveStatus === 'error' && <span className="text-red-500">Save failed</span>}
          </div>
        </div>

        {loadingPage ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => {
              const answered = answers[q.number]
              return (
                <div
                  key={q.number}
                  className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                    answered !== undefined
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                    {q.number}
                  </span>
                  <p className="flex-1 pt-0.5 text-sm leading-relaxed text-gray-800">{q.text}</p>
                  <div className="flex shrink-0 gap-2">
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        onClick={() => handleAnswer(q.number, val)}
                        className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                          answered === val
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'border border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-600'
                        }`}
                      >
                        {val ? 'TRUE' : 'FALSE'}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <button onClick={() => goToPage(page - 1)} disabled={page <= 1} className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>
          <span className="text-xs text-gray-400">{pageAnsweredCount}/{questions.length} on this page</span>
          {isLastPage ? (
            <button
              onClick={handleFinish} disabled={!allDone || scoring} className="btn-primary"
              title={allDone ? 'Submit' : `${TOTAL_QUESTIONS - totalAnswered} remaining`}
            >
              {scoring ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> Finish</>
              )}
            </button>
          ) : (
            <button onClick={() => goToPage(page + 1)} className="btn-primary">
              Next <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {!allDone && isLastPage && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-center text-xs text-amber-700">
            {TOTAL_QUESTIONS - totalAnswered} unanswered items remain.
            <button className="ml-2 font-bold underline" onClick={() => goToPage(firstUnansweredPage())}>
              Go to first unanswered
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
