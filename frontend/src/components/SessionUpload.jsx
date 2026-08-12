import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileAudio, Loader2, AlertCircle, Calendar, CheckCircle } from 'lucide-react'
import { uploadTherapySession, processTherapySession } from '../api/client'

const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'video/mp4',
]

export default function SessionUpload({ patientId, onUploadComplete, onClose }) {
  const [file, setFile] = useState(null)
  const [sessionDate, setSessionDate] = useState(() => {
    const now = new Date()
    return now.toISOString().slice(0, 16)
  })
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadedSession, setUploadedSession] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const fileInputRef = useRef(null)

  const validateFile = (file) => {
    if (!file) return 'Please select a file'
    
    const ext = file.name.split('.').pop().toLowerCase()
    const validExtensions = ['mp3', 'wav', 'm4a', 'mp4']
    
    if (!validExtensions.includes(ext)) {
      return `Invalid file type. Supported formats: ${validExtensions.join(', ')}`
    }
    
    // 500MB limit
    if (file.size > 500 * 1024 * 1024) {
      return 'File size exceeds 500MB limit'
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
    setUploadedSession(null)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [handleFileSelect])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file')
      return
    }
    
    if (!sessionDate) {
      setError('Please select a session date')
      return
    }
    
    setUploading(true)
    setError('')
    setProgress(0)
    
    try {
      const result = await uploadTherapySession(
        patientId,
        file,
        new Date(sessionDate).toISOString(),
        (pct) => setProgress(pct)
      )
      
      setUploadedSession(result)
      setSuccess('File uploaded successfully!')
      setProgress(100)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  const handleProcess = async () => {
    if (!uploadedSession) return
    
    setProcessing(true)
    setError('')
    
    try {
      await processTherapySession(patientId, uploadedSession.id)
      setSuccess('Session processing started! This may take a few minutes.')
      
      setTimeout(() => {
        onUploadComplete?.()
      }, 2000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start processing')
    } finally {
      setProcessing(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const clearFile = () => {
    setFile(null)
    setUploadedSession(null)
    setError('')
    setSuccess('')
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
          <FileAudio className="h-5 w-5 text-gray-400" />
          Upload Session Recording
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
            disabled={uploading || uploadedSession}
          />
        </div>
      </div>

      {/* Drop Zone */}
      {!uploadedSession && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`mb-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
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
            accept=".mp3,.wav,.m4a,.mp4,audio/*"
            onChange={(e) => handleFileSelect(e.target.files[0])}
            className="hidden"
          />
          
          {file ? (
            <div className="flex flex-col items-center gap-3">
              <FileAudio className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
              </div>
              <button
                onClick={clearFile}
                className="text-sm text-red-500 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="mb-2 text-sm text-gray-600">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="font-medium text-primary-600 hover:text-primary-700"
                >
                  Click to browse
                </button>
                {' '}or drag and drop
              </p>
              <p className="text-xs text-gray-500">
                MP3, WAV, M4A, or MP4 (max 500MB)
              </p>
            </>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-600">Uploading...</span>
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

      {/* Uploaded Session */}
      {uploadedSession && (
        <div className="mb-4 rounded-lg bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="font-medium text-green-800">File uploaded successfully!</p>
              <p className="text-sm text-green-600">
                Status: {uploadedSession.processing_status}
              </p>
            </div>
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
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        )}
        
        {!uploadedSession ? (
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn-primary"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Recording
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleProcess}
            disabled={processing}
            className="btn-primary"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Process Session
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
