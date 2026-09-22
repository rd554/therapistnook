import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, X, FileText, Image, File } from 'lucide-react'
import { uploadDocument } from '../api/client'

const DOCUMENT_CATEGORIES = [
  { value: 'psychological_assessment', label: 'Psychological assessment' },
  { value: 'mmpi2_assessment', label: 'MMPI-2 assessment' },
  { value: 'personality_assessment', label: 'Personality assessment' },
  { value: 'cognitive_assessment', label: 'Cognitive assessment' },
  { value: 'psychological_report', label: 'Psychological report' },
  { value: 'psychiatric_report', label: 'Psychiatric report' },
  { value: 'medical_report', label: 'Medical report' },
  { value: 'lab_report', label: 'Lab report' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'referral_letter', label: 'Referral letter' },
  { value: 'consent_form', label: 'Consent form' },
  { value: 'progress_report', label: 'Progress report' },
  { value: 'other', label: 'Other' },
]

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'text/plain',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

function getFileIcon(type) {
  if (type?.startsWith('image/')) return Image
  if (type?.includes('pdf')) return FileText
  return File
}

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Unsupported type'
  if (file.size > MAX_FILE_SIZE) return 'File too large'
  return null
}

export default function DocumentUpload({ patientId, onUploadComplete, onClose }) {
  const [files, setFiles] = useState([])
  const [fileMeta, setFileMeta] = useState({}) // { fileName: { status, progress, error } }
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [dropInvalid, setDropInvalid] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const inputRef = useRef(null)
  const categoryRef = useRef(null)
  const invalidTimerRef = useRef(null)

  useEffect(() => {
    categoryRef.current?.focus()
    return () => clearTimeout(invalidTimerRef.current)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !uploading) onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [uploading, onClose])

  const flagInvalid = (message) => {
    setDropInvalid(true)
    setLiveMessage(message)
    clearTimeout(invalidTimerRef.current)
    invalidTimerRef.current = setTimeout(() => setDropInvalid(false), 2000)
  }

  const addFiles = useCallback((newFiles) => {
    const accepted = []
    const rejected = []
    for (const file of newFiles) {
      const error = validateFile(file)
      if (error) {
        rejected.push({ name: file.name, error })
      } else if (!files.find(f => f.name === file.name && f.size === file.size)) {
        accepted.push(file)
      }
    }
    if (accepted.length > 0) {
      setFiles(prev => [...prev, ...accepted])
      setFileMeta(prev => {
        const next = { ...prev }
        for (const file of accepted) next[file.name] = { status: 'staged', progress: 0, error: '' }
        return next
      })
    }
    if (rejected.length > 0) {
      const message = rejected.length === 1
        ? `${rejected[0].name}: ${rejected[0].error}`
        : `${rejected.length} files rejected`
      flagInvalid(message)
    } else if (accepted.length > 0) {
      setLiveMessage(`${accepted.length} file${accepted.length !== 1 ? 's' : ''} added`)
    }
  }, [files])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(true)
    setLiveMessage('Drop files to upload')
  }, [])
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation() }, [])
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
  }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files))
    }
  }, [addFiles])

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const openBrowse = () => inputRef.current?.click()
  const handleZoneKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBrowse() }
  }

  const removeFile = (fileName) => {
    setFiles(prev => prev.filter(f => f.name !== fileName))
    setFileMeta(prev => {
      const next = { ...prev }
      delete next[fileName]
      return next
    })
  }

  const handleUpload = async () => {
    if (files.length === 0 || !category || uploading) return
    setUploading(true)
    const remaining = []
    let succeeded = 0

    for (const file of files) {
      setFileMeta(prev => ({ ...prev, [file.name]: { ...prev[file.name], status: 'uploading', progress: 0, error: '' } }))
      try {
        await uploadDocument(patientId, file, category, notes || null, null, (progress) => {
          setFileMeta(prev => ({ ...prev, [file.name]: { ...prev[file.name], progress } }))
        })
        succeeded++
      } catch (err) {
        remaining.push(file)
        setFileMeta(prev => ({
          ...prev,
          [file.name]: { status: 'error', progress: 0, error: err.userMessage || err.response?.data?.detail || 'Upload failed' },
        }))
      }
    }

    setFiles(remaining)
    setUploading(false)
    if (succeeded > 0) onUploadComplete?.(succeeded)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }}>
      <div
        className="modal doc-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-docs-title"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <h3 id="upload-docs-title" className="modal-title">Upload documents</h3>
          <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Close" onClick={onClose} disabled={uploading}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div className="field-head">
            <label htmlFor="doc_category">Document category</label>
          </div>
          <select
            id="doc_category"
            ref={categoryRef}
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={uploading}
          >
            <option value="">Select a category</option>
            {DOCUMENT_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div
          className={`dropzone${dragActive ? ' is-over' : ''}${dropInvalid ? ' is-invalid' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Upload files. Drag and drop, or activate to browse"
          aria-describedby="dropzone-hint"
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
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
            tabIndex={-1}
          />
          <Upload size={24} strokeWidth={1.5} aria-hidden="true" />
          <p className="dropzone-prompt">
            Drag &amp; drop files here, or <span className="link">browse</span>
          </p>
          <p className="dropzone-hint" id="dropzone-hint">PDF, Word, Excel, images, text · 50 MB per file</p>
        </div>
        {dropInvalid && <p className="input-error-text">{liveMessage}</p>}
        <span className="sr-only" role="status" aria-live="polite">{liveMessage}</span>

        {files.length > 0 && (
          <div className="file-list">
            {files.map(file => {
              const meta = fileMeta[file.name] || { status: 'staged', progress: 0, error: '' }
              const Icon = getFileIcon(file.type)
              return (
                <div key={file.name} className="file-item">
                  <span className="type-icon"><Icon size={16} strokeWidth={1.5} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="file-item-name">{file.name}</p>
                    {meta.status === 'uploading' && (
                      <div
                        className="file-progress"
                        role="progressbar"
                        aria-label={`Uploading ${file.name}`}
                        aria-valuenow={meta.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div style={{ width: `${meta.progress}%` }} />
                      </div>
                    )}
                    {meta.status === 'error' && <p className="input-error-text">{meta.error}</p>}
                  </div>
                  <span className="file-item-size">{formatFileSize(file.size)}</span>
                  {meta.status !== 'uploading' && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-icon-sm"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeFile(file.name)}
                    >
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 'var(--space-4)' }}>
          <div className="field-head">
            <label htmlFor="doc_notes">Notes</label>
            <span className="field-optional">Optional</span>
          </div>
          <textarea
            id="doc_notes"
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about these documents…"
            disabled={uploading}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={files.length === 0 || !category || uploading}
            onClick={handleUpload}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
