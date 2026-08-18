import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Image, File, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { uploadDocument } from '../api/client'

const DOCUMENT_CATEGORIES = [
  { value: 'psychological_assessment', label: 'Psychological Assessment' },
  { value: 'mmpi2_assessment', label: 'MMPI-2 Assessment' },
  { value: 'personality_assessment', label: 'Personality Assessment' },
  { value: 'cognitive_assessment', label: 'Cognitive Assessment' },
  { value: 'psychological_report', label: 'Psychological Report' },
  { value: 'psychiatric_report', label: 'Psychiatric Report' },
  { value: 'medical_report', label: 'Medical Report' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'referral_letter', label: 'Referral Letter' },
  { value: 'consent_form', label: 'Consent Form' },
  { value: 'progress_report', label: 'Progress Report' },
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
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function DocumentUpload({ patientId, onUploadComplete, onClose }) {
  const [files, setFiles] = useState([])
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadStatus, setUploadStatus] = useState({}) // { fileName: { progress: 0, status: 'pending'|'uploading'|'success'|'error', error: '' } }
  const inputRef = useRef(null)

  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'File type not supported. Allowed: PDF, Word, Excel, Images, Text'
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 50MB limit'
    }
    return null
  }

  const addFiles = useCallback((newFiles) => {
    const validFiles = []
    const newStatus = { ...uploadStatus }
    
    for (const file of newFiles) {
      const error = validateFile(file)
      if (error) {
        newStatus[file.name] = { progress: 0, status: 'error', error }
      } else if (!files.find(f => f.name === file.name && f.size === file.size)) {
        validFiles.push(file)
        newStatus[file.name] = { progress: 0, status: 'pending', error: '' }
      }
    }
    
    setFiles(prev => [...prev, ...validFiles])
    setUploadStatus(newStatus)
  }, [files, uploadStatus])

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files))
    }
  }, [addFiles])

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files))
    }
  }

  const removeFile = (fileName) => {
    setFiles(prev => prev.filter(f => f.name !== fileName))
    setUploadStatus(prev => {
      const next = { ...prev }
      delete next[fileName]
      return next
    })
  }

  const handleUpload = async () => {
    if (files.length === 0 || !category) return
    
    setUploading(true)
    let successCount = 0
    
    for (const file of files) {
      setUploadStatus(prev => ({
        ...prev,
        [file.name]: { ...prev[file.name], status: 'uploading', progress: 0 }
      }))
      
      try {
        const uploaded = await uploadDocument(
          patientId,
          file,
          category,
          notes || null,
          null,
          (progress) => {
            setUploadStatus(prev => ({
              ...prev,
              [file.name]: { ...prev[file.name], progress }
            }))
          }
        )

        // The upload itself succeeded either way, but a small set of formats
        // (legacy .doc, spreadsheets) can't actually be read for Clinical
        // Intelligence — flag that distinctly instead of showing a plain
        // green "success" that implies the AI saw the content.
        if (uploaded.processing_status === 'unsupported_format') {
          setUploadStatus(prev => ({
            ...prev,
            [file.name]: {
              progress: 100,
              status: 'warning',
              error: "Uploaded, but this file type can't be read for AI analysis. Re-upload as PDF or Word (.docx) if you want it included in Clinical Intelligence.",
            }
          }))
        } else {
          setUploadStatus(prev => ({
            ...prev,
            [file.name]: { progress: 100, status: 'success', error: '' }
          }))
        }
        successCount++
      } catch (err) {
        setUploadStatus(prev => ({
          ...prev,
          [file.name]: {
            progress: 0,
            status: 'error',
            error: err.response?.data?.detail || 'Upload failed'
          }
        }))
      }
    }
    
    setUploading(false)
    
    if (successCount > 0) {
      setTimeout(() => {
        onUploadComplete?.()
      }, 1000)
    }
  }

  const allUploaded = files.length > 0 && files.every(f => ['success', 'warning'].includes(uploadStatus[f.name]?.status))
  const hasErrors = files.some(f => uploadStatus[f.name]?.status === 'error')

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Upload Documents</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Category Selection */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Document Category <span className="text-red-500">*</span>
        </label>
        <select
          className="input-field"
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

      {/* Drag & Drop Zone */}
      <div
        className={`relative mb-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive
            ? 'border-primary-400 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        
        <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
        <p className="mb-1 text-sm font-medium text-gray-700">
          Drag & drop files here, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-primary-600 hover:text-primary-700"
            disabled={uploading}
          >
            browse
          </button>
        </p>
        <p className="text-xs text-gray-500">
          PDF, Word, Excel, Images, Text • Max 50MB per file
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mb-4 space-y-2">
          {files.map(file => {
            const status = uploadStatus[file.name] || { progress: 0, status: 'pending', error: '' }
            const Icon = getFileIcon(file.type)
            
            return (
              <div
                key={file.name}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  status.status === 'error'
                    ? 'border-red-200 bg-red-50'
                    : status.status === 'warning'
                      ? 'border-amber-200 bg-amber-50'
                      : status.status === 'success'
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 bg-gray-50'
                }`}
              >
                <Icon className={`h-8 w-8 ${
                  status.status === 'error' ? 'text-red-400' :
                  status.status === 'warning' ? 'text-amber-400' :
                  status.status === 'success' ? 'text-green-400' : 'text-gray-400'
                }`} />

                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>

                  {status.status === 'uploading' && (
                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-primary-500 transition-all"
                        style={{ width: `${status.progress}%` }}
                      />
                    </div>
                  )}

                  {status.status === 'error' && (
                    <p className="mt-1 text-xs text-red-600">{status.error}</p>
                  )}

                  {status.status === 'warning' && (
                    <p className="mt-1 text-xs text-amber-700">{status.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {status.status === 'uploading' && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                  )}
                  {status.status === 'success' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  {status.status === 'warning' && (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  )}
                  {status.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  {(status.status === 'pending' || status.status === 'error') && !uploading && (
                    <button
                      onClick={() => removeFile(file.name)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Notes */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Notes (optional)
        </label>
        <textarea
          className="input-field min-h-[60px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes about these documents..."
          disabled={uploading}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || !category || uploading || allUploaded}
          className="btn-primary"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : allUploaded ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Uploaded
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload {files.length > 0 ? `(${files.length})` : ''}
            </>
          )}
        </button>
        <button onClick={onClose} className="btn-secondary" disabled={uploading}>
          {allUploaded ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
