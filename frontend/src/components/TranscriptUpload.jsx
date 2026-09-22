import { useState, useRef, useCallback, useEffect } from 'react'
import { X, FileText, Upload } from 'lucide-react'
import { uploadTherapySessionTranscript, uploadTherapySessionTranscriptFile } from '../api/client'

// Local (not UTC) "yyyy-MM-ddTHH:mm" for a <input type="datetime-local">
// default — new Date().toISOString() is UTC, which shows the wrong time to
// anyone not in UTC (e.g. 4:04pm IST rendered as 10:34am).
function toLocalDateTimeInputValue(date) {
  const tzOffsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function validateFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `Unsupported type — use ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`
  if (file.size > MAX_FILE_SIZE) return 'File too large'
  return null
}

// Reuses the same modal shell, .dropzone and .file-list chrome as
// DocumentUpload.jsx (Documents & assessments tab) rather than a second
// visual language for uploads. The flow itself still differs from that
// one — a session has no pre-existing record to attach to, so this creates
// the therapy session directly, either from pasted text or a single
// PDF/DOCX/TXT file, dated by a required "Session date & time" field
// instead of a category picker. Session recording/audio upload is disabled
// for now (see SessionUpload.jsx, kept but no longer wired into
// PatientProfile.jsx) in favor of this transcript flow.
export default function TranscriptUpload({ patientId, onUploadComplete, onClose }) {
  const [mode, setMode] = useState('paste') // 'paste' | 'file'
  const [transcriptText, setTranscriptText] = useState('')
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [dropInvalid, setDropInvalid] = useState(false)
  const [sessionDate, setSessionDate] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [liveMessage, setLiveMessage] = useState('')

  const inputRef = useRef(null)
  const dateRef = useRef(null)
  const invalidTimerRef = useRef(null)

  useEffect(() => {
    dateRef.current?.focus()
    return () => clearTimeout(invalidTimerRef.current)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [submitting, onClose])

  const wordCount = transcriptText.trim() ? transcriptText.trim().split(/\s+/).length : 0

  const flagInvalid = (message) => {
    setDropInvalid(true)
    setLiveMessage(message)
    clearTimeout(invalidTimerRef.current)
    invalidTimerRef.current = setTimeout(() => setDropInvalid(false), 2000)
  }

  const selectFile = useCallback((selected) => {
    const err = validateFile(selected)
    if (err) {
      flagInvalid(`${selected.name}: ${err}`)
      return
    }
    setFile(selected)
    setError('')
    setSuccess('')
    setLiveMessage(`${selected.name} added`)
  }, [])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(true)
    setLiveMessage('Drop file to upload')
  }, [])
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation() }, [])
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
  }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) selectFile(e.dataTransfer.files[0])
  }, [selectFile])

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) selectFile(e.target.files[0])
    e.target.value = ''
  }

  const openBrowse = () => inputRef.current?.click()
  const handleZoneKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBrowse() }
  }

  const removeFile = () => setFile(null)

  const canSubmit = (mode === 'paste' ? !!transcriptText.trim() : !!file) && !!sessionDate

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    setProgress(0)

    try {
      // A full 50-60 min session transcript takes a while to summarize —
      // this call can legitimately take a minute or more.
      if (mode === 'paste') {
        await uploadTherapySessionTranscript(
          patientId,
          transcriptText.trim(),
          new Date(sessionDate).toISOString()
        )
      } else {
        await uploadTherapySessionTranscriptFile(
          patientId,
          file,
          new Date(sessionDate).toISOString(),
          (pct) => setProgress(pct)
        )
      }
      setSuccess('Transcript processed — summary and SOAP notes generated.')
      setTimeout(() => onUploadComplete?.(), 1200)
    } catch (err) {
      setError(err.userMessage || err.response?.data?.detail || 'Failed to process transcript')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }}>
      <div className="modal doc-upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-transcript-title">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <h3 id="upload-transcript-title" className="modal-title">Upload transcript</h3>
          <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Close" onClick={onClose} disabled={submitting}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="field-head" style={{ marginBottom: '6px' }}>
          <span className="t-caption">Transcript source</span>
        </div>
        <div role="group" aria-label="Transcript source" style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <button
            type="button"
            className={`btn btn-secondary${mode === 'paste' ? ' btn-active' : ''}`}
            aria-pressed={mode === 'paste'}
            disabled={submitting}
            onClick={() => setMode('paste')}
          >
            Paste text
          </button>
          <button
            type="button"
            className={`btn btn-secondary${mode === 'file' ? ' btn-active' : ''}`}
            aria-pressed={mode === 'file'}
            disabled={submitting}
            onClick={() => setMode('file')}
          >
            Upload file
          </button>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div className="field-head">
            <label htmlFor="session_date">Session date &amp; time</label>
          </div>
          <input
            id="session_date"
            ref={dateRef}
            type="datetime-local"
            className="input"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            disabled={submitting}
          />
        </div>

        {mode === 'paste' ? (
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <div className="field-head">
              <label htmlFor="transcript_text">Session transcript</label>
              {wordCount > 0 && <span className="field-optional">{wordCount.toLocaleString()} words</span>}
            </div>
            <textarea
              id="transcript_text"
              className="textarea"
              style={{ minHeight: '260px', fontFamily: 'monospace', fontSize: '13px' }}
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              placeholder="Paste the full session transcript here (a typical 50-60 minute session works fine)…"
              disabled={submitting}
            />
          </div>
        ) : (
          <>
            <div
              className={`dropzone${dragActive ? ' is-over' : ''}${dropInvalid ? ' is-invalid' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Upload transcript file. Drag and drop, or activate to browse"
              aria-describedby="transcript-dropzone-hint"
              onClick={openBrowse}
              onKeyDown={handleZoneKeyDown}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ marginBottom: 'var(--space-2)' }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileSelect}
                className="hidden"
                disabled={submitting}
                tabIndex={-1}
              />
              <Upload size={24} strokeWidth={1.5} aria-hidden="true" />
              <p className="dropzone-prompt">
                Drag &amp; drop a file here, or <span className="link">browse</span>
              </p>
              <p className="dropzone-hint" id="transcript-dropzone-hint">PDF, DOCX or TXT · 50 MB max</p>
            </div>
            {dropInvalid && <p className="input-error-text">{liveMessage}</p>}

            {file && (
              <div className="file-list">
                <div className="file-item">
                  <span className="type-icon"><FileText size={16} strokeWidth={1.5} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="file-item-name">{file.name}</p>
                    {submitting && progress > 0 && progress < 100 && (
                      <div className="file-progress" role="progressbar" aria-label={`Uploading ${file.name}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                        <div style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                  <span className="file-item-size">{formatFileSize(file.size)}</span>
                  {!submitting && (
                    <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label={`Remove ${file.name}`} onClick={removeFile}>
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <span className="sr-only" role="status" aria-live="polite">{liveMessage}</span>

        {error && <p className="input-error-text" style={{ marginTop: 'var(--space-3)' }}>{error}</p>}
        {success && !error && <p className="t-body-s" style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)' }}>{success}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? 'Generating notes…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
