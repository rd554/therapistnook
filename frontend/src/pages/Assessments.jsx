import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  QrCode,
  Share2,
  XCircle,
  MoreVertical,
} from 'lucide-react'
import {
  listAllAssessments,
  listPatients,
  getMe,
  createAssessment,
  updateAssessment,
  getPdfUrl,
  getFeatureFlags,
} from '../api/client'
import { formatDate, formatDateTime } from '../utils/date'
import { copyToClipboard, shareOrCopy } from '../utils/clipboard'

const LINK_GENERATION_DISABLED_MESSAGE =
  'MMPI-2 assessment links are temporarily unavailable while we finish setting up payments. Please check back soon.'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In progress' },
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

const STATUS_INFO = {
  pending: { label: 'Pending', className: 'status-plain' },
  in_progress: { label: 'In progress', className: 'status-plain' },
  completed: { label: 'Completed', className: 'status-quiet' },
  expired: { label: 'Expired', className: 'status-warn' },
  cancelled: { label: 'Cancelled', className: 'status-quiet' },
}

function getInitials(name = '') {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
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
    if (isToday) return 'Completed today'
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

// No ordinal/attempt-number column exists on Assessment or Session — this
// derives a display-only ordinal from created_at ordering within whatever
// page of results is loaded, purely so repeat administrations of the same
// inventory for the same patient render as distinguishable rows.
function withRepeatOrdinals(items) {
  const groups = new Map()
  for (const item of items) {
    const key = `${item.patient_id}-${item.assessment_type}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  const ordinals = new Map()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    sorted.forEach((item, i) => {
      ordinals.set(`${item.source}-${item.id}`, { ordinal: i + 1, total: sorted.length })
    })
  }
  return ordinals
}

// Kebab row-action menu for the mobile card layout, portaled to <body> and
// positioned from the trigger button's own coordinates — .card-flush (the
// list's outer card) has overflow:hidden, which would clip an ordinary
// absolutely-positioned popover near a row's edge. Mirrors DocumentsList's
// RowMenu.
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
        // .menu-popover/.menu-item are .clinical-ink-scoped; a portal to
        // document.body escapes any .clinical-ink ancestor in the tree, so
        // it needs its own wrapper.
        <div className="clinical-ink">
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
                disabled={a.disabled}
                onClick={() => { setOpen(false); setPos(null); a.onClick() }}
              >
                <a.icon size={14} strokeWidth={1.5} className={a.spin ? 'animate-spin' : undefined} /> {a.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  )
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
  const [linkGenerationEnabled, setLinkGenerationEnabled] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    // Owner keeps a working link even while generation is disabled
    // platform-wide for everyone else — enforced backend-side too.
    const isOwner = localStorage.getItem('mmpi_role') === 'owner'
    getFeatureFlags()
      .then((flags) => setLinkGenerationEnabled(flags.mmpi_link_generation_enabled || isOwner))
      .catch(() => setLinkGenerationEnabled(isOwner))
  }, [])

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

  const repeatOrdinals = useMemo(() => withRepeatOrdinals(assessments), [assessments])

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
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedId(id)
      setToast('Link copied')
      setTimeout(() => setCopiedId(null), 2000)
    } else {
      setToast('Could not copy link — select and copy manually')
    }
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

  // First entry is the row's one visible primary action (.btn-secondary.btn-sm);
  // the rest render as individual .btn-ghost icon buttons on desktop, or fold
  // into a RowMenu on the mobile card layout.
  const rowActions = (item) => {
    const linkTitle = linkGenerationEnabled ? undefined : LINK_GENERATION_DISABLED_MESSAGE

    if (item.status === 'completed') {
      return [
        { label: 'View report', icon: FileText, onClick: () => handleViewReport(item) },
        { label: 'Download PDF', icon: Download, onClick: () => handleDownloadPdf(item) },
        { label: 'View responses', icon: Eye, onClick: () => handleViewReport(item) },
      ]
    }

    if (item.status === 'pending' || item.status === 'in_progress') {
      const actions = [
        {
          label: copiedId === item.id ? 'Copied' : 'Copy link',
          icon: copiedId === item.id ? Check : Copy,
          onClick: () => copyText(assessmentLink, item.id),
          disabled: !assessmentLink || !linkGenerationEnabled,
          title: linkTitle,
        },
        {
          label: 'Resend link',
          icon: RefreshCw,
          onClick: () => copyText(assessmentLink, `resend-${item.id}`),
          disabled: !assessmentLink || !linkGenerationEnabled,
          title: linkTitle,
        },
      ]
      if (item.source === 'assessment') {
        actions.push({
          label: 'Cancel assessment',
          icon: actionLoading === item.id ? Loader2 : XCircle,
          spin: actionLoading === item.id,
          onClick: () => handleCancel(item),
          disabled: actionLoading === item.id,
          destructive: true,
        })
      }
      return actions
    }

    if (item.status === 'expired') {
      return [{
        label: 'Generate new link',
        icon: RefreshCw,
        onClick: () => { setGeneratedLink(null); setShowGenerate(true) },
        disabled: !linkGenerationEnabled,
        title: linkTitle,
      }]
    }

    return []
  }

  if (loading) {
    return (
      <div className="clinical-ink flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="clinical-ink">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="t-h1">Assessments</h1>
          <p className="t-body-s mt-1">Generate, manage and review MMPI-2 assessments.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary w-full sm:w-auto"
          disabled={!linkGenerationEnabled}
          title={linkGenerationEnabled ? undefined : LINK_GENERATION_DISABLED_MESSAGE}
          onClick={() => {
            setGeneratedLink(null)
            setShowGenerate(true)
          }}
        >
          <Plus size={16} strokeWidth={1.75} />
          Generate assessment
        </button>
      </div>

      {!linkGenerationEnabled && (
        <div className="alert alert-warn mb-4">{LINK_GENERATION_DISABLED_MESSAGE}</div>
      )}

      <div className="card card-flush">
        <div className="table-toolbar">
          <div className="input-search">
            <Search size={16} strokeWidth={1.75} />
            <input
              type="search"
              className="input"
              placeholder="Search by name, type, status"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search assessments"
            />
          </div>
          <div className="seg-scroll">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="seg-option"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <ClipboardList size={28} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: 'var(--icon-muted)' }} />
            <h3 className="empty-title">No assessments yet</h3>
            <p className="empty-body">Generate your first MMPI-2 assessment to get started.</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!linkGenerationEnabled}
              title={linkGenerationEnabled ? undefined : LINK_GENERATION_DISABLED_MESSAGE}
              onClick={() => {
                setGeneratedLink(null)
                setShowGenerate(true)
              }}
            >
              <Plus size={16} strokeWidth={1.75} />
              Generate assessment
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const rowKey = `${item.source}-${item.id}`
                    const repeat = repeatOrdinals.get(rowKey)
                    const statusInfo = STATUS_INFO[item.status] || { label: item.status, className: 'status-plain' }
                    const dateValue = item.status === 'completed' ? (item.completion_date || item.created_at) : item.created_at
                    const actions = rowActions(item)
                    return (
                      <tr key={rowKey}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span className="avatar" aria-hidden="true">{getInitials(item.patient_name) || '?'}</span>
                            <div>
                              <p className="doc-name">{item.patient_name}</p>
                              <p className="doc-meta">
                                {formatGender(item.patient_gender)} · {item.patient_age} yrs
                                {repeat && ` · Administration ${repeat.ordinal} of ${repeat.total}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td><span className={statusInfo.className}>{statusInfo.label}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {repeat ? formatDateTime(dateValue) : formatRelativeDate(dateValue, item.status)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex items-center justify-end gap-2">
                            {actions.map((a, i) => (
                              i === 0 ? (
                                <button
                                  key={a.label} type="button" className="btn btn-secondary btn-sm"
                                  onClick={a.onClick} disabled={a.disabled} title={a.title}
                                >
                                  <a.icon size={14} strokeWidth={1.75} className={a.spin ? 'animate-spin' : undefined} />
                                  {a.label}
                                </button>
                              ) : (
                                <button
                                  key={a.label} type="button" className="btn btn-ghost btn-icon btn-icon-sm"
                                  onClick={a.onClick} disabled={a.disabled} aria-label={a.label} title={a.title}
                                >
                                  <a.icon size={16} strokeWidth={1.75} className={a.spin ? 'animate-spin' : undefined} />
                                </button>
                              )
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden">
              {filtered.map((item) => {
                const rowKey = `${item.source}-${item.id}`
                const repeat = repeatOrdinals.get(rowKey)
                const statusInfo = STATUS_INFO[item.status] || { label: item.status, className: 'status-plain' }
                const dateValue = item.status === 'completed' ? (item.completion_date || item.created_at) : item.created_at
                const actions = rowActions(item)
                const [primary, ...rest] = actions
                return (
                  <div key={rowKey} className="doc-row">
                    <span className="avatar" aria-hidden="true">{getInitials(item.patient_name) || '?'}</span>

                    <div className="doc-main">
                      <p className="doc-name">{item.patient_name}</p>
                      <p className="doc-meta">
                        {formatGender(item.patient_gender)} · {item.patient_age} yrs
                        {repeat && ` · Administration ${repeat.ordinal} of ${repeat.total}`}
                      </p>
                      <p className="doc-meta">
                        <span className={statusInfo.className}>{statusInfo.label}</span>
                        {' · '}
                        {repeat ? formatDateTime(dateValue) : formatRelativeDate(dateValue, item.status)}
                      </p>
                    </div>

                    <div className="doc-end">
                      {primary && (
                        <button
                          type="button" className="btn btn-secondary btn-sm"
                          onClick={primary.onClick} disabled={primary.disabled} title={primary.title}
                        >
                          <primary.icon size={14} strokeWidth={1.75} className={primary.spin ? 'animate-spin' : undefined} />
                          {primary.label}
                        </button>
                      )}
                      {rest.length > 0 && <RowMenu label={item.patient_name} actions={rest} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {showGenerate && (
        <GenerateAssessmentModal
          patients={patients}
          assessmentLink={assessmentLink}
          generatedLink={generatedLink}
          linkGenerationEnabled={linkGenerationEnabled}
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

      {toast && (
        <div className="fixed z-50 toast" style={{ bottom: 'var(--space-5)', right: 'var(--space-5)' }} role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

function GenerateAssessmentModal({
  patients,
  assessmentLink,
  generatedLink,
  linkGenerationEnabled,
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
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const activePatients = patients.filter((p) => p.status !== 'archived')

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!linkGenerationEnabled) {
      setError(LINK_GENERATION_DISABLED_MESSAGE)
      return
    }
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

      onGenerated({
        url: assessmentLink,
        assessment,
        patientName: patient?.full_name,
        expiresAt: expiresAt.toISOString(),
      })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate assessment')
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = async (e) => {
    if (!generatedLink?.url) return
    const ok = await copyToClipboard(generatedLink.url, { selectEl: e?.currentTarget?.previousElementSibling })
    if (ok) {
      setCopied(true)
      setToast('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } else {
      setToast('Could not copy link — select and copy manually')
    }
  }

  const shareLink = async () => {
    if (!generatedLink?.url) return
    const result = await shareOrCopy({
      title: 'MMPI-2 assessment',
      text: `Please complete your ${ASSESSMENT_LABELS[assessmentType]} assessment`,
      url: generatedLink.url,
    })
    if (result === 'copied') setToast('Link copied')
    if (result === 'failed') setToast('Could not share or copy link — select and copy manually')
  }

  const qrUrl = generatedLink?.url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generatedLink.url)}`
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }} onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-assessment-title"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <h2 id="generate-assessment-title" className="modal-title">
            {generatedLink ? 'Assessment link ready' : 'Generate assessment'}
          </h2>
          <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {!generatedLink ? (
          <form onSubmit={handleGenerate}>
            <div className="field">
              <label>Patient</label>
              <select className="select" value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
                <option value="">Select patient</option>
                {activePatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · {formatGender(p.gender)} · {p.age}y
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Assessment</label>
              <select className="select" value={assessmentType} onChange={(e) => setAssessmentType(e.target.value)}>
                <option value="mmpi2">MMPI-2</option>
                <option value="phq9" disabled>PHQ-9 (coming soon)</option>
                <option value="gad7" disabled>GAD-7 (coming soon)</option>
                <option value="bdi2" disabled>BDI-II (coming soon)</option>
                <option value="mcmi" disabled>MCMI (coming soon)</option>
              </select>
            </div>

            <div className="field">
              <label>Expiry</label>
              <select className="select" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)}>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>

            {error && <div className="alert alert-error mb-4">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting || !linkGenerationEnabled}
              title={linkGenerationEnabled ? undefined : LINK_GENERATION_DISABLED_MESSAGE}
            >
              {submitting ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : null}
              Generate link
            </button>
          </form>
        ) : (
          <div>
            <p className="t-body-s mb-4">
              Link generated for <strong>{generatedLink.patientName}</strong>
            </p>

            <div className="field">
              <label>Assessment URL</label>
              <div className="copy-field">
                <input
                  type="text" readOnly className="input" value={generatedLink.url}
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" className="btn btn-primary" onClick={copyLink}>
                  {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mb-4">
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowQr(!showQr)}>
                <QrCode size={16} strokeWidth={1.75} />
                {showQr ? 'Hide QR' : 'QR code'}
              </button>
              <button type="button" className="btn btn-secondary flex-1" onClick={shareLink}>
                <Share2 size={16} strokeWidth={1.75} />
                Share
              </button>
            </div>

            {showQr && qrUrl && (
              <div className="flex justify-center mb-4">
                <img src={qrUrl} alt="Assessment QR code" width={180} height={180} />
              </div>
            )}

            {generatedLink.expiresAt && (
              <p className="t-caption mb-4">Expires {formatDate(generatedLink.expiresAt)}</p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="toast mt-4" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
