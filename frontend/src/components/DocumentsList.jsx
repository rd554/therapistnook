import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, ChevronDown, FileText, Image, File, ClipboardList,
  MoreVertical, Eye, Download, Pencil, Trash2, X, Loader2, Upload,
} from 'lucide-react'
import {
  listDocumentsAndAssessments,
  deleteDocument,
  updateDocument,
  getDocumentDownloadUrl,
  deleteAssessment,
} from '../api/client'
import { formatDate } from '../utils/date'

const CATEGORY_LABELS = {
  psychological_report: 'Psychological report',
  psychiatric_report: 'Psychiatric report',
  medical_report: 'Medical report',
  lab_report: 'Lab report',
  prescription: 'Prescription',
  referral_letter: 'Referral letter',
  consent_form: 'Consent form',
  progress_report: 'Progress report',
  other: 'Other',
}

const ASSESSMENT_STATUS_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'cancelled', label: 'Cancelled' },
]

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

function assessmentStatusMeta(status) {
  switch (status) {
    case 'completed':   return { label: 'Completed',   cls: 'status-quiet' }
    case 'pending':     return { label: 'Pending',     cls: 'status-plain' }
    case 'in_progress': return { label: 'In progress', cls: 'status-plain' }
    case 'cancelled':   return { label: 'Cancelled',   cls: 'status-warn' }
    default:            return { label: status || '',  cls: 'status-plain' }
  }
}

function documentStatusMeta(status) {
  switch (status) {
    case 'completed':          return { label: 'Completed',            cls: 'status-quiet' }
    case 'pending':             return { label: 'Pending',              cls: 'status-plain' }
    case 'processing':          return { label: 'Processing',           cls: 'status-plain' }
    case 'failed':               return { label: 'Failed',               cls: 'status-warn', bold: true }
    case 'unsupported_format':   return { label: 'Format not readable',  cls: 'status-warn', bold: true }
    default:                     return { label: status || '',           cls: 'status-plain' }
  }
}

// Assessment display names are stored as "<Type> — <Patient name>" (set at
// creation time on the Assessments screen); strip the patient's own name
// back off since it's redundant on a page that's already scoped to them.
function assessmentDisplayName(name, patientName) {
  if (!name || !patientName) return name
  const suffix = ` — ${patientName}`
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
}

// Kebab row-action menu, portaled to <body> and positioned `fixed` from the
// trigger button's own coordinates — .card-flush (the section's outer card)
// has overflow:hidden, which would clip an ordinary absolutely-positioned
// .menu-popover for any row near the card's bottom or right edge.
function RowMenu({ label, actions }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = () => { setOpen(false); setPos(null) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); setPos(null); return }
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-icon btn-icon-sm"
        aria-label={`${label} actions`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
      >
        <MoreVertical size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 99 }} onClick={() => { setOpen(false); setPos(null) }} />
          <div
            className="menu-popover"
            style={{ position: 'fixed', top: pos.top, left: 'auto', right: pos.right, zIndex: 100 }}
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={`menu-item${a.destructive ? ' is-destructive' : ''}`}
                onClick={() => { setOpen(false); setPos(null); a.onClick() }}
              >
                <a.icon size={14} strokeWidth={1.5} /> {a.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

// Search + filter toolbar shared by both sections. `filterOptions` is a
// list of { value, label }; passing none hides the filter button entirely.
function Toolbar({ search, onSearchChange, searchPlaceholder, filterOptions, filterValue, onFilterChange }) {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    if (filterOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  return (
    <div className="table-toolbar">
      <div className="input-search">
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <input
          type="text"
          className="input"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={searchPlaceholder}
        />
      </div>
      {filterOptions && (
        <div ref={filterRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-secondary"
            aria-haspopup="true"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((v) => !v)}
          >
            Filter
            <ChevronDown size={16} strokeWidth={1.5} />
          </button>
          {filterOpen && (
            <div className="menu-popover align-right">
              {filterValue && (
                <button type="button" className="menu-item" onClick={() => { onFilterChange(''); setFilterOpen(false) }}>
                  Clear filter
                </button>
              )}
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="menu-item"
                  onClick={() => { onFilterChange(opt.value); setFilterOpen(false) }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DocumentsList({ patientId, patient, onPreview, onViewAssessment, onUploadClick, refreshKey }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [assessSearch, setAssessSearch] = useState('')
  const [assessStatus, setAssessStatus] = useState('')
  const [docSearch, setDocSearch] = useState('')
  const [docCategory, setDocCategory] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({ display_name: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const data = await listDocumentsAndAssessments(patientId)
      setItems(data)
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [patientId, refreshKey])

  const assessments = useMemo(() => {
    const rows = items.filter((i) => i.type === 'assessment')
    return rows.filter((i) => {
      if (assessStatus && i.status !== assessStatus) return false
      if (assessSearch && !i.name?.toLowerCase().includes(assessSearch.toLowerCase())) return false
      return true
    })
  }, [items, assessSearch, assessStatus])

  const documents = useMemo(() => {
    const rows = items.filter((i) => i.type === 'document')
    return rows.filter((i) => {
      if (docCategory && i.category !== docCategory) return false
      if (docSearch && !i.name?.toLowerCase().includes(docSearch.toLowerCase())) return false
      return true
    })
  }, [items, docSearch, docCategory])

  const handleDeleteAssessment = async (item) => {
    if (!window.confirm('Delete this assessment record?')) return
    try {
      await deleteAssessment(patientId, item.id)
      await load()
    } catch (err) {
      window.alert(err.userMessage || err.response?.data?.detail || 'Failed to delete')
    }
  }

  const handleDeleteDocument = async (item) => {
    if (!window.confirm('Delete this document?')) return
    try {
      await deleteDocument(patientId, item.id)
      await load()
    } catch (err) {
      window.alert(err.userMessage || err.response?.data?.detail || 'Failed to delete')
    }
  }

  const openEdit = (item) => {
    setEditingItem(item)
    setEditForm({ display_name: item.name, notes: '' })
  }

  const handleEditSave = async () => {
    if (!editingItem || saving) return
    setSaving(true)
    try {
      await updateDocument(patientId, editingItem.id, {
        display_name: editForm.display_name,
        notes: editForm.notes,
      })
      setEditingItem(null)
      await load()
    } catch (err) {
      window.alert(err.userMessage || err.response?.data?.detail || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  if (loading && items.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Assessments */}
      <div className="card card-flush">
        <div className="doc-section-head">
          <h3 className="t-h3">Assessments</h3>
        </div>
        <Toolbar
          search={assessSearch}
          onSearchChange={setAssessSearch}
          searchPlaceholder="Search assessments"
          filterOptions={ASSESSMENT_STATUS_OPTIONS}
          filterValue={assessStatus}
          onFilterChange={setAssessStatus}
        />
        {assessments.length === 0 ? (
          <div className="empty">
            <ClipboardList size={20} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} aria-hidden="true" />
            <h3 className="empty-title">No assessments yet</h3>
            <p className="empty-body">Completed and in-progress assessments for this patient will appear here.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Administered</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((item) => {
                    const statusMeta = assessmentStatusMeta(item.status)
                    const name = assessmentDisplayName(item.name, patient?.full_name)
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span className="type-icon"><ClipboardList size={16} strokeWidth={1.5} /></span>
                            <span className="doc-name">{name}</span>
                          </div>
                        </td>
                        <td>{[formatDate(item.date), item.uploaded_by_name].filter(Boolean).join(' · ')}</td>
                        <td><span className={statusMeta.cls}>{statusMeta.label}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <RowMenu
                            label={name}
                            actions={[
                              { label: 'View', icon: Eye, onClick: () => onViewAssessment?.(item) },
                              { label: 'Delete', icon: Trash2, destructive: true, onClick: () => handleDeleteAssessment(item) },
                            ]}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden">
              {assessments.map((item) => {
                const statusMeta = assessmentStatusMeta(item.status)
                const name = assessmentDisplayName(item.name, patient?.full_name)
                return (
                  <div className="doc-row" key={item.id}>
                    <span className="type-icon"><ClipboardList size={16} strokeWidth={1.5} /></span>
                    <div className="doc-main">
                      <span className="doc-name">{name}</span>
                      <span className="doc-meta">
                        {['Administered ' + formatDate(item.date), item.uploaded_by_name].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="doc-end">
                      <span className={statusMeta.cls}>{statusMeta.label}</span>
                      <RowMenu
                        label={name}
                        actions={[
                          { label: 'View', icon: Eye, onClick: () => onViewAssessment?.(item) },
                          { label: 'Delete', icon: Trash2, destructive: true, onClick: () => handleDeleteAssessment(item) },
                        ]}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Documents */}
      <div className="card card-flush">
        <div className="doc-section-head">
          <h3 className="t-h3">Documents</h3>
        </div>
        <Toolbar
          search={docSearch}
          onSearchChange={setDocSearch}
          searchPlaceholder="Search documents"
          filterOptions={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          filterValue={docCategory}
          onFilterChange={setDocCategory}
        />
        {documents.length === 0 ? (
          <div className="empty">
            <FileText size={20} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} aria-hidden="true" />
            <h3 className="empty-title">No documents yet</h3>
            <p className="empty-body">Uploaded documents for this patient will appear here.</p>
            <button type="button" className="btn btn-primary" onClick={onUploadClick}>
              <Upload size={16} strokeWidth={1.5} />
              Upload document
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Uploaded</th>
                    <th>Size</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((item) => {
                    const Icon = getFileIcon(item.file_type)
                    const categoryLabel = CATEGORY_LABELS[item.category] || item.category
                    const showCategory = categoryLabel && categoryLabel.toLowerCase() !== item.name?.toLowerCase()
                    const statusMeta = item.status !== 'completed' ? documentStatusMeta(item.status) : null
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span className="type-icon"><Icon size={16} strokeWidth={1.5} /></span>
                            <span className="doc-name">{item.name}</span>
                          </div>
                        </td>
                        <td>{showCategory ? categoryLabel : <span className="status-quiet">—</span>}</td>
                        <td>
                          {[formatDate(item.date), item.uploaded_by_name].filter(Boolean).join(' · ')}
                          {statusMeta && <> · <span className={statusMeta.cls} style={statusMeta.bold ? { fontWeight: 600 } : undefined}>{statusMeta.label}</span></>}
                        </td>
                        <td>{formatFileSize(item.file_size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <RowMenu
                            label={item.name}
                            actions={[
                              { label: 'View', icon: Eye, onClick: () => onPreview?.(item) },
                              { label: 'Download', icon: Download, onClick: () => window.open(getDocumentDownloadUrl(patientId, item.id), '_blank') },
                              { label: 'Edit', icon: Pencil, onClick: () => openEdit(item) },
                              { label: 'Delete', icon: Trash2, destructive: true, onClick: () => handleDeleteDocument(item) },
                            ]}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden">
              {documents.map((item) => {
                const Icon = getFileIcon(item.file_type)
                const categoryLabel = CATEGORY_LABELS[item.category] || item.category
                const showCategory = categoryLabel && categoryLabel.toLowerCase() !== item.name?.toLowerCase()
                const statusMeta = item.status !== 'completed' ? documentStatusMeta(item.status) : null
                return (
                  <div className="doc-row" key={item.id}>
                    <span className="type-icon"><Icon size={16} strokeWidth={1.5} /></span>
                    <div className="doc-main">
                      <span className="doc-name">{item.name}</span>
                      <span className="doc-meta">
                        {[showCategory ? categoryLabel : null, formatDate(item.date), formatFileSize(item.file_size)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="doc-end">
                      {statusMeta && <span className={statusMeta.cls} style={statusMeta.bold ? { fontWeight: 600 } : undefined}>{statusMeta.label}</span>}
                      <RowMenu
                        label={item.name}
                        actions={[
                          { label: 'View', icon: Eye, onClick: () => onPreview?.(item) },
                          { label: 'Download', icon: Download, onClick: () => window.open(getDocumentDownloadUrl(patientId, item.id), '_blank') },
                          { label: 'Edit', icon: Pencil, onClick: () => openEdit(item) },
                          { label: 'Delete', icon: Trash2, destructive: true, onClick: () => handleDeleteDocument(item) },
                        ]}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Edit document modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-doc-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingItem(null) }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
              <h3 id="edit-doc-title" className="modal-title">Edit document</h3>
              <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Close" onClick={() => setEditingItem(null)}>
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div className="field-head">
                <label htmlFor="edit_doc_name">Name</label>
              </div>
              <input
                id="edit_doc_name"
                type="text"
                className="input"
                value={editForm.display_name}
                onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div>
              <div className="field-head">
                <label htmlFor="edit_doc_notes">Notes</label>
                <span className="field-optional">Optional</span>
              </div>
              <textarea
                id="edit_doc_notes"
                className="textarea"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Add notes…"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleEditSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
