import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Loader2,
  ClipboardList,
  Copy,
  Check,
  RefreshCw,
  X,
  FileText,
  Download,
  Eye,
  Link2,
  QrCode,
  Share2,
  XCircle,
} from 'lucide-react'
import {
  listAllAssessments,
  listPatients,
  getMe,
  createAssessment,
  updateAssessment,
  getPdfUrl,
} from '../api/client'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'expired', label: 'Expired' },
]

const ASSESSMENT_LABELS = {
  mmpi2: 'MMPI-2',
  phq9: 'PHQ-9',
  gad7: 'GAD-7',
  bdi2: 'BDI-II',
  mcmi: 'MCMI',
  big_five: 'Big Five',
  cognitive: 'Cognitive',
  custom: 'Custom',
}

const AVATAR_COLORS = [
  { bg: '#EEF2FF', text: '#4F46E5' },
  { bg: '#ECFDF5', text: '#059669' },
  { bg: '#FFF7ED', text: '#EA580C' },
  { bg: '#FDF2F8', text: '#DB2777' },
  { bg: '#F0F9FF', text: '#0284C7' },
]

function getInitials(name = '') {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function PatientAvatar({ name, index = 0, size = 44 }) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length]
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: color.bg,
        color: color.text,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
      aria-hidden="true"
    >
      {getInitials(name) || '?'}
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    pending: { label: 'Pending', bg: '#EFF6FF', color: '#2563EB' },
    in_progress: { label: 'In Progress', bg: '#FFFBEB', color: '#D97706' },
    completed: { label: 'Completed', bg: '#ECFDF5', color: '#16A34A' },
    expired: { label: 'Expired', bg: '#F3F4F6', color: '#6B7280' },
    cancelled: { label: 'Cancelled', bg: '#FEF2F2', color: '#DC2626' },
  }
  const style = map[status] || { label: status, bg: '#F3F4F6', color: '#6B7280' }

  return (
    <span
      className="inline-flex items-center capitalize shrink-0"
      style={{
        height: 28,
        padding: '0 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        background: style.bg,
        color: style.color,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {style.label}
    </span>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatRelativeDate(dateStr, status) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (status === 'completed') {
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) return 'Completed Today'
    return formatDate(dateStr)
  }

  if (status === 'pending' || status === 'in_progress') {
    if (diffMins < 1) return 'Sent just now'
    if (diffMins < 60) return `Sent ${diffMins} min ago`
    if (diffHours < 24) return `Sent ${diffHours}h ago`
  }

  return formatDate(dateStr)
}

function formatGender(gender) {
  if (!gender) return '—'
  const g = gender.toLowerCase()
  if (g === 'm' || g === 'male') return 'Male'
  if (g === 'f' || g === 'female') return 'Female'
  return gender.charAt(0).toUpperCase() + gender.slice(1)
}

export default function Assessments() {
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState([])
  const [patients, setPatients] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [generatedLink, setGeneratedLink] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const loadData = async () => {
    try {
      const [a, p, m] = await Promise.all([
        listAllAssessments(),
        listPatients().catch(() => []),
        getMe(),
      ])
      setAssessments(a)
      setPatients(Array.isArray(p) ? p : p?.patients || [])
      setMe(m)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const assessmentLink = me?.ref_code
    ? `${window.location.origin}/test?ref=${me.ref_code}`
    : ''

  const filtered = useMemo(() => {
    return assessments.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const typeLabel = (ASSESSMENT_LABELS[item.assessment_type] || item.assessment_type).toLowerCase()
        const hay = `${item.patient_name} ${typeLabel} ${item.status}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [assessments, filter, search])

  const copyText = async (text, id) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCancel = async (item) => {
    if (item.source === 'session') return
    setActionLoading(item.id)
    try {
      await updateAssessment(item.patient_id, item.id, { status: 'cancelled' })
      await loadData()
    } catch {
      /* handled */
    } finally {
      setActionLoading(null)
    }
  }

  const handleViewReport = (item) => {
    const sessionId = item.reference_type === 'session' ? item.reference_id : (item.source === 'session' ? item.id : null)
    if (sessionId) {
      navigate(`/results/${sessionId}`)
    }
  }

  const handleDownloadPdf = (item) => {
    const sessionId = item.reference_type === 'session' ? item.reference_id : (item.source === 'session' ? item.id : null)
    if (sessionId) {
      window.open(getPdfUrl(sessionId), '_blank')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="assessments-page">
      {/* Header */}
      <div className="assessments-header">
        <div>
          <h1 className="assessments-header__title">Assessments</h1>
          <p className="assessments-header__subtitle">
            Generate, manage and review MMPI-2 assessments.
          </p>
        </div>
        <button
          type="button"
          className="assessments-cta"
          onClick={() => {
            setGeneratedLink(null)
            setShowGenerate(true)
          }}
        >
          <Plus size={18} strokeWidth={1.75} />
          Generate Assessment
        </button>
      </div>

      {/* Search + Filters */}
      <div className="assessments-toolbar">
        <div className="assessments-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`assessments-filter-chip ${filter === f.id ? 'assessments-filter-chip--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="assessments-search">
          <Search size={18} strokeWidth={1.75} className="assessments-search__icon" />
          <input
            type="search"
            placeholder="Search by name, type, status"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search assessments"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="assessments-empty">
          <div className="assessments-empty__icon">
            <ClipboardList size={28} strokeWidth={1.5} />
          </div>
          <h3 className="assessments-empty__title">No assessments yet</h3>
          <p className="assessments-empty__text">
            Generate your first MMPI-2 assessment to get started.
          </p>
          <button
            type="button"
            className="assessments-cta"
            onClick={() => {
              setGeneratedLink(null)
              setShowGenerate(true)
            }}
          >
            <Plus size={18} strokeWidth={1.75} />
            Generate Assessment
          </button>
        </div>
      ) : (
        <div className="assessments-list">
          {filtered.map((item, idx) => (
            <div key={`${item.source}-${item.id}`} className="assessments-row">
              <PatientAvatar name={item.patient_name} index={idx} size={44} />

              <div className="assessments-row__patient">
                <p className="assessments-row__name">{item.patient_name}</p>
                <p className="assessments-row__meta">
                  {formatGender(item.patient_gender)} · {item.patient_age} Years
                </p>
              </div>

              <span className="assessments-row__type">
                {ASSESSMENT_LABELS[item.assessment_type] || item.assessment_type}
              </span>

              <StatusPill status={item.status} />

              <span className="assessments-row__date">
                {formatRelativeDate(
                  item.status === 'completed' ? (item.completion_date || item.created_at) : item.created_at,
                  item.status
                )}
              </span>

              <div className="assessments-row__actions">
                {item.status === 'completed' && (
                  <>
                    <button
                      type="button"
                      className="assessments-action"
                      onClick={() => handleViewReport(item)}
                      title="View Report"
                    >
                      <FileText size={18} strokeWidth={1.75} />
                      <span>View Report</span>
                    </button>
                    <button
                      type="button"
                      className="assessments-action-icon"
                      onClick={() => handleDownloadPdf(item)}
                      title="Download PDF"
                    >
                      <Download size={18} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="assessments-action-icon"
                      onClick={() => handleViewReport(item)}
                      title="View Responses"
                    >
                      <Eye size={18} strokeWidth={1.75} />
                    </button>
                  </>
                )}

                {(item.status === 'pending' || item.status === 'in_progress') && (
                  <>
                    <button
                      type="button"
                      className="assessments-action"
                      onClick={() => copyText(assessmentLink, item.id)}
                      title="Copy Link"
                      disabled={!assessmentLink}
                    >
                      {copiedId === item.id ? (
                        <Check size={18} strokeWidth={1.75} />
                      ) : (
                        <Copy size={18} strokeWidth={1.75} />
                      )}
                      <span>{copiedId === item.id ? 'Copied' : 'Copy Link'}</span>
                    </button>
                    <button
                      type="button"
                      className="assessments-action-icon"
                      onClick={() => copyText(assessmentLink, `resend-${item.id}`)}
                      title="Resend / Copy Link"
                      disabled={!assessmentLink}
                    >
                      <RefreshCw size={18} strokeWidth={1.75} />
                    </button>
                    {item.source === 'assessment' && (
                      <button
                        type="button"
                        className="assessments-action-icon assessments-action-icon--danger"
                        onClick={() => handleCancel(item)}
                        title="Cancel"
                        disabled={actionLoading === item.id}
                      >
                        {actionLoading === item.id ? (
                          <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
                        ) : (
                          <XCircle size={18} strokeWidth={1.75} />
                        )}
                      </button>
                    )}
                  </>
                )}

                {item.status === 'expired' && (
                  <button
                    type="button"
                    className="assessments-action"
                    onClick={() => {
                      setGeneratedLink(null)
                      setShowGenerate(true)
                    }}
                    title="Generate New Link"
                  >
                    <RefreshCw size={18} strokeWidth={1.75} />
                    <span>Generate New Link</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <GenerateAssessmentModal
          patients={patients}
          assessmentLink={assessmentLink}
          generatedLink={generatedLink}
          onGenerated={(linkData) => {
            setGeneratedLink(linkData)
            loadData()
          }}
          onClose={() => {
            setShowGenerate(false)
            setGeneratedLink(null)
          }}
        />
      )}
    </div>
  )
}

function GenerateAssessmentModal({
  patients,
  assessmentLink,
  generatedLink,
  onGenerated,
  onClose,
}) {
  const [patientId, setPatientId] = useState('')
  const [assessmentType, setAssessmentType] = useState('mmpi2')
  const [expiryDays, setExpiryDays] = useState('7')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const activePatients = patients.filter((p) => p.status !== 'archived')

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!patientId) {
      setError('Please select a patient')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const patient = patients.find((p) => p.id === patientId)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + Number(expiryDays || 7))

      const assessment = await createAssessment(patientId, {
        assessment_type: assessmentType,
        display_name: `${ASSESSMENT_LABELS[assessmentType] || assessmentType} — ${patient?.full_name || 'Patient'}`,
        notes: JSON.stringify({
          expiry_days: Number(expiryDays || 7),
          expires_at: expiresAt.toISOString(),
        }),
      })

      const link = assessmentLink
      onGenerated({
        url: link,
        assessment,
        patientName: patient?.full_name,
      })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate assessment')
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = async () => {
    if (!generatedLink?.url) return
    await navigator.clipboard.writeText(generatedLink.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareLink = async () => {
    if (!generatedLink?.url) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'MMPI-2 Assessment',
          text: `Please complete your ${ASSESSMENT_LABELS[assessmentType]} assessment`,
          url: generatedLink.url,
        })
      } catch {
        /* user cancelled */
      }
    } else {
      copyLink()
    }
  }

  const qrUrl = generatedLink?.url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generatedLink.url)}`
    : ''

  return (
    <div className="assessments-modal-overlay" onClick={onClose}>
      <div
        className="assessments-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="generate-assessment-title"
      >
        <div className="assessments-modal__header">
          <h2 id="generate-assessment-title">
            {generatedLink ? 'Assessment Link Ready' : 'Generate Assessment'}
          </h2>
          <button type="button" className="assessments-modal__close" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {!generatedLink ? (
          <form onSubmit={handleGenerate} className="assessments-modal__body">
            <label className="assessments-field">
              <span>Patient</span>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
              >
                <option value="">Select patient</option>
                {activePatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · {formatGender(p.gender)} · {p.age}y
                  </option>
                ))}
              </select>
            </label>

            <label className="assessments-field">
              <span>Assessment</span>
              <select
                value={assessmentType}
                onChange={(e) => setAssessmentType(e.target.value)}
              >
                <option value="mmpi2">MMPI-2</option>
                <option value="phq9" disabled>PHQ-9 (Coming soon)</option>
                <option value="gad7" disabled>GAD-7 (Coming soon)</option>
                <option value="bdi2" disabled>BDI-II (Coming soon)</option>
                <option value="mcmi" disabled>MCMI (Coming soon)</option>
              </select>
            </label>

            <label className="assessments-field">
              <span>Expiry</span>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
              >
                <option value="3">3 Days</option>
                <option value="7">7 Days</option>
                <option value="14">14 Days</option>
                <option value="30">30 Days</option>
              </select>
            </label>

            {error && <p className="assessments-modal__error">{error}</p>}

            <button type="submit" className="assessments-cta assessments-cta--full" disabled={submitting}>
              {submitting ? (
                <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
              ) : (
                <Link2 size={18} strokeWidth={1.75} />
              )}
              Generate Link
            </button>
          </form>
        ) : (
          <div className="assessments-modal__body">
            <p className="assessments-modal__success">
              Assessment link generated for <strong>{generatedLink.patientName}</strong>
            </p>

            <label className="assessments-field">
              <span>Assessment URL</span>
              <div className="assessments-link-row">
                <input type="text" readOnly value={generatedLink.url} />
                <button type="button" className="assessments-action" onClick={copyLink}>
                  {copied ? <Check size={18} strokeWidth={1.75} /> : <Copy size={18} strokeWidth={1.75} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </label>

            <div className="assessments-modal__actions">
              <button type="button" className="assessments-secondary-btn" onClick={() => setShowQr(!showQr)}>
                <QrCode size={18} strokeWidth={1.75} />
                {showQr ? 'Hide QR' : 'QR Code'}
              </button>
              <button type="button" className="assessments-secondary-btn" onClick={shareLink}>
                <Share2 size={18} strokeWidth={1.75} />
                Share
              </button>
            </div>

            {showQr && qrUrl && (
              <div className="assessments-qr">
                <img src={qrUrl} alt="Assessment QR code" width={180} height={180} />
              </div>
            )}

            <button type="button" className="assessments-cta assessments-cta--full" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
