import { useState, useEffect } from 'react'
import {
  Search, Filter, FileText, Image, File, Download, Eye, Edit2, Trash2,
  MoreVertical, Clock, User, Tag, ChevronDown, X, Loader2, ClipboardList,
  History, CheckCircle, AlertCircle,
} from 'lucide-react'
import {
  listDocumentsAndAssessments,
  deleteDocument,
  updateDocument,
  getDocumentDownloadUrl,
  deleteAssessment,
} from '../api/client'

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

const ASSESSMENT_TYPE_LABELS = {
  mmpi2: 'MMPI-2',
  phq9: 'PHQ-9',
  gad7: 'GAD-7',
  bdi2: 'BDI-II',
  mcmi: 'MCMI',
  big_five: 'Big Five',
  cognitive: 'Cognitive',
  custom: 'Custom',
}

function getFileIcon(mimeType) {
  if (mimeType?.startsWith('image/')) return Image
  if (mimeType?.includes('pdf')) return FileText
  return File
}

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DocumentsList({ patientId, onPreview, onViewAssessment }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({ display_name: '', notes: '' })
  const [menuOpen, setMenuOpen] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await listDocumentsAndAssessments(patientId, {
        search: search || undefined,
        category: categoryFilter || undefined,
      })
      setItems(data)
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [patientId, categoryFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleDelete = async (item) => {
    const typeLabel = item.type === 'assessment' ? 'assessment' : 'document'
    if (!window.confirm(`Are you sure you want to delete this ${typeLabel}?`)) return
    
    try {
      if (item.type === 'assessment') {
        await deleteAssessment(patientId, item.id)
      } else {
        await deleteDocument(patientId, item.id)
      }
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete')
    }
  }

  const handleEditSave = async () => {
    if (!editingItem) return
    
    try {
      await updateDocument(patientId, editingItem.id, {
        display_name: editForm.display_name,
        notes: editForm.notes,
      })
      setEditingItem(null)
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update')
    }
  }

  const openEdit = (item) => {
    if (item.type === 'assessment') return
    setEditingItem(item)
    setEditForm({ display_name: item.name, notes: '' })
    setMenuOpen(null)
  }

  const handleDownload = (item) => {
    if (item.type === 'document') {
      window.open(getDocumentDownloadUrl(patientId, item.id), '_blank')
    }
  }

  const handleView = (item) => {
    setMenuOpen(null)
    if (item.type === 'assessment') {
      onViewAssessment?.(item)
    } else {
      onPreview?.(item)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><CheckCircle className="h-3 w-3" />Completed</span>
      case 'pending':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><Clock className="h-3 w-3" />Pending</span>
      case 'in_progress':
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"><Loader2 className="h-3 w-3" />In Progress</span>
      case 'failed':
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><AlertCircle className="h-3 w-3" />Failed</span>
      default:
        return null
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input-field pl-9"
            placeholder="Search documents and assessments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary ${categoryFilter ? 'ring-2 ring-primary-300' : ''}`}
          >
            <Filter className="h-4 w-4" />
            Filter
            {categoryFilter && <span className="ml-1 rounded-full bg-primary-100 px-1.5 text-xs text-primary-700">1</span>}
            <ChevronDown className="h-4 w-4" />
          </button>
          
          {showFilters && (
            <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Category</span>
                {categoryFilter && (
                  <button
                    onClick={() => setCategoryFilter('')}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                className="input-field text-sm"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value)
                  setShowFilters(false)
                }}
              >
                <option value="">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">
            {search || categoryFilter
              ? 'No documents or assessments found matching your filters.'
              : 'No documents or assessments yet.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Type</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Category</th>
                <th className="px-4 py-3 font-semibold text-gray-600">By</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Size</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const Icon = item.type === 'assessment' ? ClipboardList : getFileIcon(item.file_type)
                
                return (
                  <tr key={`${item.type}-${item.id}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-800 truncate max-w-[200px]">{item.name}</p>
                          {item.version > 1 && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                              <History className="h-3 w-3" />
                              v{item.version}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.type === 'assessment'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.type === 'assessment' ? 'Assessment' : 'Document'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.assessment_type
                        ? ASSESSMENT_TYPE_LABELS[item.assessment_type] || item.assessment_type
                        : CATEGORY_LABELS[item.category] || item.category}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.uploaded_by_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(item.date)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatFileSize(item.file_size)}</td>
                    <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        
                        {menuOpen === item.id && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <button
                              onClick={() => handleView(item)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </button>
                            {item.type === 'document' && (
                              <>
                                <button
                                  onClick={() => handleDownload(item)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Download className="h-4 w-4" />
                                  Download
                                </button>
                                <button
                                  onClick={() => openEdit(item)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Edit2 className="h-4 w-4" />
                                  Edit
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleDelete(item)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Edit Document</h3>
              <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Display Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Add notes..."
                />
              </div>
            </div>
            
            <div className="mt-4 flex gap-2">
              <button onClick={handleEditSave} className="btn-primary">Save Changes</button>
              <button onClick={() => setEditingItem(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setMenuOpen(null)}
        />
      )}
    </div>
  )
}
