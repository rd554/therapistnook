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

  // Auto-grow textarea
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

  const isToday = noteDate === toDateInputValue(new Date())

  return (
    <section className="dash-section">
      <div className="dash-section__heading">
        <div className="dash-section__heading-left">
          <h2 className="dash-section__title">Therapist&apos;s Note</h2>
          {!isToday && (
            <span className="dash-section__badge">{formatNoteDate(noteDate)}</span>
          )}
        </div>
        {saveState === 'saving' && (
          <span className="text-caption text-content-muted">Saving…</span>
        )}
        {saveState === 'saved' && (
          <span className="text-caption text-content-muted">Saved</span>
        )}
      </div>

      <div className="dash-note-card">
        <div ref={pickerRef}>
          <button
            type="button"
            className="dash-note-card__picker"
            onClick={() => setShowPicker((v) => !v)}
            aria-label="Pick note date"
          >
            <Clock size={18} strokeWidth={1.75} />
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

        {loading ? (
          <p className="text-secondary" style={{ fontSize: 14 }}>Loading note…</p>
        ) : (
          <textarea
            ref={textareaRef}
            className="dash-note-card__textarea"
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
