import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Users, Plus, Upload, Download, FileSpreadsheet, Check, X,
  Eye, Pencil, Archive, RotateCcw, MoreVertical, ChevronDown,
} from 'lucide-react'
import {
  listPatients, createPatient, archivePatient, restorePatient,
  listIntakeSubmissions, acceptIntakeSubmission, declineIntakeSubmission,
  listBookingRequests, acceptBookingRequest, cancelBookingRequest,
  downloadPatientBulkTemplate, bulkImportPatients,
} from '../api/client'
import {
  FormCard, FormField, FormGrid, FormActions, Alert, Button, PhoneInput, PageLoader,
} from '../components/ui'
import { formatDate as formatCreated, formatDateTime } from '../utils/date'

const STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

// Status/Intake cell content, shared by the desktop table and the mobile
// card's status line — design system's central "no green" law (§A): a
// column where almost every row says the same thing is quiet text, not a
// colored chip. Only a state that actually needs a decision (Pending) or
// is genuinely new (New Intake, handled separately below) earns a chip.
function StatusText({ status }) {
  return status === 'active'
    ? <span className="status-plain">Active</span>
    : <span className="status-quiet">Archived</span>
}

function IntakeText({ status }) {
  if (status === 'completed') return <span className="t-cell-muted">Completed</span>
  if (status === 'in_progress') return <span className="chip chip-pending">Pending</span>
  return <span className="t-cell-muted">—</span>
}

// Desktop row actions: hover/focus-reveal only (tokens.css's .row-actions),
// never colored at rest. Archive is the one destructive verb here — restore
// is a plain reversal, so it stays neutral even on hover (§B5).
function RowActions({ patient, onView, onEdit, onArchive, onRestore }) {
  return (
    <div className="row-actions">
      <button type="button" className="icon-btn" onClick={onView} aria-label="View profile" title="View profile">
        <Eye size={16} strokeWidth={1.5} />
      </button>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label="Edit patient" title="Edit patient">
        <Pencil size={16} strokeWidth={1.5} />
      </button>
      {patient.status === 'active' ? (
        <button type="button" className="icon-btn is-destructive" onClick={onArchive} aria-label="Archive patient" title="Archive patient">
          <Archive size={16} strokeWidth={1.5} />
        </button>
      ) : (
        <button type="button" className="icon-btn" onClick={onRestore} aria-label="Restore patient" title="Restore patient">
          <RotateCcw size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

// Touch collapses the same three verbs into a single always-visible kebab +
// popover (§C3) — .row-actions' hover-reveal has no equivalent without a
// pointer, so an explicit disclosure trigger replaces it here instead.
function CardMenu({ patient, onView, onEdit, onArchive, onRestore }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Patient actions">
        <MoreVertical size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />
      </button>
      {open && (
        <div className="menu-popover align-right">
          <button type="button" className="menu-item" onClick={() => { setOpen(false); onView() }}>
            <Eye size={14} strokeWidth={1.5} /> View profile
          </button>
          <button type="button" className="menu-item" onClick={() => { setOpen(false); onEdit() }}>
            <Pencil size={14} strokeWidth={1.5} /> Edit patient
          </button>
          {patient.status === 'active' ? (
            <button type="button" className="menu-item is-destructive" onClick={() => { setOpen(false); onArchive() }}>
              <Archive size={14} strokeWidth={1.5} /> Archive patient
            </button>
          ) : (
            <button type="button" className="menu-item" onClick={() => { setOpen(false); onRestore() }}>
              <RotateCcw size={14} strokeWidth={1.5} /> Restore patient
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PractitionerPatients() {
  const navigate = useNavigate()
  const location = useLocation()
  const baseUrl = '/patients'
  const [patients, setPatients] = useState([])
  const [intakeSubmissions, setIntakeSubmissions] = useState([])
  const [resolvingIntakeId, setResolvingIntakeId] = useState(null)
  // Public-profile "Book a session" requests — a free introductory call, a
  // separate lead source from the intake form above but resolved the same
  // way (Accept creates/matches a Patient + confirms the slot as a real
  // Appointment; Decline just removes the request). See booking_service.py.
  const [bookingRequests, setBookingRequests] = useState([])
  const [resolvingBookingId, setResolvingBookingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('active')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)
  const [sortBy] = useState('created_at')
  const [sortOrder] = useState('desc')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    emergency_contact: '',
    referral_source: '',
    address: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkFile, setBulkFile] = useState(null)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkError, setBulkError] = useState('')
  const bulkFileInputRef = useRef(null)

  const load = async () => {
    try {
      const data = await listPatients({
        status: statusFilter,
        sortBy,
        sortOrder,
      })
      setPatients(data)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const loadIntake = async () => {
    try {
      const data = await listIntakeSubmissions('pending')
      setIntakeSubmissions(data)
    } catch { /* handled */ }
  }

  const loadBookingRequests = async () => {
    try {
      const data = await listBookingRequests({ status: 'requested' })
      setBookingRequests(data)
    } catch { /* handled */ }
  }

  useEffect(() => {
    load()
    loadIntake()
    loadBookingRequests()
  }, [statusFilter, sortBy, sortOrder])

  // WorkspaceHeader's global "Add patient" navigates here with this flag
  // (§B6) since the page owns the actual form now. Clear the flag once
  // consumed so a back-navigation doesn't reopen it.
  useEffect(() => {
    if (location.state?.openCreate) {
      setShowForm(true)
      navigate(baseUrl, { replace: true, state: null })
    }
  }, [location.state])

  useEffect(() => {
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    if (filterOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createPatient({
        full_name: form.full_name,
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        phone: form.phone || null,
        email: form.email || null,
        emergency_contact: form.emergency_contact || null,
        referral_source: form.referral_source || null,
        address: form.address || null,
      })
      setForm({
        full_name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        email: '',
        emergency_contact: '',
        referral_source: '',
        address: '',
      })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.userMessage || 'Failed to create patient')
    } finally {
      setCreating(false)
    }
  }

  const handleArchive = async (patient) => {
    if (!window.confirm(`Are you sure you want to archive ${patient.full_name}?`)) return
    try {
      await archivePatient(patient.id)
      await load()
    } catch (err) {
      alert(err.userMessage || 'Failed to archive patient')
    }
  }

  const handleRestore = async (patient) => {
    try {
      await restorePatient(patient.id)
      await load()
    } catch (err) {
      alert(err.userMessage || 'Failed to restore patient')
    }
  }

  const handleAcceptIntake = async (submission) => {
    setResolvingIntakeId(submission.id)
    try {
      await acceptIntakeSubmission(submission.id)
      setIntakeSubmissions(prev => prev.filter(s => s.id !== submission.id))
      await load()
    } catch (err) {
      alert(err.userMessage || 'Failed to accept intake submission')
    } finally {
      setResolvingIntakeId(null)
    }
  }

  const handleDeclineIntake = async (submission) => {
    if (!window.confirm(`Remove ${submission.full_name}'s intake submission? This can't be undone.`)) return
    setResolvingIntakeId(submission.id)
    try {
      await declineIntakeSubmission(submission.id)
      setIntakeSubmissions(prev => prev.filter(s => s.id !== submission.id))
    } catch (err) {
      alert(err.userMessage || 'Failed to remove intake submission')
    } finally {
      setResolvingIntakeId(null)
    }
  }

  const handleAcceptBooking = async (booking) => {
    setResolvingBookingId(booking.id)
    try {
      await acceptBookingRequest(booking.id)
      setBookingRequests(prev => prev.filter(b => b.id !== booking.id))
      await load()
    } catch (err) {
      alert(err.userMessage || 'Failed to accept booking request')
    } finally {
      setResolvingBookingId(null)
    }
  }

  const handleDeclineBooking = async (booking) => {
    if (!window.confirm(`Decline ${booking.patient_name}'s call request? This can't be undone.`)) return
    setResolvingBookingId(booking.id)
    try {
      await cancelBookingRequest(booking.id, 'Declined by practitioner')
      setBookingRequests(prev => prev.filter(b => b.id !== booking.id))
    } catch (err) {
      alert(err.userMessage || 'Failed to decline booking request')
    } finally {
      setResolvingBookingId(null)
    }
  }

  const resetForm = () => {
    setForm({
      full_name: '',
      date_of_birth: '',
      gender: '',
      phone: '',
      email: '',
      emergency_contact: '',
      referral_source: '',
      address: '',
    })
    setError('')
    setShowForm(false)
  }

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true)
    setBulkError('')
    try {
      await downloadPatientBulkTemplate()
    } catch (err) {
      setBulkError(err.userMessage || 'Failed to download template')
    } finally {
      setDownloadingTemplate(false)
    }
  }

  const handleBulkUpload = async (e) => {
    e.preventDefault()
    if (!bulkFile) return
    setBulkUploading(true)
    setBulkError('')
    setBulkResult(null)
    try {
      const result = await bulkImportPatients(bulkFile)
      setBulkResult(result)
      if (result.created_count > 0) await load()
    } catch (err) {
      setBulkError(err.userMessage || 'Failed to upload file')
    } finally {
      setBulkUploading(false)
    }
  }

  const resetBulkModal = () => {
    setShowBulkModal(false)
    setBulkFile(null)
    setBulkResult(null)
    setBulkError('')
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = ''
  }

  if (loading) {
    return <PageLoader />
  }

  const currentFilterLabel = STATUS_FILTERS.find(f => f.value === statusFilter)?.label || 'Active'
  const isEmpty = patients.length === 0 && intakeSubmissions.length === 0 && bookingRequests.length === 0

  return (
    <div className="clinical-ink">
      <h1 className="t-h1" style={{ marginBottom: 'var(--space-6)' }}>Patients</h1>

      {/* One filter + actions row at every width — labels collapse to
          icon-only below `sm` (space-between keeps the filter left, actions
          right, same as before; text simply disappears on narrow screens
          instead of swapping to a second, separately-styled row). */}
      <div className="patients-header">
        <div ref={filterRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-ghost btn-filter"
            onClick={() => setFilterOpen((v) => !v)}
            aria-label="Filter patients"
          >
            {currentFilterLabel}
            <ChevronDown size={16} strokeWidth={1.5} />
          </button>
          {filterOpen && (
            <div className="menu-popover">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className="menu-item"
                  onClick={() => { setStatusFilter(f.value); setFilterOpen(false) }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="patients-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(true)} aria-label="Bulk upload" title="Bulk upload">
            <Upload size={16} strokeWidth={1.5} />
            <span className="hidden sm:inline">Bulk upload</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)} aria-label="Add patient" title="Add patient">
            <Plus size={16} strokeWidth={1.5} />
            <span className="hidden sm:inline">Add patient</span>
          </button>
        </div>
      </div>

      {/* Add Patient Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl animate-in zoom-in-95">
            <FormCard
              title="New Patient"
              subtitle="Add a new patient to your practice"
            >
              {error && (
                <Alert variant="error" className="mb-4">{error}</Alert>
              )}
              <form onSubmit={handleCreate}>
                <FormGrid cols={2}>
                  <FormField label="Full Name" required>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="John Doe"
                      required
                      value={form.full_name}
                      onChange={(e) => setForm(p => ({ ...p, full_name: e.target.value }))}
                    />
                  </FormField>
                  <FormField label="Date of Birth" required>
                    <input
                      type="date"
                      className="input-field"
                      required
                      max={new Date().toISOString().split('T')[0]}
                      value={form.date_of_birth}
                      onChange={(e) => setForm(p => ({ ...p, date_of_birth: e.target.value }))}
                    />
                  </FormField>
                  <FormField label="Gender" required>
                    <select
                      className="input-field"
                      required
                      value={form.gender}
                      onChange={(e) => setForm(p => ({ ...p, gender: e.target.value }))}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </FormField>
                  <FormField label="Phone">
                    <PhoneInput
                      value={form.phone}
                      onChange={(phone) => setForm(p => ({ ...p, phone }))}
                    />
                  </FormField>
                  <FormField label="Email">
                    <input
                      type="email"
                      className="input-field"
                      placeholder="patient@example.com"
                      value={form.email}
                      onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                    />
                  </FormField>
                  <FormField label="Emergency Contact">
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Name - Phone"
                      value={form.emergency_contact}
                      onChange={(e) => setForm(p => ({ ...p, emergency_contact: e.target.value }))}
                    />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="Referral Source">
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g., Dr. Smith, Self-referral, Hospital"
                        value={form.referral_source}
                        onChange={(e) => setForm(p => ({ ...p, referral_source: e.target.value }))}
                      />
                    </FormField>
                  </div>
                  <div className="sm:col-span-2">
                    <FormField label="Billing Address" hint="Used on the invoice PDF's Bill To section">
                      <textarea
                        className="input-field"
                        rows={3}
                        placeholder="Street address, city, state, PIN, country"
                        value={form.address}
                        onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))}
                      />
                    </FormField>
                  </div>
                </FormGrid>
                <FormActions>
                  <Button type="submit" isLoading={creating} leftIcon={Plus}>
                    Create Patient
                  </Button>
                  <Button type="button" variant="secondary" onClick={resetForm}>
                    Cancel
                  </Button>
                </FormActions>
              </form>
            </FormCard>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg animate-in zoom-in-95">
            <FormCard
              title="Bulk Upload Patients"
              subtitle="Import multiple patients at once from a spreadsheet"
            >
              {bulkError && (
                <Alert variant="error" className="mb-4">{bulkError}</Alert>
              )}

              {!bulkResult ? (
                <form onSubmit={handleBulkUpload} className="space-y-4">
                  <div className="text-sm text-content-secondary space-y-3">
                    <p>
                      Download the template, fill in one row per patient, then upload
                      the completed file. Patient Name, Date of Birth and Gender are
                      required — everything else is optional.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      leftIcon={Download}
                      isLoading={downloadingTemplate}
                      onClick={handleDownloadTemplate}
                    >
                      Download Template
                    </Button>
                  </div>

                  <FormField label="Completed File">
                    <input
                      ref={bulkFileInputRef}
                      type="file"
                      accept=".xlsx"
                      className="input-field"
                      onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                    />
                  </FormField>

                  <FormActions>
                    <Button type="submit" isLoading={bulkUploading} leftIcon={Upload} disabled={!bulkFile}>
                      Upload
                    </Button>
                    <Button type="button" variant="secondary" onClick={resetBulkModal}>
                      Cancel
                    </Button>
                  </FormActions>
                </form>
              ) : (
                <div className="space-y-4">
                  <Alert variant={bulkResult.error_count === 0 ? 'success' : 'warning'}>
                    {bulkResult.created_count} of {bulkResult.total_rows} patient
                    {bulkResult.total_rows === 1 ? '' : 's'} added
                    {bulkResult.error_count > 0
                      ? `. ${bulkResult.error_count} row${bulkResult.error_count === 1 ? '' : 's'} had errors and were skipped.`
                      : '.'}
                  </Alert>

                  {bulkResult.results.some(r => r.status === 'error') && (
                    <div className="max-h-64 overflow-y-auto space-y-2 border border-border-subtle rounded-card p-3">
                      {bulkResult.results.filter(r => r.status === 'error').map(r => (
                        <div key={r.row_number} className="text-sm">
                          <div className="font-medium text-content-primary flex items-center gap-1.5">
                            <FileSpreadsheet size={14} strokeWidth={1.5} className="text-content-muted" />
                            Row {r.row_number}{r.full_name ? ` — ${r.full_name}` : ''}
                          </div>
                          <ul className="ml-5 list-disc text-error-text text-xs">
                            {r.errors.map((msg, i) => <li key={i}>{msg}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  <FormActions>
                    <Button type="button" onClick={resetBulkModal}>
                      Done
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => { setBulkResult(null); setBulkFile(null); if (bulkFileInputRef.current) bulkFileInputRef.current.value = '' }}
                    >
                      Upload Another File
                    </Button>
                  </FormActions>
                </div>
              )}
            </FormCard>
          </div>
        </div>
      )}

      {/* Patient list */}
      {isEmpty ? (
        <div className="empty">
          <Users size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} />
          <h3 className="empty-title">No patients yet</h3>
          <p className="empty-body">Add your first patient to get started with clinical management.</p>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} strokeWidth={1.5} /> Add patient
          </button>
        </div>
      ) : (
        <>
          {/* Desktop/tablet: one flush table, per §B1 — rows are never
              individually tinted/rounded/shadowed. A row awaiting a decision
              (new intake) gets the shared .needs-action accent rule instead
              of a color tint. */}
          <div className="hidden lg:block table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 'auto' }}>Patient</th>
                  <th style={{ width: 160 }}>Details</th>
                  <th style={{ width: 120 }}>Created</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 140 }}>Intake</th>
                  <th style={{ width: 96 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {intakeSubmissions.map((s) => (
                  <tr key={`intake-${s.id}`} className="needs-action">
                    <td>
                      <span className="t-cell-key" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="avatar avatar-accent">{getInitials(s.full_name)}</span>
                        <span style={{ minWidth: 0 }}>
                          {s.full_name}
                          {s.chief_complaint && (
                            <span className="t-caption truncate" style={{ display: 'block' }}>{s.chief_complaint}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>{s.age} · {s.gender}</td>
                    <td className="cell-num t-cell-muted">{formatCreated(s.created_at)}</td>
                    <td><span className="chip chip-intake">New Intake</span></td>
                    <td className="t-cell-muted">—</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-icon-sm"
                          disabled={resolvingIntakeId === s.id}
                          onClick={() => handleAcceptIntake(s)}
                          aria-label="Accept intake"
                          title="Accept"
                        >
                          <Check size={16} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon-sm"
                          disabled={resolvingIntakeId === s.id}
                          onClick={() => handleDeclineIntake(s)}
                          aria-label="Remove intake submission"
                          title="Remove"
                        >
                          <X size={16} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {bookingRequests.map((b) => (
                  <tr key={`booking-${b.id}`} className="needs-action">
                    <td>
                      <span className="t-cell-key" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="avatar avatar-accent">{getInitials(b.patient_name)}</span>
                        <span style={{ minWidth: 0 }}>
                          {b.patient_name}
                          {b.patient_notes && (
                            <span className="t-caption truncate" style={{ display: 'block' }}>{b.patient_notes}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>{formatDateTime(b.requested_start_time)}</td>
                    <td className="cell-num t-cell-muted">{formatCreated(b.created_at)}</td>
                    <td><span className="chip chip-intake">Intro call</span></td>
                    <td className="t-cell-muted">—</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-icon-sm"
                          disabled={resolvingBookingId === b.id}
                          onClick={() => handleAcceptBooking(b)}
                          aria-label="Accept booking request"
                          title="Accept"
                        >
                          <Check size={16} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon-sm"
                          disabled={resolvingBookingId === b.id}
                          onClick={() => handleDeclineBooking(b)}
                          aria-label="Decline booking request"
                          title="Decline"
                        >
                          <X size={16} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {patients.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        type="button"
                        className="t-cell-key"
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => navigate(`${baseUrl}/${p.id}`)}
                      >
                        <span className="avatar">{getInitials(p.full_name)}</span>
                        {p.full_name}
                      </button>
                    </td>
                    <td>{p.age} · {p.gender}</td>
                    <td className="cell-num t-cell-muted">{formatCreated(p.created_at)}</td>
                    <td><StatusText status={p.status} /></td>
                    <td><IntakeText status={p.clinical_history_status} /></td>
                    <td>
                      <RowActions
                        patient={p}
                        onView={() => navigate(`${baseUrl}/${p.id}`)}
                        onEdit={() => navigate(`${baseUrl}/${p.id}/edit`)}
                        onArchive={() => handleArchive(p)}
                        onRestore={() => handleRestore(p)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards, single kebab per card (§C3) instead of
              three separate icon buttons. */}
          <div className="lg:hidden stack-cards">
            {intakeSubmissions.map((s) => (
              <div key={`intake-m-${s.id}`} className="card card-compact rule-accent">
                <div className="p-card-top">
                  <div className="p-card-id">
                    <span className="avatar avatar-accent">{getInitials(s.full_name)}</span>
                    <span className="t-cell-key truncate">{s.full_name}</span>
                  </div>
                  <div className="p-card-right">
                    <span className="chip chip-intake">New Intake</span>
                  </div>
                </div>
                <div className="p-card-meta t-body-s">{s.age} yrs · {s.gender} · {formatCreated(s.created_at)}</div>
                {s.chief_complaint && (
                  <div className="p-card-status t-cell-muted truncate">{s.chief_complaint}</div>
                )}
                <div className="mobile-actions-row" style={{ marginTop: 'var(--space-3)' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={resolvingIntakeId === s.id}
                    onClick={() => handleAcceptIntake(s)}
                  >
                    <Check size={14} strokeWidth={2} /> Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    disabled={resolvingIntakeId === s.id}
                    onClick={() => handleDeclineIntake(s)}
                  >
                    <X size={14} strokeWidth={2} /> Remove
                  </button>
                </div>
              </div>
            ))}

            {bookingRequests.map((b) => (
              <div key={`booking-m-${b.id}`} className="card card-compact rule-accent">
                <div className="p-card-top">
                  <div className="p-card-id">
                    <span className="avatar avatar-accent">{getInitials(b.patient_name)}</span>
                    <span className="t-cell-key truncate">{b.patient_name}</span>
                  </div>
                  <div className="p-card-right">
                    <span className="chip chip-intake">Intro call</span>
                  </div>
                </div>
                <div className="p-card-meta t-body-s">{formatDateTime(b.requested_start_time)}</div>
                {b.patient_notes && (
                  <div className="p-card-status t-cell-muted truncate">{b.patient_notes}</div>
                )}
                <div className="mobile-actions-row" style={{ marginTop: 'var(--space-3)' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={resolvingBookingId === b.id}
                    onClick={() => handleAcceptBooking(b)}
                  >
                    <Check size={14} strokeWidth={2} /> Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    disabled={resolvingBookingId === b.id}
                    onClick={() => handleDeclineBooking(b)}
                  >
                    <X size={14} strokeWidth={2} /> Decline
                  </button>
                </div>
              </div>
            ))}

            {patients.map((p) => (
              <div key={`m-${p.id}`} className="card card-compact">
                <div className="p-card-top">
                  <button
                    type="button"
                    className="p-card-id"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    onClick={() => navigate(`${baseUrl}/${p.id}`)}
                  >
                    <span className="avatar">{getInitials(p.full_name)}</span>
                    <span className="t-cell-key truncate">{p.full_name}</span>
                  </button>
                  <div className="p-card-right">
                    <CardMenu
                      patient={p}
                      onView={() => navigate(`${baseUrl}/${p.id}`)}
                      onEdit={() => navigate(`${baseUrl}/${p.id}/edit`)}
                      onArchive={() => handleArchive(p)}
                      onRestore={() => handleRestore(p)}
                    />
                  </div>
                </div>
                <div className="p-card-meta t-body-s">{p.age} yrs · {p.gender} · {formatCreated(p.created_at)}</div>
                <div className="p-card-status t-cell-muted">
                  {p.status === 'active' ? 'Active' : 'Archived'}
                  {p.status === 'active' && p.clinical_history_status === 'completed' && ' · Intake completed'}
                  {p.status === 'active' && p.clinical_history_status === 'in_progress' && ' · Intake pending'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
