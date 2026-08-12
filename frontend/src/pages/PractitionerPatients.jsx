import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Plus, Search, Loader2, Archive, RotateCcw, Edit, Eye,
  ArrowUpDown, ChevronDown, Check, X,
} from 'lucide-react'
import {
  listPatients, createPatient, archivePatient, restorePatient,
  listIntakeSubmissions, acceptIntakeSubmission, declineIntakeSubmission,
} from '../api/client'
import {
  StatusChip,
  IntakeStatusChip,
  NoPatients,
  NoResults,
  FormCard,
  FormField,
  FormGrid,
  FormActions,
  PageLoader,
  Alert,
  Button,
  IconButton,
  RowCard,
} from '../components/ui'

export default function PractitionerPatients() {
  const navigate = useNavigate()
  const baseUrl = '/patients'
  const [patients, setPatients] = useState([])
  const [intakeSubmissions, setIntakeSubmissions] = useState([])
  const [resolvingIntakeId, setResolvingIntakeId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
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
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const data = await listPatients({
        search: search || undefined,
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

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

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
      })
      setForm({
        full_name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        email: '',
        emergency_contact: '',
        referral_source: '',
      })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create patient')
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
      alert(err.response?.data?.detail || 'Failed to archive patient')
    }
  }

  const handleRestore = async (patient) => {
    try {
      await restorePatient(patient.id)
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to restore patient')
    }
  }

  const handleAcceptIntake = async (submission) => {
    setResolvingIntakeId(submission.id)
    try {
      await acceptIntakeSubmission(submission.id)
      setIntakeSubmissions(prev => prev.filter(s => s.id !== submission.id))
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to accept intake submission')
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
      alert(err.response?.data?.detail || 'Failed to remove intake submission')
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
    })
    setError('')
    setShowForm(false)
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  if (loading) {
    return <PageLoader />
  }

  return (
    <div className="space-y-6 max-w-[780px]">
      {/* Section Header - Outside Card */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-section-title text-content-primary">Patients</h1>
        
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Search */}
          <div className="relative max-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              className="input-field-sm !pl-8 w-full"
              placeholder="Search patients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          {/* Status Filter */}
          <div className="relative">
            <select
              className="input-field-sm pr-7 appearance-none cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted pointer-events-none" />
          </div>
          
          {/* Add Patient Button */}
          <button
            onClick={() => setShowForm(true)}
            className="workspace-header__btn workspace-header__btn--soft"
          >
            <Plus size={16} strokeWidth={1.5} />
            <span>Add Patient</span>
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
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
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

      {/* Patient List */}
      {patients.length === 0 && intakeSubmissions.length === 0 ? (
        search ? (
          <NoResults searchTerm={search} onClear={() => setSearch('')} />
        ) : (
          <NoPatients onAdd={() => setShowForm(true)} />
        )
      ) : (
        <div className="space-y-2.5">
          {/* Header Row - Transparent like Recent Patients */}
          <div className="px-4 grid grid-cols-[1.8fr_0.6fr_0.7fr_0.9fr_0.9fr_1.3fr_auto] items-center gap-4 text-xs font-normal text-content-muted">
            <span>Name</span>
            <span>Age</span>
            <span>Gender</span>
            <span>Created</span>
            <span>Status</span>
            <span>Intake</span>
            <span className="w-24"></span>
          </div>

          {/* New Intake Submissions - awaiting Accept/Remove, always pinned to top */}
          {intakeSubmissions.map((s) => (
            <RowCard
              key={`intake-${s.id}`}
              hoverable={false}
              className="grid grid-cols-[1.8fr_0.6fr_0.7fr_0.9fr_0.9fr_1.3fr_auto] items-center gap-4"
            >
              <div className="text-left">
                <div className="font-medium text-content-primary">{s.full_name}</div>
                {s.chief_complaint && (
                  <div className="text-content-muted text-xs truncate max-w-[260px]" title={s.chief_complaint}>
                    {s.chief_complaint}
                  </div>
                )}
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
            </RowCard>
          ))}

          {/* Patient Rows */}
          {patients.map((p) => (
            <RowCard 
              key={p.id}
              className="grid grid-cols-[1.8fr_0.6fr_0.7fr_0.9fr_0.9fr_1.3fr_auto] items-center gap-4"
            >
              <button
                onClick={() => navigate(`${baseUrl}/${p.id}`)}
                className="text-left font-medium text-content-primary hover:text-primary transition-colors"
              >
                {p.full_name}
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
            </RowCard>
          ))}
        </div>
      )}
    </div>
  )
}
