import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  X, Calendar, Clock, User, Video, Building, FileText, Loader2,
  Edit, Trash2, XCircle, CheckCircle, RefreshCw, ExternalLink,
  AlertCircle, MoreVertical, CreditCard, IndianRupee, Receipt, Send, Banknote, Mail,
} from 'lucide-react'
import { getAppointment, updateAppointment, getAppointmentPayment, markPaymentPaid, sendPaymentReminder, generateMeetingLink } from '../api/client'

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-700' },
  { value: 'no_show', label: 'No Show', color: 'bg-orange-100 text-orange-700' },
]

const SESSION_TYPE_LABELS = {
  therapy_session: 'Therapy Session',
  follow_up: 'Follow-up Session',
  assessment_session: 'Assessment Session',
  consultation: 'Consultation',
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

const PAYMENT_STATUS_CONFIG = {
  pending: { label: 'Payment Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Payment Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  refunded: { label: 'Refunded', color: 'bg-purple-100 text-purple-700', icon: RefreshCw },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700', icon: XCircle },
}

function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount / 100)
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
    }
  }

  const getStatusColor = (status) => {
    const option = STATUS_OPTIONS.find(s => s.value === status)
    return option?.color || 'bg-gray-100 text-gray-700'
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
        <div className="rounded-xl bg-white p-8 shadow-xl">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  if (!appointment) {
    return null
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-lg max-h-[90vh] flex-col rounded-xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Appointment Details</h2>
              <p className="text-sm text-gray-500">{formatDateTime(appointment.start_time)}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Patient */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">
                {appointment.patient_name.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{appointment.patient_name}</h3>
                <button
                  onClick={() => navigate(`/patients/${appointment.patient_id}`)}
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  View Patient Profile
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Status</span>
              <div className="relative" ref={statusMenuRef}>
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor(appointment.status)}`}
                >
                  {STATUS_OPTIONS.find(s => s.value === appointment.status)?.label || appointment.status}
                  <MoreVertical className="h-3 w-3" />
                </button>
                {showStatusMenu && (
                  <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {STATUS_OPTIONS.filter(s => s.value !== appointment.status).map((status) => (
                      <button
                        key={status.value}
                        onClick={() => handleStatusChange(status.value)}
                        disabled={updating}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <span className={`h-2 w-2 rounded-full ${status.color.replace('text-', 'bg-').split(' ')[0]}`} />
                        Mark as {status.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="h-4 w-4" />
                  Start Time
                </div>
                <p className="mt-1 font-semibold text-gray-900">{formatTime(appointment.start_time)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="h-4 w-4" />
                  End Time
                </div>
                <p className="mt-1 font-semibold text-gray-900">{formatTime(appointment.end_time)}</p>
              </div>
            </div>

            {/* Duration & Mode */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-500">Duration</span>
                <p className="font-medium text-gray-900">{appointment.duration_minutes} minutes</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Mode</span>
                <p className="flex items-center gap-1 font-medium text-gray-900">
                  {appointment.session_mode === 'online' ? (
                    <><Video className="h-4 w-4" /> Online</>
                  ) : (
                    <><Building className="h-4 w-4" /> In-Person</>
                  )}
                </p>
              </div>
            </div>

            {/* Meeting Link (for online sessions) */}
            {appointment.session_mode === 'online' && appointment.meeting_link && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-blue-700 flex items-center gap-1">
                      <Video className="h-4 w-4" />
                      Meeting Link
                    </span>
                    <p className="mt-1 text-sm text-blue-600 break-all">
                      {appointment.meeting_link}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(appointment.meeting_link)
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 rounded-lg transition"
                    >
                      Copy
                    </button>
                    <button
                      onClick={handleSendMeetingInvite}
                      disabled={sendingInvite}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 rounded-lg transition disabled:opacity-50"
                    >
                      {sendingInvite ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                      Email
                    </button>
                    <a
                      href={appointment.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-1"
                    >
                      Join
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Session Type */}
            <div>
              <span className="text-sm text-gray-500">Session Type</span>
              <p className="font-medium text-gray-900">
                {SESSION_TYPE_LABELS[appointment.session_type] || appointment.session_type}
              </p>
            </div>

            {/* Practitioner */}
            <div>
              <span className="text-sm text-gray-500">Practitioner</span>
              <p className="font-medium text-gray-900">{appointment.practitioner_name}</p>
            </div>

            {/* Notes */}
            {appointment.notes && (
              <div>
                <span className="text-sm text-gray-500">Notes</span>
                <p className="mt-1 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{appointment.notes}</p>
              </div>
            )}

            {/* Cancellation Reason */}
            {appointment.status === 'cancelled' && appointment.cancellation_reason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <span className="text-sm font-medium text-red-700">Cancellation Reason</span>
                <p className="mt-1 text-sm text-red-600">{appointment.cancellation_reason}</p>
              </div>
            )}

            {/* Rescheduled Info */}
            {appointment.rescheduled_from_id && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                <span className="text-sm font-medium text-purple-700">
                  <RefreshCw className="mr-1 inline h-4 w-4" />
                  This appointment was rescheduled from a previous date
                </span>
              </div>
            )}

            {/* Payment Section */}
            {payment && (
              <div className="border-t border-gray-100 pt-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  Payment
                </h4>
                
                {/* Payment Status */}
                <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Status</span>
                    {(() => {
                      const config = PAYMENT_STATUS_CONFIG[payment.status] || PAYMENT_STATUS_CONFIG.pending
                      const Icon = config.icon
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}>
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </span>
                      )
                    })()}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Amount</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(payment.final_amount, payment.currency)}
                    </span>
                  </div>
                  
                  {payment.receipt_number && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Invoice</span>
                      <span className="flex items-center gap-1 text-sm">
                        <Receipt className="h-4 w-4 text-gray-400" />
                        <span className="font-mono text-xs">{payment.receipt_number}</span>
                      </span>
                    </div>
                  )}
                  
                  {/* Payment Actions */}
                  {payment.status === 'pending' && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={handleMarkPaid}
                        disabled={paymentLoading}
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Banknote className="h-3 w-3" />
                        Mark Paid
                      </button>
                      <button
                        onClick={handleSendReminder}
                        disabled={paymentLoading}
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" />
                        Remind
                      </button>
                    </div>
                  )}
                  
                  <Link
                    to="/payments"
                    className="block text-center text-xs text-primary-600 hover:text-primary-700"
                  >
                    View in Payments
                  </Link>
                </div>
              </div>
            )}

            {/* Future Placeholders */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Coming Soon</p>
              <div className="grid grid-cols-2 gap-2">
                {['Recording', 'Transcript', 'SOAP Notes', 'Intelligence'].map((item) => (
                  <div key={item} className="rounded-lg bg-gray-50 p-2 text-center text-xs text-gray-400">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-6 py-4">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
              {onEdit && (
                <button
                  onClick={() => onEdit(appointmentId)}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Cancel Appointment</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Reason (optional)
              </label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Enter cancellation reason..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCancelDialog(false)
                  setCancelReason('')
                }}
                className="btn-secondary"
              >
                Keep Appointment
              </button>
              <button
                onClick={handleCancel}
                disabled={updating}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancel Appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
