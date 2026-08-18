import { useState, useRef, useCallback } from 'react'
import { X, FileText, Upload, Loader2, AlertCircle, Calendar, CheckCircle } from 'lucide-react'
import { uploadTherapySessionTranscript, uploadTherapySessionTranscriptFile } from '../api/client'

// Local (not UTC) "yyyy-MM-ddTHH:mm" for a <input type="datetime-local">
// default — new Date().toISOString() is UTC, which shows the wrong time to
// anyone not in UTC (e.g. 4:04pm IST rendered as 10:34am).
function toLocalDateTimeInputValue(date) {
  const tzOffsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt']

// Session recording/audio upload is disabled for now (see SessionUpload.jsx,
// kept but no longer wired into PatientProfile.jsx) in favor of this
// transcript flow — no audio, no transcription, no speaker-ID needed. Text
// can either be pasted directly or uploaded as a PDF/DOCX/TXT file (text is
// extracted server-side).
export default function TranscriptUpload({ patientId, onUploadComplete, onClose }) {
  const [mode, setMode] = useState('paste') // 'paste' | 'file'
  const [transcriptText, setTranscriptText] = useState('')
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [sessionDate, setSessionDate] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fileInputRef = useRef(null)

  const wordCount = transcriptText.trim() ? transcriptText.trim().split(/\s+/).length : 0

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const validateFile = (f) => {
    if (!f) return 'Please select a file'
    const ext = f.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Invalid file type. Supported formats: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`
    }
    if (f.size > 50 * 1024 * 1024) {
      return 'File size exceeds 50MB limit'
    }
    return null
  }

  const handleFileSelect = useCallback((selectedFile) => {
    const validationError = validateFile(selectedFile)
    if (validationError) {
      setError(validationError)
      return
    }
    setFile(selectedFile)
    setError('')
    setSuccess('')
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }, [handleFileSelect])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (mode === 'paste' && !transcriptText.trim()) {
      setError('Please paste or enter the session transcript')
      return
    }
    if (mode === 'file' && !file) {
      setError('Please select a transcript file')
      return
    }
    if (!sessionDate) {
      setError('Please select a session date')
      return
    }

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
      setSuccess('Transcript processed! Summary and SOAP notes have been generated.')
      setTimeout(() => {
        onUploadComplete?.()
      }, 1500)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process transcript')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = mode === 'paste' ? !!transcriptText.trim() : !!file

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
          <FileText className="h-5 w-5 text-gray-400" />
          Upload Transcript
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setMode('paste')}
          disabled={submitting}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'paste' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Paste Text
        </button>
        <button
          onClick={() => setMode('file')}
          disabled={submitting}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload PDF / Word
        </button>
      </div>

      {/* Session Date */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Session Date & Time
        </label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="datetime-local"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="input-field pl-10"
            disabled={submitting}
          />
        </div>
      </div>

      {mode === 'paste' ? (
        /* Transcript Text */
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Session Transcript
            </label>
            {wordCount > 0 && (
              <span className="text-xs text-gray-500">{wordCount.toLocaleString()} words</span>
            )}
          </div>
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            disabled={submitting}
            rows={14}
            placeholder="Paste the full session transcript here (a typical 50-60 minute session works fine)…"
            className="input-field resize-y font-mono text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Session Intelligence will generate a summary and SOAP notes from this text, and feed relevant updates into Clinical Intelligence.
          </p>
        </div>
      ) : (
        /* Transcript File */
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Transcript File
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary-400 bg-primary-50'
                : file
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              disabled={submitting}
              className="hidden"
            />

            {file ? (
              <div className="flex flex-col items-center gap-3">
                <FileText className="h-12 w-12 text-green-500" />
                <div className="text-center">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                </div>
                {!submitting && (
                  <button onClick={clearFile} className="text-sm text-red-500 hover:text-red-600">
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <>
                <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                <p className="mb-2 text-sm text-gray-600">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    className="font-medium text-primary-600 hover:text-primary-700"
                  >
                    Click to browse
                  </button>
                  {' '}or drag and drop
                </p>
                <p className="text-xs text-gray-500">PDF, DOCX, or TXT (max 50MB)</p>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Text is extracted from the file, then Session Intelligence generates a summary and SOAP notes and feeds relevant updates into Clinical Intelligence.
          </p>
        </div>
      )}

      {/* Upload Progress (file mode) */}
      {submitting && mode === 'file' && progress > 0 && progress < 100 && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-600">Uploading…</span>
            <span className="font-medium text-gray-700">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Success Message */}
      {success && !error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          {success}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        {onClose && (
          <button onClick={onClose} disabled={submitting} className="btn-secondary">
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="btn-primary"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === 'file' && progress > 0 && progress < 100 ? 'Uploading…' : 'Generating notes…'}
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Generate Summary &amp; SOAP Notes
            </>
          )}
        </button>
      </div>
    </div>
  )
}
