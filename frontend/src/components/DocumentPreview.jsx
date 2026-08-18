import { useState, useEffect } from 'react'
import { X, Download, FileText, Image, File, Loader2, ExternalLink, History, Tag, User, Clock, MessageSquare } from 'lucide-react'
import { getDocument, getDocumentVersions, getDocumentDownloadUrl, getDocumentPreviewUrl } from '../api/client'

const CATEGORY_LABELS = {
  psychological_assessment: 'Psychological Assessment',
  mmpi2_assessment: 'MMPI-2 Assessment',
  personality_assessment: 'Personality Assessment',
  cognitive_assessment: 'Cognitive Assessment',
  psychological_report: 'Psychological Report',
  psychiatric_report: 'Psychiatric Report',
  medical_report: 'Medical Report',
  lab_report: 'Lab Report',
  prescription: 'Prescription',
  referral_letter: 'Referral Letter',
  consent_form: 'Consent Form',
  progress_report: 'Progress Report',
  other: 'Other',
}

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function canPreview(mimeType) {
  return mimeType?.startsWith('image/') || mimeType === 'application/pdf' || mimeType === 'text/plain'
}

export default function DocumentPreview({ patientId, documentId, onClose }) {
  const [document, setDocument] = useState(null)
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('preview')
  const [error, setError] = useState('')

  useEffect(() => {
    loadDocument()
  }, [documentId])

  const loadDocument = async () => {
    try {
      setLoading(true)
      const [doc, vers] = await Promise.all([
        getDocument(patientId, documentId),
        getDocumentVersions(patientId, documentId).catch(() => []),
      ])
      setDocument(doc)
      setVersions(vers)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    window.open(getDocumentDownloadUrl(patientId, documentId), '_blank')
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="rounded-lg bg-white p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="rounded-lg bg-white p-8 text-center">
          <p className="text-red-500">{error || 'Document not found'}</p>
          <button onClick={onClose} className="btn-secondary mt-4">Close</button>
        </div>
      </div>
    )
  }

  const previewUrl = getDocumentPreviewUrl(patientId, documentId)
  const showPreview = canPreview(document.mime_type)

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60">
      {/* Preview Panel */}
      <div className="flex flex-1 flex-col bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-gray-400" />
            <div>
              <h2 className="font-medium text-white">{document.display_name}</h2>
              <p className="text-xs text-gray-400">{document.original_filename}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload} className="btn-secondary text-sm">
              <Download className="h-4 w-4" />
              Download
            </button>
            <button onClick={onClose} className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto">
          {showPreview ? (
            document.mime_type?.startsWith('image/') ? (
              <div className="flex h-full items-center justify-center p-4">
                <img
                  src={previewUrl}
                  alt={document.display_name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : document.mime_type === 'application/pdf' ? (
              <iframe
                src={previewUrl}
                className="h-full w-full"
                title={document.display_name}
              />
            ) : document.mime_type === 'text/plain' ? (
              <iframe
                src={previewUrl}
                className="h-full w-full bg-white"
                title={document.display_name}
              />
            ) : null
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <File className="mb-4 h-16 w-16" />
              <p className="mb-2">Preview not available for this file type</p>
              <button onClick={handleDownload} className="btn-primary">
                <Download className="h-4 w-4" />
                Download to View
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Details Sidebar */}
      <div className="w-80 overflow-auto border-l border-gray-200 bg-white">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'details'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Details
          </button>
          {versions.length > 1 && (
            <button
              onClick={() => setActiveTab('versions')}
              className={`flex-1 py-3 text-sm font-medium ${
                activeTab === 'versions'
                  ? 'border-b-2 border-primary-500 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Versions ({versions.length})
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === 'details' ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Tag className="h-3.5 w-3.5" />
                  Category
                </div>
                <p className="mt-1 text-sm text-gray-800">
                  {CATEGORY_LABELS[document.category] || document.category}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <User className="h-3.5 w-3.5" />
                  Uploaded By
                </div>
                <p className="mt-1 text-sm text-gray-800">{document.uploaded_by_name}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  Uploaded
                </div>
                <p className="mt-1 text-sm text-gray-800">{formatDate(document.created_at)}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <File className="h-3.5 w-3.5" />
                  File Info
                </div>
                <p className="mt-1 text-sm text-gray-800">{formatFileSize(document.file_size)}</p>
                <p className="text-xs text-gray-500">{document.mime_type}</p>
              </div>

              {document.version > 1 && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <History className="h-3.5 w-3.5" />
                    Version
                  </div>
                  <p className="mt-1 text-sm text-gray-800">Version {document.version}</p>
                </div>
              )}

              {document.notes && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Notes
                  </div>
                  <p className="mt-1 text-sm text-gray-800">{document.notes}</p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  Processing Status
                </div>
                <p className={`mt-1 text-sm ${
                  document.processing_status === 'completed' ? 'text-green-600' :
                  document.processing_status === 'failed' ? 'text-red-600' :
                  document.processing_status === 'unsupported_format' ? 'text-gray-500' :
                  'text-amber-600'
                }`}>
                  {document.processing_status === 'unsupported_format'
                    ? 'Format not readable'
                    : document.processing_status.charAt(0).toUpperCase() + document.processing_status.slice(1)}
                </p>
                {document.processing_status === 'unsupported_format' && (
                  <p className="mt-1 text-xs text-gray-500">
                    This file type can't be read for AI analysis. Re-upload as PDF or Word (.docx) to include it in Clinical Intelligence.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className={`rounded-lg border p-3 ${
                    v.id === documentId ? 'border-primary-300 bg-primary-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">Version {v.version}</span>
                    {v.id === documentId && (
                      <span className="rounded bg-primary-100 px-1.5 py-0.5 text-xs font-medium text-primary-700">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{formatDate(v.created_at)}</p>
                  <p className="text-xs text-gray-500">by {v.uploaded_by_name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
