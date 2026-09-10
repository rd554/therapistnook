import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Plus, Loader2, Archive, RotateCcw, Edit, Eye,
  ArrowUpDown, Check, X, Upload, Download, FileSpreadsheet,
} from 'lucide-react'
import {
  listPatients, createPatient, archivePatient, restorePatient,
  listIntakeSubmissions, acceptIntakeSubmission, declineIntakeSubmission,
  downloadPatientBulkTemplate, bulkImportPatients,
} from '../api/client'
import {
  StatusChip,
  IntakeStatusChip,
  NoPatients,
  FormCard,
  FormField,
  FormGrid,
  FormActions,
  PageLoader,
  Alert,
  Button,
  IconButton,
  PhoneInput,
  SectionDropdown,
} from '../components/ui'

export default function PractitionerPatients() {
  const navigate = useNavigate()
  const baseUrl = '/patients'
  const [patients, setPatients] = useState([])
  const [intakeSubmissions, setIntakeSubmissions] = useState([])
  const [resolvingIntakeId, setResolvingIntakeId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('active')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
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

  useEffect(() => {
    load()
    loadIntake()
  }, [statusFilter, sortBy, sortOrder])

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

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()
  }

  if (loading) {
    return <PageLoader />
  }

  return (
    <div className="space-y-6">
      {/* Section Header - Outside Card */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-section-title text-content-primary shrink-0">Patients</h1>

        <div className="flex items-center gap-2 justify-end flex-wrap">
          <SectionDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
              { value: 'all', label: 'All' },
            ]}
            maxWidth="140px"
          />

          <button
            onClick={() => setShowForm(true)}
            className="workspace-header__btn workspace-header__btn--soft"
          >
            <Plus size={16} strokeWidth={1.5} />
            <span className="hidden sm:inline">Add Patient</span>
          </button>

          <button
            onClick={() => setShowBulkModal(true)}
            className="workspace-header__btn workspace-header__btn--soft"
          >
            <Upload size={16} strokeWidth={1.5} />
            <span className="hidden sm:inline">Bulk Upload</span>
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

      {/* Patient List */}
      {patients.length === 0 && intakeSubmissions.length === 0 ? (
        <NoPatients onAdd={() => setShowForm(true)} />
      ) : (
        <>
        {/* Desktop/tablet: elevated rows — one soft grey card per patient,
            matching the Dashboard's Recent Patients widget (bg #F1F5F9,
            16px radius, soft shadow) instead of one flat table surface. */}
        <div className="hidden lg:block space-y-2.5">
          {/* Header Row */}
          <div className="px-6 py-2 grid grid-cols-[minmax(0,1fr)_64px_84px_104px_104px_140px_96px] items-center gap-4 text-xs font-medium text-content-muted">
            <span>Name</span>
            <span>Age</span>
            <span>Gender</span>
            <span>Created</span>
            <span>Status</span>
            <span>Intake</span>
            <span className="w-24"></span>
          </div>

          {/* New Intake Submissions - awaiting Accept/Remove, always pinned to top.
              Lavender tint (not the neutral grey used for ordinary rows) so a
              row that's blocking on a decision still reads as distinct/urgent. */}
          {intakeSubmissions.map((s) => (
            <div
              key={`intake-${s.id}`}
              className="relative px-6 py-3.5 grid grid-cols-[minmax(0,1fr)_64px_84px_104px_104px_140px_96px] items-center gap-4 bg-primary-50 rounded-btn border border-dashed border-primary-300 shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0 text-left">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-text text-xs font-bold">
                  {getInitials(s.full_name)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-content-primary truncate">{s.full_name}</div>
                  {s.chief_complaint && (
                    <div className="text-content-muted text-xs truncate max-w-[220px]" title={s.chief_complaint}>
                      {s.chief_complaint}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-secondary text-sm">{s.age}</span>
              <span className="text-secondary text-sm">{s.gender}</span>
              <span className="text-content-muted text-xs">{formatDate(s.created_at)}</span>
              <StatusChip status="new_intake" size="sm" />
              <span className="text-content-muted text-xs">—</span>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => handleAcceptIntake(s)}
                  disabled={resolvingIntakeId === s.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-success-text hover:bg-green-800 rounded-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2} /> Accept
                </button>
                <button
                  onClick={() => handleDeclineIntake(s)}
                  disabled={resolvingIntakeId === s.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-error-text hover:bg-red-700 rounded-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} /> Remove
                </button>
              </div>
            </div>
          ))}

          {/* Patient Rows */}
          {patients.map((p) => (
            <div
              key={p.id}
              className="group px-6 py-3.5 grid grid-cols-[minmax(0,1fr)_64px_84px_104px_104px_140px_96px] items-center gap-4 bg-surface-subtle rounded-btn border border-slate-100 shadow-sm hover:bg-border-light transition-all"
            >
              <button
                onClick={() => navigate(`${baseUrl}/${p.id}`)}
                className="flex items-center gap-3 min-w-0 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary text-xs font-bold">
                  {getInitials(p.full_name)}
                </div>
                <span className="font-medium text-content-primary group-hover:text-primary transition-colors truncate">
                  {p.full_name}
                </span>
              </button>
              <span className="text-secondary text-sm">{p.age}</span>
              <span className="text-secondary text-sm">{p.gender}</span>
              <span className="text-content-muted text-xs">{formatDate(p.created_at)}</span>
              <StatusChip status={p.status} size="sm" />
              <IntakeStatusChip status={p.clinical_history_status} size="sm" />
              <div className="flex items-center gap-1 w-24 justify-end">
                <IconButton
                  icon={Eye}
                  label="View profile"
                  size="sm"
                  onClick={() => navigate(`${baseUrl}/${p.id}`)}
                />
                <IconButton
                  icon={Edit}
                  label="Edit"
                  size="sm"
                  onClick={() => navigate(`${baseUrl}/${p.id}/edit`)}
                />
                {p.status === 'active' ? (
                  <IconButton
                    icon={Archive}
                    label="Archive"
                    size="sm"
                    onClick={() => handleArchive(p)}
                  />
                ) : (
                  <IconButton
                    icon={RotateCcw}
                    label="Restore"
                    size="sm"
                    onClick={() => handleRestore(p)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Phone/tablet: same elevated-row-per-patient treatment as desktop,
            stacked into a compact layout instead of grid columns since
            there isn't room for them side by side. */}
        <div className="lg:hidden space-y-2.5">
          {/* New Intake Submissions */}
          {intakeSubmissions.map((s) => (
            <div key={`intake-m-${s.id}`} className="flex flex-col gap-2 px-4 py-3.5 bg-primary-50 rounded-btn border border-dashed border-primary-300 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-text text-xs font-bold">
                    {getInitials(s.full_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-content-primary truncate">{s.full_name}</div>
                    <div className="text-content-muted text-xs">{s.age} · {s.gender}</div>
                  </div>
                </div>
                <StatusChip status="new_intake" size="sm" />
              </div>
              {s.chief_complaint && (
                <div className="text-content-muted text-xs truncate pl-12" title={s.chief_complaint}>
                  {s.chief_complaint}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleAcceptIntake(s)}
                  disabled={resolvingIntakeId === s.id}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-success-text hover:bg-green-800 rounded-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2} /> Accept
                </button>
                <button
                  onClick={() => handleDeclineIntake(s)}
                  disabled={resolvingIntakeId === s.id}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-error-text hover:bg-red-700 rounded-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} /> Remove
                </button>
              </div>
            </div>
          ))}

          {/* Patient Rows */}
          {patients.map((p) => (
            <div key={`m-${p.id}`} className="group flex flex-col gap-2.5 px-4 py-3.5 bg-surface-subtle rounded-btn border border-slate-100 shadow-sm active:bg-border-light transition-all">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => navigate(`${baseUrl}/${p.id}`)}
                  className="flex items-center gap-3 min-w-0 text-left"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary text-xs font-bold">
                    {getInitials(p.full_name)}
                  </div>
                  <span className="font-medium text-content-primary group-hover:text-primary transition-colors truncate">
                    {p.full_name}
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton
                    icon={Eye}
                    label="View profile"
                    size="sm"
                    onClick={() => navigate(`${baseUrl}/${p.id}`)}
                  />
                  <IconButton
                    icon={Edit}
                    label="Edit"
                    size="sm"
                    onClick={() => navigate(`${baseUrl}/${p.id}/edit`)}
                  />
                  {p.status === 'active' ? (
                    <IconButton
                      icon={Archive}
                      label="Archive"
                      size="sm"
                      onClick={() => handleArchive(p)}
                    />
                  ) : (
                    <IconButton
                      icon={RotateCcw}
                      label="Restore"
                      size="sm"
                      onClick={() => handleRestore(p)}
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-secondary text-xs">
                <span>{p.age} yrs</span>
                <span>{p.gender}</span>
                <span className="text-content-muted">{formatDate(p.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <StatusChip status={p.status} size="sm" />
                <IntakeStatusChip status={p.clinical_history_status} size="sm" />
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  )
}
