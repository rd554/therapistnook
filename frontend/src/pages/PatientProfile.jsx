import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  User, ArrowLeft, Phone, Mail, AlertCircle, Calendar, ChevronDown, ChevronRight, Copy,
  FileText, Brain, Activity, FolderOpen, Edit, Clock, CheckCircle, Upload,
  Video, Building, Plus, ExternalLink, CreditCard, IndianRupee, Receipt, Loader2, Download,
} from 'lucide-react'
import { getPatient, getClinicalHistorySummary, getPatientAppointments, createAppointment, getPatientPaymentHistory, getInvoicePdfUrl, getPaymentReceipt, createBulkInvoice } from '../api/client'
import { formatDate, formatDateBadge, formatSessionTime } from '../utils/date'
import { formatCurrency, formatAmountParts, formatAmountSpoken, getSessionTypeLabel, derivePaymentStatus, paymentStatusMeta } from '../utils/payments'
import { MonthCheckbox, BulkInvoiceBar, useBulkInvoiceSelection } from '../components/payments/BulkInvoiceBar'
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
  NoDocuments,
  NoSessionRecordings,
  PageLoader,
  Button,
  IconButton,
  SectionDropdown,
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

  // Switching tabs is a searchParams change, not a route navigation, so the
  // browser has no reason to reset scroll on its own - without this, a tab
  // switch lands wherever the previous (often taller/shorter) tab had you
  // scrolled to, which reads as "the page jumped to the middle" rather than
  // opening at its own top.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [activeTab])

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

  // Clinical History's completion state is shown by the wizard's own step
  // rail/progress bar, not repeated here as a switcher badge.
  const getDropdownOptions = () => TABS

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
      {/* Header: Back + Name | Edit Profile (above the Patient Information card) | Section Dropdown (page's right edge) */}
      {/* Clinical Intelligence, Overview, Sessions, Payments, Documents and
          Session Intelligence each render their own Clinical-Ink header (back
          icon, .t-h1 name, .btn-secondary section switcher) inside the tab
          itself — both header rows below are skipped for those tabs rather
          than made to carry .clinical-ink styling, which would leak onto
          every other tab sharing this same wrapper. See
          ClinicalIntelligenceTab.jsx, OverviewTab, PatientSessionsTab,
          PatientPaymentsTab, DocumentsTab and SessionIntelligenceTab below. */}
      {/* Tablet/desktop: original single-row layout, unchanged */}
      {activeTab !== 'clinical-intelligence' && activeTab !== 'overview' && activeTab !== 'sessions' && activeTab !== 'payments' && activeTab !== 'clinical-history' && activeTab !== 'documents' && activeTab !== 'session-intelligence' && (
      <div className="hidden sm:flex relative z-20 items-center gap-12">
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

        {/* Section Dropdown - pinned to the page's right edge. Wrapped (rather than
            passing `absolute` into SectionDropdown's own className) because that
            component's root div hardcodes `relative`, which wins the cascade over
            an `absolute` utility applied to the same element. */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <SectionDropdown
            value={activeTab}
            onChange={setActiveTab}
            options={getDropdownOptions()}
            maxWidth="240px"
            variant="grey"
            align="right"
          />
        </div>
      </div>
      )}

      {/* Mobile: name gets its own full row (smaller font, no age/gender line);
          dropdown below so it has room to actually show its label instead of
          being squeezed unreadable */}
      {activeTab !== 'clinical-intelligence' && activeTab !== 'overview' && activeTab !== 'sessions' && activeTab !== 'payments' && activeTab !== 'clinical-history' && activeTab !== 'documents' && activeTab !== 'session-intelligence' && (
      <div className="flex sm:hidden relative z-20 flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${baseUrl}/patients`)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-content-secondary" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="profile-header-compact text-lg truncate">{patient.full_name}</h1>
            {patient.status === 'archived' && <StatusChip status="archived" size="sm" />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SectionDropdown
            value={activeTab}
            onChange={setActiveTab}
            options={getDropdownOptions()}
            className="flex-1"
            maxWidth="none"
            variant="grey"
          />
        </div>
      </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <OverviewTab
          patient={patient}
          patientId={patientId}
          activeTab={activeTab}
          onSectionChange={setActiveTab}
          sectionOptions={getDropdownOptions()}
          onBack={() => navigate(`${baseUrl}/patients`)}
        />
      ) : activeTab === 'sessions' ? (
        <PatientSessionsTab
          patientId={patientId}
          patient={patient}
          sectionOptions={getDropdownOptions()}
          onSectionChange={setActiveTab}
          onBack={() => navigate(`${baseUrl}/patients`)}
        />
      ) : activeTab === 'payments' ? (
        <PatientPaymentsTab
          patientId={patientId}
          patient={patient}
          sectionOptions={getDropdownOptions()}
          onSectionChange={setActiveTab}
          onBack={() => navigate(`${baseUrl}/patients`)}
        />
      ) : activeTab === 'clinical-history' ? (
        <ClinicalHistoryWizard
          patientId={patientId}
          patient={patient}
          onComplete={handleClinicalHistoryComplete}
          sectionOptions={getDropdownOptions()}
          onSectionChange={setActiveTab}
          onBack={() => navigate(`${baseUrl}/patients`)}
        />
      ) : activeTab === 'documents' ? (
        <DocumentsTab
          patientId={patientId}
          patient={patient}
          sectionOptions={getDropdownOptions()}
          onSectionChange={setActiveTab}
          onBack={() => navigate(`${baseUrl}/patients`)}
        />
      ) : activeTab === 'session-intelligence' ? (
        <SessionIntelligenceTab
          patientId={patientId}
          patient={patient}
          sectionOptions={getDropdownOptions()}
          onSectionChange={setActiveTab}
          onBack={() => navigate(`${baseUrl}/patients`)}
        />
      ) : activeTab === 'clinical-intelligence' ? (
        <ClinicalIntelligenceTab
          patientId={patientId}
          patient={patient}
          activeTab={activeTab}
          onSectionChange={setActiveTab}
          sectionOptions={getDropdownOptions()}
          onBack={() => navigate(`${baseUrl}/patients`)}
        />
      ) : null}
    </div>
  )
}

function DocumentsTab({ patientId, patient, sectionOptions, onSectionChange, onBack }) {
  const [showUpload, setShowUpload] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState('')
  const [sectionOpen, setSectionOpen] = useState(false)
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const sectionRef = useRef(null)
  const mobileSectionRef = useRef(null)
  const uploadBtnDesktopRef = useRef(null)
  const uploadBtnMobileRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handleClickOutside(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) setSectionOpen(false)
    }
    if (sectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sectionOpen])

  useEffect(() => {
    function handleClickOutside(e) {
      if (mobileSectionRef.current && !mobileSectionRef.current.contains(e.target)) setMobileSectionOpen(false)
    }
    if (mobileSectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileSectionOpen])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  // Only one of these two buttons is ever visible at a given breakpoint —
  // the other is `display: none` via Tailwind's hidden/flex pair, and a
  // hidden element can't receive focus, so this always lands on the real one.
  const focusUploadButton = () => {
    const btn = uploadBtnDesktopRef.current?.offsetParent ? uploadBtnDesktopRef.current : uploadBtnMobileRef.current
    btn?.focus()
  }

  const closeUpload = () => {
    setShowUpload(false)
    requestAnimationFrame(focusUploadButton)
  }

  const handleUploadComplete = (count) => {
    setShowUpload(false)
    setRefreshKey((k) => k + 1)
    setToast(`${count} document${count !== 1 ? 's' : ''} uploaded`)
    requestAnimationFrame(focusUploadButton)
  }

  const handlePreview = (item) => setPreviewDoc(item)

  const handleViewAssessment = (item) => {
    if (item.assessment_type === 'mmpi2' && item.reference_id) {
      navigate(`/results/${item.reference_id}`)
    }
  }

  const currentSectionLabel = sentenceCase(
    sectionOptions?.find((o) => o.value === 'documents')?.label || 'Documents & assessments'
  )

  const switcher = (ref, open, setOpen, fullWidth) => (
    <div ref={ref} className={fullWidth ? 'grow' : undefined} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={fullWidth ? { width: '100%', justifyContent: 'space-between' } : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {currentSectionLabel}
        <ChevronDown size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={`menu-popover${fullWidth ? '' : ' align-right'}`} style={fullWidth ? { width: '100%' } : undefined}>
          {(sectionOptions || []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="menu-item"
              onClick={() => { onSectionChange?.(opt.value); setOpen(false) }}
            >
              {sentenceCase(opt.label)}{opt.badge ? ` · ${opt.badge}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="clinical-ink">
      {/* Desktop header — same shape as Overview/Sessions/Payments */}
      <div className="hidden sm:block">
        <div className="profile-head">
          <div className="profile-id">
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" title="Back to patients" onClick={onBack}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="profile-name">
              <h1 className="t-h1">{patient.full_name}</h1>
              <span className="t-body-s">
                {patient.age != null ? `${patient.age} yrs` : ''}
                {patient.age != null && patient.gender ? ' · ' : ''}
                {patient.gender}
              </span>
            </div>
          </div>
          <div className="profile-actions">
            {switcher(sectionRef, sectionOpen, setSectionOpen, false)}
          </div>
        </div>
      </div>

      {/* Mobile header — name only; the switcher already reads "Documents &
          assessments" directly below, so no separate section title repeats it. */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="profile-id">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="profile-name">
            <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>{patient.full_name}</h1>
          </div>
        </div>
        {switcher(mobileSectionRef, mobileSectionOpen, setMobileSectionOpen, true)}
        <button
          ref={uploadBtnMobileRef}
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => setShowUpload(true)}
        >
          <Upload size={16} strokeWidth={1.5} />
          Upload document
        </button>
      </div>

      {/* Desktop section head — the tab's one accent object (aside from the
          switcher). Dropped on mobile: the full-width button above replaces it. */}
      <div className="hidden sm:block">
        <div className="section-head" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 className="t-h2">Documents & assessments</h2>
          <button ref={uploadBtnDesktopRef} type="button" className="btn btn-primary" onClick={() => setShowUpload(true)}>
            <Upload size={16} strokeWidth={1.5} />
            Upload document
          </button>
        </div>
      </div>

      <DocumentsList
        patientId={patientId}
        patient={patient}
        refreshKey={refreshKey}
        onPreview={handlePreview}
        onViewAssessment={handleViewAssessment}
        onUploadClick={() => setShowUpload(true)}
      />

      {showUpload && (
        <DocumentUpload
          patientId={patientId}
          onUploadComplete={handleUploadComplete}
          onClose={closeUpload}
        />
      )}

      {previewDoc && (
        <DocumentPreview
          patientId={patientId}
          documentId={previewDoc.id}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {toast && (
        <div className="toast toast-wrap" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

// Sentence-cases a TABS label for the section switcher, mirroring
// ClinicalIntelligenceTab's own copy of this — kept local rather than
// shared since it's a two-line pure function, not worth a utils import.
function sentenceCase(label) {
  if (!label) return ''
  const lower = label.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function OverviewTab({ patient, patientId, sectionOptions, onSectionChange, onBack }) {
  const navigate = useNavigate()
  const [sectionOpen, setSectionOpen] = useState(false)
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const sectionRef = useRef(null)
  const mobileSectionRef = useRef(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    function handleClickOutside(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) setSectionOpen(false)
    }
    if (sectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sectionOpen])

  useEffect(() => {
    function handleClickOutside(e) {
      if (mobileSectionRef.current && !mobileSectionRef.current.contains(e.target)) setMobileSectionOpen(false)
    }
    if (mobileSectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileSectionOpen])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const handleCopy = async (text, label) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setToast(`${label} copied`)
    } catch {
      // Clipboard permission denied/unavailable — no toast reads as "not
      // copied" without raising an alarming error state for a minor action.
    }
  }

  const currentSectionLabel = sentenceCase(
    sectionOptions?.find(o => o.value === 'overview')?.label || 'Overview'
  )
  const editUrl = `/patients/${patientId}/edit`
  const dobValue = patient.date_of_birth
    ? `${formatDate(patient.date_of_birth)}${patient.age != null ? ` · ${patient.age} yrs` : ''}`
    : ''
  const statusLabel = patient.status === 'archived' ? 'Archived' : patient.status === 'active' ? 'Active' : sentenceCase(patient.status || '')
  const statusClass = patient.status === 'archived' ? 'status-quiet' : 'status-plain'

  const switcher = (ref, open, setOpen, fullWidth) => (
    <div ref={ref} className={fullWidth ? 'grow' : undefined} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={fullWidth ? { width: '100%', justifyContent: 'space-between' } : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {currentSectionLabel}
        <ChevronDown size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={`menu-popover${fullWidth ? '' : ' align-right'}`} style={fullWidth ? { width: '100%' } : undefined}>
          {(sectionOptions || []).map(opt => (
            <button
              key={opt.value}
              type="button"
              className="menu-item"
              onClick={() => { onSectionChange?.(opt.value); setOpen(false) }}
            >
              {sentenceCase(opt.label)}{opt.badge ? ` · ${opt.badge}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="clinical-ink">
      {/* Desktop header — matches ClinicalIntelligenceTab's .ci-patient-head
          exactly, with a third element (Edit profile) in the right group, so
          this uses .profile-* rather than reusing .ci-patient-head itself.
          Wrapped in "hidden sm:block" rather than putting "hidden sm:flex"
          directly on .profile-head: that class's own display:flex is
          (0,2,0) once scoped and beats Tailwind's .hidden (0,1,0) regardless
          of source order (tokens.css is unlayered, so it outranks Tailwind's
          utilities layer entirely) — see clinical-ink-css-specificity-pitfalls. */}
      <div className="hidden sm:block">
        <div className="profile-head">
          <div className="profile-id">
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" title="Back to patients" onClick={onBack}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="profile-name">
              <h1 className="t-h1">{patient.full_name}</h1>
              <span className="t-body-s">
                {patient.age != null ? `${patient.age} yrs` : ''}
                {patient.age != null && patient.gender ? ' · ' : ''}
                {patient.gender}
              </span>
            </div>
          </div>
          <div className="profile-actions">
            <Link to={editUrl} className="btn btn-primary">
              <Edit size={16} strokeWidth={1.5} />
              Edit profile
            </Link>
            {switcher(sectionRef, sectionOpen, setSectionOpen, false)}
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-7)' }}>
        <div className="profile-id">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="profile-name">
            <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>{patient.full_name}</h1>
            <span className="t-body-s">
              {patient.age != null ? `${patient.age} yrs` : ''}
              {patient.age != null && patient.gender ? ' · ' : ''}
              {patient.gender}
            </span>
          </div>
        </div>
        <div className="action-row">
          <Link to={editUrl} className="btn btn-primary">
            Edit profile
          </Link>
          {switcher(mobileSectionRef, mobileSectionOpen, setMobileSectionOpen, true)}
        </div>
      </div>

      <div className="card profile-info-card">
        <div className="ci-card-head">
          <span className="icon-badge"><User size={16} strokeWidth={1.5} /></span>
          <h2 className="t-h3">Patient information</h2>
        </div>

        <div className="field-group">
          <span className="t-h4 field-group-label">Identity</span>
          <dl className="field-grid">
            <div className="field-item">
              <dt className="field-label">Full name</dt>
              <dd className="field-value">{patient.full_name}</dd>
            </div>
            <div className="field-item">
              <dt className="field-label">Date of birth</dt>
              <dd className="field-value field-value-num">{dobValue || <span className="field-empty">Not provided</span>}</dd>
            </div>
            <div className="field-item">
              <dt className="field-label">Gender</dt>
              <dd className="field-value">{patient.gender || <span className="field-empty">Not provided</span>}</dd>
            </div>
          </dl>
        </div>

        <div className="field-group">
          <span className="t-h4 field-group-label">Contact</span>
          <dl className="field-grid">
            <div className="field-item">
              <dt className="field-label">Phone</dt>
              <dd className="field-value">
                {patient.phone ? (
                  <>
                    <a href={`tel:${patient.phone}`} className="field-link">{patient.phone}</a>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-icon-sm field-copy"
                      aria-label="Copy phone number"
                      title="Copy phone number"
                      onClick={() => handleCopy(patient.phone, 'Phone number')}
                    >
                      <Copy size={14} strokeWidth={1.5} />
                    </button>
                  </>
                ) : (
                  <span className="field-empty">Not provided</span>
                )}
              </dd>
            </div>
            <div className="field-item">
              <dt className="field-label">Email</dt>
              <dd className="field-value">
                {patient.email ? (
                  <>
                    <a href={`mailto:${patient.email}`} className="field-link">{patient.email}</a>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-icon-sm field-copy"
                      aria-label="Copy email address"
                      title="Copy email address"
                      onClick={() => handleCopy(patient.email, 'Email address')}
                    >
                      <Copy size={14} strokeWidth={1.5} />
                    </button>
                  </>
                ) : (
                  <div className="field-empty-row">
                    <span className="field-empty">Not provided</span>
                    <button type="button" className="field-add" onClick={() => navigate(`${editUrl}?focus=email`)}>Add</button>
                  </div>
                )}
              </dd>
            </div>
            <div className="field-item">
              <dt className="field-label">Emergency contact</dt>
              <dd className="field-value">
                {patient.emergency_contact ? (
                  patient.emergency_contact
                ) : (
                  <div className="field-empty-row">
                    <span className="field-empty">Not provided</span>
                    <button type="button" className="field-add" onClick={() => navigate(`${editUrl}?focus=emergency_contact`)}>Add</button>
                  </div>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="field-group">
          <span className="t-h4 field-group-label">Practice</span>
          <dl className="field-grid">
            <div className="field-item">
              <dt className="field-label">Status</dt>
              <dd className={statusClass}>{statusLabel}</dd>
            </div>
            <div className="field-item">
              <dt className="field-label">Patient since</dt>
              <dd className="field-value field-value-num">{formatDate(patient.created_at) || <span className="field-empty">Not provided</span>}</dd>
            </div>
            <div className="field-item">
              <dt className="field-label">Referral source</dt>
              <dd className="field-value">{patient.referral_source || <span className="field-empty">Not provided</span>}</dd>
            </div>
            <div className="field-item">
              <dt className="field-label">Billing address</dt>
              <dd className="field-value">
                {patient.address ? (
                  <span style={{ whiteSpace: 'pre-line' }}>{patient.address}</span>
                ) : (
                  <div className="field-empty-row">
                    <span className="field-empty">Not provided</span>
                    <button type="button" className="field-add" onClick={() => navigate(`${editUrl}?focus=address`)}>Add</button>
                  </div>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {toast && (
        <div className="toast toast-wrap" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

function SessionIntelligenceTab({ patientId, patient, sectionOptions, onSectionChange, onBack }) {
  const [showUpload, setShowUpload] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState('')
  const [sectionOpen, setSectionOpen] = useState(false)
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const sectionRef = useRef(null)
  const mobileSectionRef = useRef(null)
  const uploadBtnDesktopRef = useRef(null)
  const uploadBtnMobileRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) setSectionOpen(false)
    }
    if (sectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sectionOpen])

  useEffect(() => {
    function handleClickOutside(e) {
      if (mobileSectionRef.current && !mobileSectionRef.current.contains(e.target)) setMobileSectionOpen(false)
    }
    if (mobileSectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileSectionOpen])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  // Only one of these two buttons is ever visible at a given breakpoint —
  // see DocumentsTab's identical comment on the same pattern.
  const focusUploadButton = () => {
    const btn = uploadBtnDesktopRef.current?.offsetParent ? uploadBtnDesktopRef.current : uploadBtnMobileRef.current
    btn?.focus()
  }

  const closeUpload = () => {
    setShowUpload(false)
    requestAnimationFrame(focusUploadButton)
  }

  const handleUploadComplete = () => {
    setShowUpload(false)
    setRefreshKey(k => k + 1)
    setToast('Transcript uploaded')
    requestAnimationFrame(focusUploadButton)
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

  const currentSectionLabel = sentenceCase(
    sectionOptions?.find((o) => o.value === 'session-intelligence')?.label || 'Session intelligence'
  )

  const switcher = (ref, open, setOpen, fullWidth) => (
    <div ref={ref} className={fullWidth ? 'grow' : undefined} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={fullWidth ? { width: '100%', justifyContent: 'space-between' } : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {currentSectionLabel}
        <ChevronDown size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={`menu-popover${fullWidth ? '' : ' align-right'}`} style={fullWidth ? { width: '100%' } : undefined}>
          {(sectionOptions || []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="menu-item"
              onClick={() => { onSectionChange?.(opt.value); setOpen(false) }}
            >
              {sentenceCase(opt.label)}{opt.badge ? ` · ${opt.badge}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="clinical-ink">
      {/* Desktop header — same shape as Overview/Sessions/Payments/Documents */}
      <div className="hidden sm:block">
        <div className="profile-head">
          <div className="profile-id">
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" title="Back to patients" onClick={onBack}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="profile-name">
              <h1 className="t-h1">{patient.full_name}</h1>
              <span className="t-body-s">
                {patient.age != null ? `${patient.age} yrs` : ''}
                {patient.age != null && patient.gender ? ' · ' : ''}
                {patient.gender}
              </span>
            </div>
          </div>
          <div className="profile-actions">
            {switcher(sectionRef, sectionOpen, setSectionOpen, false)}
          </div>
        </div>
      </div>

      {/* Mobile header — name only; the switcher already reads "Session
          intelligence" directly below, so no separate section title repeats it. */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="profile-id">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="profile-name">
            <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>{patient.full_name}</h1>
          </div>
        </div>
        {switcher(mobileSectionRef, mobileSectionOpen, setMobileSectionOpen, true)}
        <button
          ref={uploadBtnMobileRef}
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => setShowUpload(true)}
        >
          <Upload size={16} strokeWidth={1.5} />
          Upload transcript
        </button>
      </div>

      {/* Desktop section head — the tab's one accent object (aside from the
          switcher). Dropped on mobile: the full-width button above replaces it. */}
      <div className="hidden sm:block">
        <div className="section-head" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 className="t-h2">Session intelligence</h2>
          <button ref={uploadBtnDesktopRef} type="button" className="btn btn-primary" onClick={() => setShowUpload(true)}>
            <Upload size={16} strokeWidth={1.5} />
            Upload transcript
          </button>
        </div>
      </div>

      <SessionsList
        key={refreshKey}
        patientId={patientId}
        onViewSession={handleViewSession}
        onUploadClick={() => setShowUpload(true)}
      />

      {showUpload && (
        <TranscriptUpload
          patientId={patientId}
          onUploadComplete={handleUploadComplete}
          onClose={closeUpload}
        />
      )}

      {toast && (
        <div className="toast toast-wrap" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

const SESSION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
]

function sessionStatusMeta(status) {
  switch (status) {
    case 'completed':   return { label: 'Completed',   cls: 'status-quiet' }
    case 'scheduled':   return { label: 'Scheduled',   cls: 'status-plain' }
    case 'no_show':     return { label: 'No-show',     cls: 'status-warn' }
    case 'cancelled':   return { label: 'Cancelled',   cls: 'status-quiet' }
    case 'rescheduled': return { label: 'Rescheduled', cls: 'status-plain' }
    default:            return { label: sentenceCase(status || ''), cls: 'status-plain' }
  }
}

function PatientSessionsTab({ patientId, patient, sectionOptions, onSectionChange, onBack }) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [filter, setFilter] = useState('all')
  const [sectionOpen, setSectionOpen] = useState(false)
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const sectionRef = useRef(null)
  const mobileSectionRef = useRef(null)

  useEffect(() => {
    loadAppointments()
  }, [patientId])

  useEffect(() => {
    function handleClickOutside(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) setSectionOpen(false)
    }
    if (sectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sectionOpen])

  useEffect(() => {
    function handleClickOutside(e) {
      if (mobileSectionRef.current && !mobileSectionRef.current.contains(e.target)) setMobileSectionOpen(false)
    }
    if (mobileSectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileSectionOpen])

  const loadAppointments = async () => {
    try {
      const data = await getPatientAppointments(patientId)
      setAppointments(data)
    } catch (err) {
      console.error('Failed to load sessions:', err)
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

  const now = new Date()
  const upcomingAppointments = appointments.filter(a => new Date(a.start_time) > now && a.status === 'scheduled')
  const pastAppointments = appointments.filter(a => new Date(a.start_time) <= now || a.status !== 'scheduled')
  const completedCount = appointments.filter(a => a.status === 'completed').length
  const noShowCount = appointments.filter(a => a.status === 'no_show').length

  // Upcoming reads soonest-first (what's next); All/Past read most-recent-first,
  // matching how Payments presents history.
  const filteredAppointments = filter === 'upcoming'
    ? [...upcomingAppointments].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    : filter === 'past'
    ? [...pastAppointments].sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    : [...appointments].sort((a, b) => new Date(b.start_time) - new Date(a.start_time))

  // At most one row on the page carries the next-session accent rule —
  // earliest upcoming appointment, regardless of which filter is active.
  const nextUpcomingId = [...upcomingAppointments]
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0]?.id

  const handleFilterKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const idx = SESSION_FILTERS.findIndex(f => f.value === filter)
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = SESSION_FILTERS[(idx + dir + SESSION_FILTERS.length) % SESSION_FILTERS.length]
    setFilter(next.value)
  }

  const currentSectionLabel = sentenceCase(
    sectionOptions?.find(o => o.value === 'sessions')?.label || 'Sessions'
  )

  const switcher = (ref, open, setOpen, fullWidth) => (
    <div ref={ref} className={fullWidth ? 'grow' : undefined} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={fullWidth ? { width: '100%', justifyContent: 'space-between' } : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {currentSectionLabel}
        <ChevronDown size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={`menu-popover${fullWidth ? '' : ' align-right'}`} style={fullWidth ? { width: '100%' } : undefined}>
          {(sectionOptions || []).map(opt => (
            <button
              key={opt.value}
              type="button"
              className="menu-item"
              onClick={() => { onSectionChange?.(opt.value); setOpen(false) }}
            >
              {sentenceCase(opt.label)}{opt.badge ? ` · ${opt.badge}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const scheduleButton = (full) => (
    <button
      type="button"
      className="btn btn-primary"
      style={full ? { width: '100%', justifyContent: 'center' } : undefined}
      onClick={() => setShowScheduleModal(true)}
    >
      <Plus size={16} strokeWidth={1.5} />
      Schedule session
    </button>
  )

  return (
    <div className="clinical-ink">
      {/* Desktop header — identical shape to Overview/Clinical Intelligence,
          minus a header-level primary action: Sessions' one accent button
          lives in the section head below, not duplicated up here. Wrapped in
          "hidden sm:block" rather than "hidden sm:flex" directly on
          .profile-head for the same specificity reason as Overview — see
          clinical-ink-css-specificity-pitfalls. */}
      <div className="hidden sm:block">
        <div className="profile-head">
          <div className="profile-id">
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" title="Back to patients" onClick={onBack}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="profile-name">
              <h1 className="t-h1">{patient.full_name}</h1>
              <span className="t-body-s">
                {patient.age != null ? `${patient.age} yrs` : ''}
                {patient.age != null && patient.gender ? ' · ' : ''}
                {patient.gender}
              </span>
            </div>
          </div>
          <div className="profile-actions">
            {switcher(sectionRef, sectionOpen, setSectionOpen, false)}
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-7)' }}>
        <div className="profile-id">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="profile-name">
            <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>{patient.full_name}</h1>
            <span className="t-body-s">
              {patient.age != null ? `${patient.age} yrs` : ''}
              {patient.age != null && patient.gender ? ' · ' : ''}
              {patient.gender}
            </span>
          </div>
        </div>
        {switcher(mobileSectionRef, mobileSectionOpen, setMobileSectionOpen, true)}
      </div>

      {/* Section head — Sessions' one accent object (nav aside): "Schedule
          session". Desktop and mobile are separate blocks (not one .section-head
          reflowed by media query) since .section-head is shared with the
          Dashboard cards, which must keep their plain row layout untouched. */}
      <div className="hidden sm:block">
        <div className="section-head" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 className="t-h2">Sessions</h2>
          {scheduleButton(false)}
        </div>
      </div>
      <div className="flex sm:hidden">
        <div className="session-head-m" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 className="t-h2">Sessions</h2>
          {scheduleButton(true)}
        </div>
      </div>

      {/* Stat strip — one bordered card, hairline-divided; the no-show count
          is the only coloured number on the page, and only when it's > 0. */}
      <div className="stat-row" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat">
          <span className="stat-label">Upcoming</span>
          <span className="stat-value">{upcomingAppointments.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{completedCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">No-shows</span>
          <span className={`stat-value${noShowCount > 0 ? ' is-warn' : ''}`}>{noShowCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total</span>
          <span className="stat-value">{appointments.length}</span>
        </div>
      </div>

      {/* Filter — graphite fill on the active option, a true tablist rather
          than three unlabelled buttons */}
      <div
        className="seg seg-filter"
        role="tablist"
        aria-label="Filter sessions"
        onKeyDown={handleFilterKeyDown}
        style={{ marginBottom: 'var(--space-4)' }}
      >
        {SESSION_FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            role="tab"
            id={`sessions-filter-${f.value}`}
            className="seg-option"
            aria-selected={filter === f.value}
            tabIndex={filter === f.value ? 0 : -1}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Session list — flush rows, one container, the whole row is the link */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div className="empty">
          <Calendar size={20} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} aria-hidden="true" />
          <h3 className="empty-title">
            {filter === 'upcoming' ? 'No upcoming sessions' : filter === 'past' ? 'No past sessions' : 'No sessions yet'}
          </h3>
          <p className="empty-body">Scheduled sessions for this patient will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap card-flush">
          {filteredAppointments.map((appt) => {
            const badge = formatDateBadge(appt.start_time)
            const timeLabel = formatSessionTime(appt.start_time, appt.end_time, appt.duration_minutes)
            const statusMeta = sessionStatusMeta(appt.status)
            const isOnline = appt.session_mode === 'online'
            const ModalityIcon = isOnline ? Video : Building
            const modalityLabel = isOnline ? 'Online' : 'In person'
            const rowLabel = `${formatDate(appt.start_time)}, ${timeLabel}, ${statusMeta.label}`
            return (
              <Link
                to="/calendar"
                key={appt.id}
                className={`session-row${appt.id === nextUpcomingId ? ' is-next' : ''}`}
                aria-label={rowLabel}
              >
                <div className="date-badge">
                  <span className="date-badge-m">{badge.month}</span>
                  <span className="date-badge-d">{badge.day}</span>
                </div>
                <div className="session-main">
                  <p className="session-time">{timeLabel}</p>
                  <p className="session-meta">
                    <ModalityIcon size={14} strokeWidth={1.5} aria-hidden="true" />
                    {getSessionTypeLabel(appt.session_type)} · {modalityLabel}
                  </p>
                </div>
                <span className={`session-status ${statusMeta.cls}`}>{statusMeta.label}</span>
                <ChevronRight size={16} strokeWidth={1.5} className="session-chevron" aria-hidden="true" />
              </Link>
            )
          })}
        </div>
      )}

      {showScheduleModal && (
        <ScheduleModal
          initialDate={new Date()}
          patients={[{ id: patientId, full_name: patient.full_name, age: patient.age, gender: patient.gender }]}
          onSubmit={handleScheduleSession}
          onScheduled={loadAppointments}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  )
}

// Splits a formatted amount into symbol/digits so the ₹ can render muted
// while the figure itself carries the row's weight — mirrors the dashboard
// PaymentsList widget's formatAmountParts.
function PatientPaymentsTab({ patientId, patient, sectionOptions, onSectionChange, onBack }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [generatingId, setGeneratingId] = useState(null)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [toast, setToast] = useState('')
  const [sectionOpen, setSectionOpen] = useState(false)
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const sectionRef = useRef(null)
  const mobileSectionRef = useRef(null)

  useEffect(() => {
    loadPayments()
  }, [patientId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    function handleClickOutside(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) setSectionOpen(false)
    }
    if (sectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sectionOpen])

  useEffect(() => {
    function handleClickOutside(e) {
      if (mobileSectionRef.current && !mobileSectionRef.current.contains(e.target)) setMobileSectionOpen(false)
    }
    if (mobileSectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileSectionOpen])

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

  // A session can be invoiced (individually or swept into a bulk invoice) as
  // long as it hasn't been invoiced yet and isn't failed/refunded/cancelled —
  // invoicing works ahead of payment now, not just after.
  const isInvoiceable = (p) => !p.receipt_id && (p.status === 'pending' || p.status === 'paid')

  // Group sessions by calendar month for display only — selection itself is
  // per-row and can span months, since the backend's bulk-invoice endpoint
  // has no month constraint, only a same-practitioner one (create_bulk_invoice,
  // main.py). Payments already come back ordered by appointment date (desc),
  // so insertion order here keeps the most recent month first.
  const monthGroups = useMemo(() => {
    const map = new Map()
    for (const p of payments) {
      const d = new Date(p.appointment_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          payments: [],
        })
      }
      map.get(key).payments.push(p)
    }
    return Array.from(map.values()).map((group) => ({
      ...group,
      total: group.payments.reduce((sum, p) => sum + p.amount, 0),
    }))
  }, [payments])

  // Once a selection exists it locks to that payment's practitioner — the
  // backend rejects a bulk invoice spanning more than one.
  const { selectedIds, selectedItems: selectedPayments, isSelectable, hasBlockedOthers, toggleRow, toggleGroup, clearSelection } =
    useBulkInvoiceSelection({ items: payments, isInvoiceable, lockKeyOf: (p) => p.practitioner_id })
  const toggleMonth = (group) => toggleGroup(group.payments)

  const handleGenerateSingle = async (paymentId) => {
    if (generatingId) return
    setGeneratingId(paymentId)
    try {
      await getPaymentReceipt(paymentId) // get-or-create
      await loadPayments()
      setToast('Invoice generated')
    } catch (err) {
      console.error('Failed to generate invoice:', err)
      setToast(err.userMessage || 'Failed to generate invoice')
    } finally {
      setGeneratingId(null)
    }
  }

  const handleBulkInvoice = async () => {
    if (bulkGenerating || selectedIds.size === 0) return
    setBulkGenerating(true)
    try {
      const receipt = await createBulkInvoice(patientId, Array.from(selectedIds))
      clearSelection()
      await loadPayments()
      setToast('Invoice generated')
      window.open(getInvoicePdfUrl(receipt.payment_id), '_blank')
    } catch (err) {
      console.error('Failed to create bulk invoice:', err)
      setToast(err.userMessage || 'Failed to create bulk invoice')
    } finally {
      setBulkGenerating(false)
    }
  }

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0)
  const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0)
  const totalInvoiced = payments.filter(p => p.receipt_id).length
  const selectedSum = selectedPayments.reduce((sum, p) => sum + p.amount, 0)

  const currentSectionLabel = sentenceCase(
    sectionOptions?.find(o => o.value === 'payments')?.label || 'Payments'
  )

  const switcher = (ref, open, setOpen, fullWidth) => (
    <div ref={ref} className={fullWidth ? 'grow' : undefined} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={fullWidth ? { width: '100%', justifyContent: 'space-between' } : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {currentSectionLabel}
        <ChevronDown size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={`menu-popover${fullWidth ? '' : ' align-right'}`} style={fullWidth ? { width: '100%' } : undefined}>
          {(sectionOptions || []).map(opt => (
            <button
              key={opt.value}
              type="button"
              className="menu-item"
              onClick={() => { onSectionChange?.(opt.value); setOpen(false) }}
            >
              {sentenceCase(opt.label)}{opt.badge ? ` · ${opt.badge}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="clinical-ink">
      {/* Desktop header — same shape as Overview/Sessions */}
      <div className="hidden sm:block">
        <div className="profile-head">
          <div className="profile-id">
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" title="Back to patients" onClick={onBack}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="profile-name">
              <h1 className="t-h1">{patient.full_name}</h1>
              <span className="t-body-s">
                {patient.age != null ? `${patient.age} yrs` : ''}
                {patient.age != null && patient.gender ? ' · ' : ''}
                {patient.gender}
              </span>
            </div>
          </div>
          <div className="profile-actions">
            {switcher(sectionRef, sectionOpen, setSectionOpen, false)}
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-7)' }}>
        <div className="profile-id">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="profile-name">
            <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>{patient.full_name}</h1>
            <span className="t-body-s">
              {patient.age != null ? `${patient.age} yrs` : ''}
              {patient.age != null && patient.gender ? ' · ' : ''}
              {patient.gender}
            </span>
          </div>
        </div>
        {switcher(mobileSectionRef, mobileSectionOpen, setMobileSectionOpen, true)}
      </div>

      {/* Section head — the one link leaves this patient for the practice-
          wide ledger, so it's labelled explicitly rather than a bare "View
          all". Desktop/mobile split for the same reason as Sessions'. */}
      <div className="hidden sm:block">
        <div className="section-head" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 className="t-h2">Payments</h2>
          <Link to="/payments" className="link">All practice payments</Link>
        </div>
      </div>
      <div className="flex sm:hidden">
        <div className="session-head-m" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 className="t-h2">Payments</h2>
          <Link to="/payments" className="link">All practice payments</Link>
        </div>
      </div>

      {/* Stat strip — Pending is the only coloured number, and only when > 0,
          same rule as Sessions' no-show count. */}
      <div className="stat-row" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat">
          <span className="stat-label">Total paid</span>
          <span className="stat-value">{formatCurrency(totalPaid)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pending</span>
          <span className={`stat-value${totalPending > 0 ? ' is-warn' : ''}`}>{formatCurrency(totalPending)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Invoiced</span>
          <span className="stat-value">{totalInvoiced}</span>
        </div>
      </div>

      {/* Payment list — grouped by month for display. Every row and every
          month header carries its own checkbox, always visible: bulk
          invoicing is core here, not a hover/mode-gated affordance. */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
        </div>
      ) : payments.length === 0 ? (
        <div className="empty">
          <Receipt size={20} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} aria-hidden="true" />
          <h3 className="empty-title">No payments yet</h3>
          <p className="empty-body">Payments from this patient's sessions will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap card-flush">
          {monthGroups.map((group) => {
            const eligible = group.payments.filter(isSelectable)
            const allSelected = eligible.length > 0 && eligible.every((p) => selectedIds.has(p.id))
            const someSelected = eligible.some((p) => selectedIds.has(p.id))

            return (
              <div key={group.key} className="month-group">
                <div className="month-head">
                  <MonthCheckbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    disabled={eligible.length === 0}
                    onChange={() => toggleMonth(group)}
                    label={`Select all in ${group.label}`}
                  />
                  <span className="month-head-label">{group.label}</span>
                  <span className="month-head-meta">
                    {group.payments.length} session{group.payments.length !== 1 ? 's' : ''} · {formatCurrency(group.total)}
                  </span>
                </div>

                {group.payments.map((payment) => {
                  const badge = formatDateBadge(payment.appointment_date)
                  const derivedStatus = derivePaymentStatus(payment)
                  const statusMeta = paymentStatusMeta(derivedStatus)
                  const flagged = derivedStatus === 'overdue' || derivedStatus === 'failed'
                  const selected = selectedIds.has(payment.id)
                  const selectable = isSelectable(payment)
                  const amountParts = formatAmountParts(payment.amount, payment.currency)
                  const checkboxLabel = `Select payment, ${badge.day} ${sentenceCase(badge.month)}, ${formatCurrency(payment.amount, payment.currency)}`
                  const checkboxTitle = !isInvoiceable(payment)
                    ? 'Already invoiced'
                    : !selectable
                      ? 'Different practitioner — clear the current selection to include this session'
                      : undefined

                  return (
                    <div key={payment.id} className={`pay-row${selected ? ' is-selected' : ''}${flagged ? ' is-overdue' : ''}`}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selected}
                        disabled={!selectable}
                        title={checkboxTitle}
                        onChange={() => toggleRow(payment)}
                        aria-label={checkboxLabel}
                      />
                      <div className="date-badge">
                        <span className="date-badge-m">{badge.month}</span>
                        <span className="date-badge-d">{badge.day}</span>
                      </div>
                      <div className="pay-main">
                        <span className="t-body-s">{getSessionTypeLabel(payment.session_type)}</span>
                      </div>
                      <div className="pay-foot">
                        <span className="pay-amount" aria-label={formatAmountSpoken(payment.amount, payment.currency)} style={!flagged ? { fontWeight: 500 } : undefined}>
                          <span className="cur">{amountParts.symbol}</span>{amountParts.digits}
                        </span>
                        <span className="pay-status"><span className={statusMeta.cls}>{statusMeta.label}</span></span>
                        {payment.receipt_id ? (
                          <a
                            href={getInvoicePdfUrl(payment.id)}
                            className="btn btn-ghost btn-icon btn-icon-sm pay-action"
                            aria-label="Download invoice"
                            title="Download invoice"
                          >
                            <Download size={16} strokeWidth={1.5} />
                          </a>
                        ) : isInvoiceable(payment) ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm pay-action"
                            disabled={generatingId === payment.id}
                            onClick={() => handleGenerateSingle(payment.id)}
                          >
                            {generatingId === payment.id ? 'Generating…' : 'Invoice'}
                          </button>
                        ) : (
                          <span className="status-quiet pay-action">—</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* Persistent (never unmounted) live region for the selection count —
          the bulk bar itself mounts/unmounts with the selection, so an
          aria-live region on it would announce nothing on the first
          checkbox and re-announce every button label on every later one. */}
      <span className="sr-only" role="status" aria-live="polite">
        {selectedIds.size > 0 ? `${selectedIds.size} session${selectedIds.size !== 1 ? 's' : ''} selected` : ''}
      </span>

      <BulkInvoiceBar
        count={selectedIds.size}
        sumLabel={formatCurrency(selectedSum)}
        note={hasBlockedOthers ? 'Only sessions with the same practitioner can be combined' : null}
        generating={bulkGenerating}
        generateLabel={`Generate invoice for ${selectedIds.size} session${selectedIds.size !== 1 ? 's' : ''}`}
        onClear={clearSelection}
        onGenerate={handleBulkInvoice}
      />

      {toast && (
        <div className="toast toast-wrap" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
