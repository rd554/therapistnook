import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  User, ArrowLeft, Phone, Mail, AlertCircle, Calendar, 
  FileText, Brain, Activity, FolderOpen, Edit, Clock, CheckCircle, Upload,
  Video, Building, Plus, ExternalLink, CreditCard, IndianRupee, Receipt, Loader2,
} from 'lucide-react'
import { getPatient, getClinicalHistorySummary, getPatientAppointments, createAppointment, getPatientPaymentHistory, getInvoicePdfUrl } from '../api/client'
import ClinicalHistoryWizard from '../components/ClinicalHistoryWizard'
import DocumentUpload from '../components/DocumentUpload'
import DocumentsList from '../components/DocumentsList'
import DocumentPreview from '../components/DocumentPreview'
// Audio session recording/upload is disabled for now in favor of transcript
// upload (see TranscriptUpload.jsx) — kept here, unused, in case it's revisited.
// import SessionUpload from '../components/SessionUpload'
import TranscriptUpload from '../components/TranscriptUpload'
import SessionsList from '../components/SessionsList'
import SessionDetail from '../components/SessionDetail'
import ClinicalIntelligenceTab from '../components/ClinicalIntelligenceTab'
import ScheduleModal from '../components/ScheduleModal'
import {
  StatusChip,
  MetricCard,
  MetricCardGrid,
  FilterTabs,
  NoSessions,
  NoPayments,
  NoDocuments,
  NoSessionRecordings,
  PageLoader,
  Button,
  IconButton,
  SectionDropdown,
  RowCard,
} from '../components/ui'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'payments', label: 'Payments' },
  { value: 'clinical-history', label: 'Clinical History' },
  { value: 'documents', label: 'Documents & Assessments' },
  { value: 'session-intelligence', label: 'Session Intelligence' },
  { value: 'clinical-intelligence', label: 'Clinical Intelligence' },
]

export default function PatientProfile() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const baseUrl = ''
  const [patient, setPatient] = useState(null)
  const [clinicalHistorySummary, setClinicalHistorySummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Active tab lives in the URL (?tab=...) rather than plain component state so
  // a refresh (or a shared/back-button link) lands back on the module the
  // practitioner was actually viewing instead of always resetting to Overview.
  // `replace: true` keeps tab switches out of browser history so Back still
  // goes to the patient list, not through every tab visited.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some(tab => tab.value === tabParam) ? tabParam : 'overview'
  const setActiveTab = (tab) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (tab === 'overview') {
        next.delete('tab')
      } else {
        next.set('tab', tab)
      }
      return next
    }, { replace: true })
  }

  const loadData = async () => {
    try {
      const [patientData, chSummary] = await Promise.all([
        getPatient(patientId),
        getClinicalHistorySummary(patientId).catch(() => ({ status: 'not_started', current_step: 1 })),
      ])
      setPatient(patientData)
      setClinicalHistorySummary(chSummary)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load patient')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [patientId])

  const handleClinicalHistoryComplete = () => {
    loadData()
    setActiveTab('overview')
  }

  const getDropdownOptions = () => {
    return TABS.map(tab => {
      if (tab.value === 'clinical-history') {
        const chStatus = clinicalHistorySummary?.status
        return {
          ...tab,
          badge: chStatus === 'completed' ? '✓' : chStatus === 'in_progress' ? 'In Progress' : null
        }
      }
      return tab
    })
  }

  if (loading) {
    return <PageLoader />
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card w-full max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-error-text" />
          <h2 className="text-lg font-bold text-content-primary">Error</h2>
          <p className="mt-2 text-secondary">{error}</p>
          <Button onClick={() => navigate(`${baseUrl}/patients`)} className="mt-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-[1120px]">
      {/* Header: Back + Name | Dropdown | Edit Profile */}
      <div className="flex items-center justify-between gap-12">
        {/* Left: Back + Name */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(`${baseUrl}/patients`)} 
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-content-secondary" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="profile-header-compact">{patient.full_name}</h1>
              {patient.status === 'archived' && <StatusChip status="archived" size="sm" />}
            </div>
            <p className="text-xs text-content-muted mt-0.5">{patient.age} years old • {patient.gender}</p>
          </div>
        </div>
        
        {/* Center: Section Dropdown */}
        <SectionDropdown
          value={activeTab}
          onChange={setActiveTab}
          options={getDropdownOptions()}
          maxWidth="200px"
          variant="sage"
        />
        
        {/* Right: Edit Profile - Overview tab only, kept in layout (invisible) elsewhere so the dropdown stays centered */}
        <Link
          to={`${baseUrl}/patients/${patientId}/edit`}
          className={`btn-secondary-sm ${activeTab !== 'overview' ? 'invisible pointer-events-none' : ''}`}
        >
          <Edit className="h-3.5 w-3.5" />
          Edit Profile
        </Link>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <OverviewTab patient={patient} />
      ) : activeTab === 'sessions' ? (
        <PatientSessionsTab patientId={patientId} patient={patient} />
      ) : activeTab === 'payments' ? (
        <PatientPaymentsTab patientId={patientId} />
      ) : activeTab === 'clinical-history' ? (
        <ClinicalHistoryWizard patientId={patientId} patient={patient} onComplete={handleClinicalHistoryComplete} />
      ) : activeTab === 'documents' ? (
        <DocumentsTab patientId={patientId} />
      ) : activeTab === 'session-intelligence' ? (
        <SessionIntelligenceTab patientId={patientId} />
      ) : activeTab === 'clinical-intelligence' ? (
        <ClinicalIntelligenceTab patientId={patientId} />
      ) : null}
    </div>
  )
}

function DocumentsTab({ patientId }) {
  const [showUpload, setShowUpload] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const navigate = useNavigate()

  const handleUploadComplete = () => {
    setShowUpload(false)
    setRefreshKey(k => k + 1)
  }

  const handlePreview = (item) => {
    setPreviewDoc(item)
  }

  const handleViewAssessment = (item) => {
    if (item.assessment_type === 'mmpi2' && item.reference_id) {
      navigate(`/results/${item.reference_id}`)
    }
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Section Header - Outside Card */}
      <div className="flex items-center justify-between gap-8">
        <h2 className="text-section-title text-content-primary">Documents & Assessments</h2>
        <button 
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Upload Document
        </button>
      </div>

      {/* Upload Panel */}
      {showUpload && (
        <DocumentUpload
          patientId={patientId}
          onUploadComplete={handleUploadComplete}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Documents List */}
      <div className="card">
        <DocumentsList
          key={refreshKey}
          patientId={patientId}
          onPreview={handlePreview}
          onViewAssessment={handleViewAssessment}
        />
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreview
          patientId={patientId}
          documentId={previewDoc.id}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  )
}

function OverviewTab({ patient }) {
  return (
    <div className="card mt-2 max-w-[728px]">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light">
          <User className="h-4.5 w-4.5 text-primary" strokeWidth={1.8} />
        </div>
        <h2 className="text-card-title">Patient Information</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoField label="Full Name" value={patient.full_name} />
        <InfoField label="Date of Birth" value={formatDate(patient.date_of_birth)} />
        <InfoField label="Age" value={`${patient.age} years`} />
        <InfoField label="Phone" value={patient.phone} />
        <InfoField label="Gender" value={patient.gender} />
        <InfoField label="Email" value={patient.email} />
        <InfoField label="Emergency Contact" value={patient.emergency_contact} />
        <InfoField label="Referral Source" value={patient.referral_source} />
        <InfoField label="Status" value={<StatusChip status={patient.status} />} />
        <InfoField label="Patient Since" value={formatDate(patient.created_at)} />
      </div>
    </div>
  )
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="label mb-0">{label}</p>
      <p className="mt-1 font-medium text-content-primary">
        {value || <span className="text-content-muted font-normal">Not provided</span>}
      </p>
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function SessionIntelligenceTab({ patientId }) {
  const [showUpload, setShowUpload] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleUploadComplete = () => {
    setShowUpload(false)
    setRefreshKey(k => k + 1)
  }

  const handleViewSession = (session, tab = 'transcript') => {
    setSelectedSession({ ...session, initialTab: tab })
  }

  const handleCloseDetail = () => {
    setSelectedSession(null)
    setRefreshKey(k => k + 1)
  }

  if (selectedSession) {
    return (
      <SessionDetail
        patientId={patientId}
        sessionId={selectedSession.id}
        initialTab={selectedSession.initialTab}
        onClose={handleCloseDetail}
      />
    )
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Section Header - Outside Card */}
      <div className="flex items-center justify-between gap-8">
        <h2 className="text-section-title text-content-primary">Session Intelligence</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Upload Transcript
        </button>
      </div>

      {/* Upload Panel */}
      {showUpload && (
        <TranscriptUpload
          patientId={patientId}
          onUploadComplete={handleUploadComplete}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Sessions List */}
      <div className="card">
        <SessionsList
          key={refreshKey}
          patientId={patientId}
          onViewSession={handleViewSession}
        />
      </div>
    </div>
  )
}

function PatientSessionsTab({ patientId, patient }) {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadAppointments()
  }, [patientId])

  const loadAppointments = async () => {
    try {
      const data = await getPatientAppointments(patientId)
      setAppointments(data)
    } catch (err) {
      console.error('Failed to load appointments:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleScheduleSession = async (data) => {
    try {
      await createAppointment(data)
      await loadAppointments()
      setShowScheduleModal(false)
    } catch (err) {
      throw err
    }
  }

  const formatDateTime = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const getSessionTypeLabel = (type) => {
    const labels = {
      therapy_session: 'Therapy Session',
      follow_up: 'Follow-up',
      assessment_session: 'Assessment',
      consultation: 'Consultation',
    }
    return labels[type] || type
  }

  const now = new Date()
  const upcomingAppointments = appointments.filter(a => new Date(a.start_time) > now && a.status === 'scheduled')
  const pastAppointments = appointments.filter(a => new Date(a.start_time) <= now || a.status !== 'scheduled')

  const filteredAppointments = filter === 'upcoming' ? upcomingAppointments
    : filter === 'past' ? pastAppointments
    : appointments

  return (
    <div className="space-y-6 pt-2">
      {/* Side-by-side layout: Metrics on left, Sessions list on right */}
      <div className="grid grid-cols-2 gap-8">
        {/* Left Column: Header + Metrics */}
        <div className="space-y-5 min-w-0 max-w-[460px]">
          <div className="flex items-center justify-between h-10">
            <h2 className="text-section-title text-content-primary">Sessions</h2>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="workspace-header__btn workspace-header__btn--soft"
            >
              <Plus size={16} strokeWidth={1.5} />
              <span>Schedule Session</span>
            </button>
          </div>

          {/* Stats */}
          <MetricCardGrid cols={3} className="!grid-cols-3 !gap-2">
            <MetricCard
              label="Upcoming"
              value={upcomingAppointments.length}
              semantic="info"
              variant="mini"
              className="summary-card-mini--compact !min-w-0"
            />
            <MetricCard
              label="Completed"
              value={appointments.filter(a => a.status === 'completed').length}
              semantic="success"
              variant="mini"
              className="summary-card-mini--compact !min-w-0"
            />
            <MetricCard
              label="Total Sessions"
              value={appointments.length}
              semantic="default"
              variant="mini"
              className="summary-card-mini--compact !min-w-0"
            />
          </MetricCardGrid>
        </div>

        {/* Right Column: Filter + Sessions List */}
        <div className="space-y-4 min-w-0">
          {/* Filter */}
          <FilterTabs
            value={filter}
            onChange={setFilter}
            size="sm"
            className="!p-[6px] h-10 flex items-center"
            options={[
              { value: 'all', label: 'All Sessions' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
            ]}
          />

          {/* Sessions List as Row Cards */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAppointments.length === 0 ? (
            <NoSessions onSchedule={() => setShowScheduleModal(true)} />
          ) : (
            <div className="space-y-2.5">
              {filteredAppointments.map((appt) => (
                <RowCard
                  key={appt.id}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100">
                    <span className="text-[9px] font-medium text-content-muted uppercase">
                      {new Date(appt.start_time).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-sm font-bold text-content-primary leading-none">
                      {new Date(appt.start_time).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content-primary whitespace-nowrap">{getSessionTypeLabel(appt.session_type)}</p>
                    <p className="text-xs text-content-muted mt-0.5 whitespace-nowrap">
                      {formatTime(appt.start_time)} - {formatTime(appt.end_time)} • {appt.duration_minutes} min
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-content-secondary whitespace-nowrap">
                    {appt.session_mode === 'online' ? (
                      <><Video className="h-3.5 w-3.5" /> Online</>
                    ) : (
                      <><Building className="h-3.5 w-3.5" /> In-Person</>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-auto shrink-0">
                    <StatusChip status={appt.status} size="sm" />
                    <button
                      onClick={() => navigate('/calendar')}
                      className="text-xs font-medium text-primary hover:text-primary-hover transition-colors"
                    >
                      View →
                    </button>
                  </div>
                </RowCard>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleModal
          initialDate={new Date()}
          patients={[{ id: patientId, full_name: patient.full_name, age: patient.age, gender: patient.gender }]}
          practitioners={[]}
          onSubmit={handleScheduleSession}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  )
}

function PatientPaymentsTab({ patientId }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPayments()
  }, [patientId])

  const loadPayments = async () => {
    try {
      const data = await getPatientPaymentHistory(patientId)
      setPayments(data)
    } catch (err) {
      console.error('Failed to load payment history:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount / 100)
  }

  const formatPaymentDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getSessionTypeLabel = (type) => {
    const labels = {
      therapy_session: 'Therapy Session',
      follow_up: 'Follow-up',
      assessment_session: 'Assessment',
      consultation: 'Consultation',
    }
    return labels[type] || type
  }

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0)
  const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6 pt-2">
      {/* Side-by-side layout: Metrics on left, Payments list on right */}
      <div className="grid grid-cols-2 gap-8">
        {/* Left Column: Header + Metrics */}
        <div className="space-y-5 min-w-0 max-w-[460px]">
          <div className="flex items-center justify-between gap-4 h-10">
            <h2 className="text-section-title text-content-primary">Payments</h2>
            <Link
              to="/payments"
              className="text-xs font-medium text-primary hover:text-primary-hover transition-colors"
            >
              View All →
            </Link>
          </div>

          {/* Stats */}
          <MetricCardGrid cols={3} className="!grid-cols-3 !gap-2">
            <MetricCard
              label="Total Paid"
              value={formatCurrency(totalPaid)}
              semantic="success"
              variant="mini"
              className="summary-card-mini--compact !min-w-0"
            />
            <MetricCard
              label="Pending"
              value={formatCurrency(totalPending)}
              semantic="warning"
              variant="mini"
              className="summary-card-mini--compact !min-w-0"
            />
            <MetricCard
              label="Transactions"
              value={payments.length}
              semantic="default"
              variant="mini"
              className="summary-card-mini--compact !min-w-0"
            />
          </MetricCardGrid>
        </div>

        {/* Right Column: Payments List */}
        <div className="space-y-3 min-w-0">
          {/* Payments List as Row Cards */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : payments.length === 0 ? (
            <NoPayments />
          ) : (
            <>
              {/* Header Row - Transparent like Recent Patients */}
              <div className="px-4 h-10 flex items-center gap-3 text-xs font-normal text-content-muted">
                <span className="w-[76px] shrink-0">Date</span>
                <span className="w-[150px] shrink-0">Session</span>
                <span className="w-[90px] shrink-0">Amount</span>
                <span className="ml-auto shrink-0 flex items-center gap-3">
                  <span className="w-[84px]">Status</span>
                  <span className="w-16"></span>
                </span>
              </div>

              {payments.map((payment) => (
                <RowCard
                  key={payment.id}
                  className="flex items-center gap-3"
                >
                  <span className="text-xs text-content-secondary w-[76px] shrink-0">
                    {formatPaymentDate(payment.appointment_date)}
                  </span>
                  <span className="text-sm text-content-primary w-[150px] shrink-0 whitespace-nowrap">
                    {getSessionTypeLabel(payment.session_type)}
                  </span>
                  <span className="text-sm font-medium text-content-primary w-[90px] shrink-0">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                  <div className="flex items-center gap-3 ml-auto shrink-0">
                    <StatusChip status={payment.status} size="sm" />
                    <div className="w-16 text-right">
                      {payment.status === 'paid' ? (
                        payment.receipt_number ? (
                          <a
                            href={getInvoicePdfUrl(payment.id)}
                            className="text-xs font-medium text-primary hover:text-primary-hover cursor-pointer"
                          >
                            Invoice →
                          </a>
                        ) : (
                          <span className="text-content-muted">—</span>
                        )
                      ) : (
                        <span className="text-xs font-medium text-primary hover:text-primary-hover cursor-pointer">
                          Pay Now →
                        </span>
                      )}
                    </div>
                  </div>
                </RowCard>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
