import { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { getTherapistNote, saveTherapistNote } from '../../api/client'

function toDateInputValue(d) {
  const date = d instanceof Date ? d : new Date(d)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatNoteDate(dateStr) {
  const today = toDateInputValue(new Date())
  if (dateStr === today) return 'Today'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function TherapistNote() {
  const [noteDate, setNoteDate] = useState(() => toDateInputValue(new Date()))
  const isToday = noteDate === toDateInputValue(new Date())
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [showPicker, setShowPicker] = useState(false)
  const debounceRef = useRef(null)
  const pickerRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getTherapistNote(noteDate)
      .then((res) => {
        if (!cancelled) {
          setContent(res?.content || '')
          setSaveState('idle')
        }
      })
      .catch(() => {
        if (!cancelled) setContent('')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [noteDate])

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  // Auto-grow textarea. Math.max(120, ...) is the only 120px floor left —
  // the old .dash-note-card__textarea CSS rule that used to set
  // min-height:120px was deleted with the rest of that class (replaced by
  // tokens.css's .t-narrative, which has no min-height opinion).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(120, el.scrollHeight)}px`
  }, [content, loading])

  const persist = (value, date) => {
    setSaveState('saving')
    saveTherapistNote({ date, content: value })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('idle'))
  }

  const handleChange = (e) => {
    const value = e.target.value
    setContent(value)
    setSaveState('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => persist(value, noteDate), 1200)
  }

  const handleDatePick = (e) => {
    const next = e.target.value
    if (!next) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setNoteDate(next)
    setShowPicker(false)
  }

  return (
    <section>
      {/* .card-narrative (design system §C): the note shares --paper with the
          prototype's "Clinical summary" card — the only two blocks of human
          language on the screen, on a surface operational chrome never uses.
          No second card-narrative added above it: the prototype's "Clinical
          summary" is per-patient content with no confirmed backend source
          yet, so this stays the one card until that data exists. */}
      <div className="card-narrative" style={{ position: 'relative' }}>
        <div ref={pickerRef}>
          <button
            type="button"
            className="dash-note-card__picker"
            onClick={() => setShowPicker((v) => !v)}
            aria-label="Pick note date"
          >
            <Clock size={16} strokeWidth={1.75} />
          </button>
          {showPicker && (
            <div className="dash-note-card__popover">
              <input
                type="date"
                value={noteDate}
                max={toDateInputValue(new Date())}
                onChange={handleDatePick}
                aria-label="Note date"
              />
            </div>
          )}
        </div>

        {/* paddingRight on both lines clears the absolutely-positioned picker
            button (32px wide, 16px from the edge) — the caption is the one
            at risk: a non-today date plus " · Saving…" runs noticeably
            longer than the title in this narrow rail. */}
        <h2 className="t-h3" style={{ marginBottom: 4, paddingRight: 40 }}>Therapist&apos;s note</h2>
        <div className="t-caption" style={{ marginBottom: 12, paddingRight: 40 }}>
          {formatNoteDate(noteDate)}
          {saveState === 'saving' && ' · Saving…'}
          {saveState === 'saved' && ' · Saved'}
        </div>

        {loading ? (
          <p className="t-narrative" style={{ color: 'var(--text-muted)' }}>Loading note…</p>
        ) : (
          <textarea
            ref={textareaRef}
            className="t-narrative"
            style={{ display: 'block', width: '100%', border: 'none', outline: 'none', background: 'transparent', resize: 'none' }}
            placeholder={isToday ? "What's on your mind today…" : 'Note for this day…'}
            value={content}
            onChange={handleChange}
            rows={4}
          />
        )}
      </div>
    </section>
  )
}
