import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  X, Loader2, Edit, Trash2, MoreVertical, Send, Mail, Copy,
} from 'lucide-react'
import { getAppointment, getAppointmentPayment, markPaymentPaid, sendPaymentReminder, generateMeetingLink } from '../api/client'
import { formatCurrency, getSessionTypeLabel, derivePaymentStatus } from '../utils/payments'

// Mirrors Calendar.jsx's STATUS_META (plain text, no chips, no dots).
const STATUS_META = {
  scheduled: { label: 'Scheduled', cls: 'status-plain' },
  completed: { label: 'Completed', cls: 'status-quiet' },
  cancelled: { label: 'Cancelled', cls: 'status-quiet' },
  no_show: { label: 'No show', cls: 'status-warn' },
}

const STATUS_OPTIONS = ['scheduled', 'completed', 'no_show', 'cancelled']

// Payment status here intentionally diverges from utils/payments.js's
// paymentStatusMeta (which renders "pending" as status-plain in list
// contexts) — a pending payment sitting next to Mark Paid/Remind actions
// in this modal is worth flagging, so it gets status-warn instead.
const PAYMENT_STATUS_META = {
  pending: { label: 'Payment pending', cls: 'status-warn' },
  overdue: { label: 'Overdue', cls: 'status-alert' },
  paid: { label: 'Paid', cls: 'status-quiet' },
  failed: { label: 'Payment failed', cls: 'status-alert' },
  refunded: { label: 'Refunded', cls: 'status-quiet' },
  cancelled: { label: 'Cancelled', cls: 'status-quiet' },
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function AppointmentDetail({
  appointmentId,
  onUpdate,
  onCancel,
  onDelete,
  onEdit,
  onClose,
  onRefresh,
}) {
  const navigate = useNavigate()
  const [appointment, setAppointment] = useState(null)
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const statusMenuRef = useRef(null)

  useEffect(() => {
    loadAppointment()
  }, [appointmentId])

  useEffect(() => {
    if (!showStatusMenu) return
    const handleClickOutside = (event) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target)) {
        setShowStatusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStatusMenu])

  const loadAppointment = async () => {
    setLoading(true)
    try {
      const data = await getAppointment(appointmentId)
      setAppointment(data)

      // Try to load payment info
      try {
        const paymentData = await getAppointmentPayment(appointmentId)
        setPayment(paymentData)
      } catch {
        // No payment for this appointment
        setPayment(null)
      }
    } catch (err) {
      console.error('Failed to load appointment:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!payment) return
    setPaymentLoading(true)
    try {
      await markPaymentPaid(payment.id, { status: 'paid', payment_method: 'cash' })
      await loadAppointment()
    } catch (err) {
      console.error('Failed to mark as paid:', err)
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleSendReminder = async () => {
    if (!payment) return
    setPaymentLoading(true)
    try {
      await sendPaymentReminder(payment.id)
      alert('Payment reminder sent')
    } catch (err) {
      console.error('Failed to send reminder:', err)
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleSendMeetingInvite = async () => {
    setSendingInvite(true)
    try {
      const updated = await generateMeetingLink(appointmentId)
      if (updated.email_sent) {
        alert('Meeting invite emailed to the patient')
      } else {
        // The link exists/was created fine, but the email itself didn't go out
        // (e.g. no email on file, or SMTP failed) — don't claim success.
        alert(`Link ready, but couldn't email it: ${updated.email_error || 'unknown error'}`)
      }
    } catch (err) {
      alert(err.userMessage || err.response?.data?.detail || 'Failed to send meeting invite')
    } finally {
      setSendingInvite(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (newStatus === 'cancelled') {
      setShowCancelDialog(true)
      setShowStatusMenu(false)
      return
    }

    setUpdating(true)
    try {
      await onUpdate(appointmentId, { status: newStatus })
      await loadAppointment()
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdating(false)
      setShowStatusMenu(false)
    }
  }

  const handleCancel = async () => {
    setUpdating(true)
    try {
      await onCancel(appointmentId, cancelReason || null)
      setShowCancelDialog(false)
    } catch (err) {
      console.error('Failed to cancel:', err)
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(appointmentId)
    } catch (err) {
      alert(err.userMessage || err.response?.data?.detail || 'Failed to delete appointment')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  if (loading) {
    return (
      <div className="clinical-ink">
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
          <Loader2 size={28} strokeWidth={1.5} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
    )
  }

  if (!appointment) {
    return null
  }

  const statusMeta = STATUS_META[appointment.status] || { label: appointment.status, cls: 'status-plain' }
  const derivedPaymentStatus = payment ? derivePaymentStatus(payment) : null
  const paymentMeta = payment ? (PAYMENT_STATUS_META[derivedPaymentStatus] || { label: derivedPaymentStatus, cls: 'status-plain' }) : null

  return (
    <div className="clinical-ink">
      <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" style={{ padding: 'var(--space-4)' }} onClick={onClose}>
        <div className="modal as-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 className="t-h3">Appointment details</h2>
              <p className="t-caption" style={{ marginTop: '2px' }}>{formatDateTime(appointment.start_time)}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="sheet-body space-y-5">
            {/* Patient */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
              <div style={{
                display: 'flex', height: '44px', width: '44px', flex: 'none', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%', background: 'var(--selected)', color: 'var(--accent)',
                font: '600 16px/1 var(--font-ui)',
              }}>
                {appointment.patient_name.charAt(0)}
              </div>
              <div>
                <h3 className="t-h3">{appointment.patient_name}</h3>
                <button type="button" className="link" onClick={() => navigate(`/patients/${appointment.patient_id}`)}>
                  View patient profile
                </button>
              </div>
            </div>

            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="field-label">Status</span>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }} ref={statusMenuRef}>
                <span className={statusMeta.cls}>{statusMeta.label}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-icon-sm"
                  aria-label="Change status"
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                >
                  <MoreVertical size={14} strokeWidth={1.5} />
                </button>
                {showStatusMenu && (
                  <div className="card" style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 10,
                    minWidth: '170px', padding: 'var(--space-2)',
                  }}>
                    {STATUS_OPTIONS.filter((s) => s !== appointment.status).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="btn btn-ghost btn-block"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => handleStatusChange(status)}
                        disabled={updating}
                      >
                        Mark as {(STATUS_META[status]?.label || status).toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Core fields — date is already in the sheet-head subtitle, so
                it isn't repeated here. */}
            <dl className="field-grid">
              <div className="field-item">
                <dt className="field-label">Start time</dt>
                <dd className="field-value">{formatTime(appointment.start_time)}</dd>
              </div>
              <div className="field-item">
                <dt className="field-label">End time</dt>
                <dd className="field-value">{formatTime(appointment.end_time)}</dd>
              </div>
              <div className="field-item">
                <dt className="field-label">Duration</dt>
                <dd className="field-value">{appointment.duration_minutes} minutes</dd>
              </div>
              <div className="field-item">
                <dt className="field-label">Mode</dt>
                <dd className="field-value">{appointment.session_mode === 'online' ? 'Online' : 'In person'}</dd>
              </div>
              <div className="field-item">
                <dt className="field-label">Session type</dt>
                <dd className="field-value">{getSessionTypeLabel(appointment.session_type) || appointment.session_type}</dd>
              </div>
            </dl>

            {/* Meeting link (for online sessions) */}
            {appointment.session_mode === 'online' && appointment.meeting_link && (
              <div className="card card-compact" style={{ background: 'var(--surface)' }}>
                <div className="field-label" style={{ marginBottom: 'var(--space-2)' }}>Meeting link</div>
                <p className="field-value" style={{ wordBreak: 'break-all', marginBottom: 'var(--space-3)' }}>
                  {appointment.meeting_link}
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigator.clipboard.writeText(appointment.meeting_link)}
                  >
                    <Copy size={14} strokeWidth={1.5} />
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleSendMeetingInvite}
                    disabled={sendingInvite}
                  >
                    {sendingInvite ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <Mail size={14} strokeWidth={1.5} />}
                    Email
                  </button>
                  <a href={appointment.meeting_link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                    Join
                  </a>
                </div>
              </div>
            )}

            {/* Practitioner */}
            <p className="t-caption">{appointment.practitioner_name}</p>

            {/* Notes */}
            {appointment.notes && (
              <div>
                <p className="field-label" style={{ marginBottom: 'var(--space-2)' }}>Notes</p>
                <p className="field-value" style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  {appointment.notes}
                </p>
              </div>
            )}

            {/* Cancellation reason */}
            {appointment.status === 'cancelled' && appointment.cancellation_reason && (
              <div>
                <p className="field-label" style={{ marginBottom: 'var(--space-2)' }}>Cancellation reason</p>
                <p className="field-value" style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  {appointment.cancellation_reason}
                </p>
              </div>
            )}

            {/* Rescheduled info */}
            {appointment.rescheduled_from_id && (
              <p className="t-caption">This appointment was rescheduled from a previous date.</p>
            )}

            {/* Payment */}
            {payment && (
              <div style={{ borderTop: 'var(--border-width) solid var(--hairline)', paddingTop: 'var(--space-4)' }}>
                <p className="t-caption" style={{ marginBottom: 'var(--space-3)' }}>Payment</p>
                <div className="card card-compact space-y-3">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="field-label">Status</span>
                    <span className={paymentMeta.cls}>{paymentMeta.label}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="field-label">Amount</span>
                    <span className="field-value field-value-num">
                      {formatCurrency(payment.final_amount, payment.currency)}
                    </span>
                  </div>

                  {payment.receipt_number && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="field-label">Invoice</span>
                      <span className="field-value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{payment.receipt_number}</span>
                    </div>
                  )}

                  {payment.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: 'var(--border-width) solid var(--hairline)' }}>
                      <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleMarkPaid} disabled={paymentLoading}>
                        Mark paid
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={handleSendReminder} disabled={paymentLoading}>
                        Remind
                      </button>
                    </div>
                  )}

                  <Link to="/payments" className="link" style={{ display: 'block', textAlign: 'center' }}>
                    View in payments
                  </Link>
                </div>
              </div>
            )}

            <p className="t-caption">Recording, transcripts, and session intelligence for this appointment are on the roadmap.</p>
          </div>

          <div className="sheet-foot" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: 'var(--error)' }}
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleting}
            >
              <Trash2 size={16} strokeWidth={1.5} />
              Delete
            </button>
            <div className="sheet-foot-group" style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              {onEdit && (
                <button type="button" className="btn btn-primary" onClick={() => onEdit(appointmentId)}>
                  <Edit size={16} strokeWidth={1.5} />
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel dialog */}
      {showCancelDialog && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" style={{ padding: 'var(--space-4)' }}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-appt-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setShowCancelDialog(false) }}
          >
            <h3 id="cancel-appt-title" className="modal-title">Cancel appointment</h3>
            <p className="modal-body">This action cannot be undone.</p>
            <div style={{ margin: '0 0 var(--space-4)' }}>
              <div className="field-head"><label htmlFor="cancel_reason">Reason (optional)</label></div>
              <textarea
                id="cancel_reason"
                className="textarea"
                rows={2}
                placeholder="Enter cancellation reason…"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowCancelDialog(false); setCancelReason('') }}
              >
                Keep appointment
              </button>
              <button type="button" className="btn btn-danger" onClick={handleCancel} disabled={updating}>
                {updating && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
                Cancel appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {showDeleteDialog && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" style={{ padding: 'var(--space-4)' }}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-appt-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setShowDeleteDialog(false) }}
          >
            <h3 id="delete-appt-title" className="modal-title">Delete appointment</h3>
            <p className="modal-body">This will permanently delete this appointment. This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteDialog(false)}>
                Keep appointment
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
                Delete appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
