import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Loader2, FileText, MessageSquare, RefreshCw, Download, Trash2,
  MoreVertical, X, AlertCircle, Upload,
} from 'lucide-react'
import { listTherapySessions, deleteTherapySession, processTherapySession, getTranscriptDownloadUrl } from '../api/client'
import { formatDateTime } from '../utils/date'

// Ordered plain-text status scale (Clinical Ink's .status-quiet/.status-plain/
// .status-warn convention) — matches the mapping just applied to Documents.
// No colored pill chips, no icon inside the status text.
function transcriptStatusMeta(status) {
  switch (status) {
    case 'completed':  return { label: 'Completed',  cls: 'status-quiet' }
    case 'pending':     return { label: 'Pending',    cls: 'status-plain' }
    case 'processing':  return { label: 'Processing', cls: 'status-plain' }
    case 'failed':      return { label: 'Failed',     cls: 'status-warn', bold: true }
    default:            return { label: status || '', cls: 'status-plain' }
  }
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
                disabled={a.disabled}
                style={a.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                onClick={() => { if (a.disabled) return; setOpen(false); setPos(null); a.onClick() }}
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

export default function SessionsList({ patientId, onViewSession, onUploadClick }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [processing, setProcessing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [liveMessage, setLiveMessage] = useState('')
  const cancelBtnRef = useRef(null)
  const lastFocusedRef = useRef(null)

  useEffect(() => {
    loadSessions()
  }, [patientId, fromDate, toDate])

  useEffect(() => {
    if (pendingDelete) cancelBtnRef.current?.focus()
  }, [pendingDelete])

  useEffect(() => {
    if (!pendingDelete) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !deleting) closeDeleteConfirm()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pendingDelete, deleting])

  const loadSessions = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await listTherapySessions(patientId, {
        startDate: fromDate || undefined,
        endDate: toDate || undefined,
      })
      setSessions(data)
    } catch (err) {
      setError(err.userMessage || err.response?.data?.detail || 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    await loadSessions()
    setLiveMessage('Sessions refreshed')
  }

  const openDeleteConfirm = (session) => {
    lastFocusedRef.current = document.activeElement
    setPendingDelete(session)
  }

  const closeDeleteConfirm = () => {
    setPendingDelete(null)
    lastFocusedRef.current?.focus?.()
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(pendingDelete.id)
    try {
      await deleteTherapySession(patientId, pendingDelete.id)
      setSessions((prev) => prev.filter((s) => s.id !== pendingDelete.id))
      closeDeleteConfirm()
    } catch (err) {
      window.alert(err.userMessage || err.response?.data?.detail || 'Failed to delete session')
    } finally {
      setDeleting(null)
    }
  }

  const handleProcess = async (sessionId) => {
    setProcessing(sessionId)
    try {
      await processTherapySession(patientId, sessionId)
      await loadSessions()
    } catch (err) {
      window.alert(err.userMessage || err.response?.data?.detail || 'Failed to reprocess session')
    } finally {
      setProcessing(null)
    }
  }

  if (loading && sessions.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card card-flush">
        <div className="empty">
          <AlertCircle size={20} strokeWidth={1.5} style={{ color: 'var(--warning)', margin: '0 auto 12px' }} aria-hidden="true" />
          <h3 className="empty-title">Couldn't load sessions</h3>
          <p className="empty-body">{error}</p>
          <button type="button" className="btn btn-secondary" onClick={loadSessions}>Try again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card card-flush">
      <div className="filter-bar">
        <div className="field-inline field-inline-sm">
          <label htmlFor="si_from_date">From</label>
          <input id="si_from_date" type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="field-inline field-inline-sm">
          <label htmlFor="si_to_date">To</label>
          <input id="si_to_date" type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="filter-spacer" />
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Refresh" title="Refresh" onClick={handleRefresh}>
          <RefreshCw size={16} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--icon-muted)' }} />
        </button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{liveMessage}</span>

      {sessions.length === 0 ? (
        <div className="empty">
          <FileText size={20} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} aria-hidden="true" />
          <h3 className="empty-title">No transcripts yet</h3>
          <p className="empty-body">Uploading a transcript generates a summary and SOAP notes for this session.</p>
          <button type="button" className="btn btn-primary" onClick={onUploadClick}>
            <Upload size={16} strokeWidth={1.5} />
            Upload transcript
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const statusMeta = transcriptStatusMeta(session.processing_status)
                  const dateLabel = formatDateTime(session.session_date)
                  const canViewAnalysis = session.processing_status === 'completed'
                  const canReprocess = session.processing_status !== 'processing'
                  const actions = [
                    { label: 'View transcript', icon: FileText, onClick: () => onViewSession?.(session, 'transcript') },
                    ...(canViewAnalysis ? [{ label: 'View analysis', icon: MessageSquare, onClick: () => onViewSession?.(session, 'summary') }] : []),
                    { label: 'Reprocess', icon: RefreshCw, disabled: !canReprocess || processing === session.id, onClick: () => handleProcess(session.id) },
                    { label: 'Download', icon: Download, onClick: () => window.open(getTranscriptDownloadUrl(patientId, session.id), '_blank') },
                    { label: 'Delete', icon: Trash2, destructive: true, disabled: deleting === session.id, onClick: () => openDeleteConfirm(session) },
                  ]
                  return (
                    <tr
                      key={session.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Therapy session, ${dateLabel}, ${statusMeta.label}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onViewSession?.(session)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewSession?.(session) } }}
                    >
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="doc-name">Therapy session</span>
                          <span className="doc-meta">{dateLabel}</span>
                        </div>
                      </td>
                      <td>
                        <span className={statusMeta.cls} style={statusMeta.bold ? { fontWeight: 600 } : undefined}>{statusMeta.label}</span>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <RowMenu label={`Therapy session, ${dateLabel}`} actions={actions} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden">
            {sessions.map((session) => {
              const statusMeta = transcriptStatusMeta(session.processing_status)
              const dateLabel = formatDateTime(session.session_date)
              const canViewAnalysis = session.processing_status === 'completed'
              const canReprocess = session.processing_status !== 'processing'
              const actions = [
                { label: 'View transcript', icon: FileText, onClick: () => onViewSession?.(session, 'transcript') },
                ...(canViewAnalysis ? [{ label: 'View analysis', icon: MessageSquare, onClick: () => onViewSession?.(session, 'summary') }] : []),
                { label: 'Reprocess', icon: RefreshCw, disabled: !canReprocess || processing === session.id, onClick: () => handleProcess(session.id) },
                { label: 'Download', icon: Download, onClick: () => window.open(getTranscriptDownloadUrl(patientId, session.id), '_blank') },
                { label: 'Delete', icon: Trash2, destructive: true, disabled: deleting === session.id, onClick: () => openDeleteConfirm(session) },
              ]
              return (
                <div
                  className="doc-row"
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Therapy session, ${dateLabel}, ${statusMeta.label}`}
                  onClick={() => onViewSession?.(session)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewSession?.(session) } }}
                >
                  <div className="doc-main">
                    <span className="doc-name">Therapy session</span>
                    <span className="doc-meta">
                      {dateLabel} ·{' '}
                      <span className={statusMeta.cls} style={statusMeta.bold ? { fontWeight: 600 } : undefined}>{statusMeta.label}</span>
                    </span>
                  </div>
                  <div className="doc-end" onClick={(e) => e.stopPropagation()}>
                    <RowMenu label={`Therapy session, ${dateLabel}`} actions={actions} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
              <h3 id="delete-session-title" className="modal-title">Delete session?</h3>
              <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Close" onClick={closeDeleteConfirm} disabled={!!deleting}>
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <p className="t-body-s">
              This permanently deletes the transcript, summary, and SOAP notes for the session on {formatDateTime(pendingDelete.session_date)}. This can't be undone.
            </p>
            <div className="modal-actions">
              <button ref={cancelBtnRef} type="button" className="btn btn-secondary" onClick={closeDeleteConfirm} disabled={!!deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={!!deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
