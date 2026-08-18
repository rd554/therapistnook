import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Calendar, Clock, User, Video, MapPin, CheckCircle, XCircle, 
  AlertCircle, Loader2, ExternalLink, Phone, Mail, FileText,
  Download, Copy, Check
} from 'lucide-react'
import { getPublicBookingStatus, cancelPublicBooking, getPublicBookingReceipt } from '../api/client'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatCurrency(amount, currency = 'INR') {
  if (!amount) return ''
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount / 100)
}

const STATUS_CONFIG = {
  requested: { color: 'yellow', label: 'Requested', icon: AlertCircle },
  pending_payment: { color: 'yellow', label: 'Awaiting Payment', icon: AlertCircle },
  payment_processing: { color: 'yellow', label: 'Processing Payment', icon: Loader2 },
  paid: { color: 'blue', label: 'Payment Received', icon: CheckCircle },
  confirmed: { color: 'green', label: 'Confirmed', icon: CheckCircle },
  cancelled: { color: 'red', label: 'Cancelled', icon: XCircle },
  expired: { color: 'gray', label: 'Expired', icon: XCircle },
}

const SESSION_TYPE_LABELS = {
  therapy_session: 'Therapy Session',
  consultation: 'Initial Consultation',
  follow_up: 'Follow-up Session',
  assessment_session: 'Assessment Session',
}

export default function BookingStatusPage() {
  const { bookingToken } = useParams()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [booking, setBooking] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [copied, setCopied] = useState(false)
  
  useEffect(() => {
    loadBookingStatus()
  }, [bookingToken])
  
  async function loadBookingStatus() {
    setLoading(true)
    setError(null)
    try {
      const data = await getPublicBookingStatus(bookingToken)
      setBooking(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load booking details')
    } finally {
      setLoading(false)
    }
  }
  
  async function handleCancel() {
    setCancelling(true)
    try {
      await cancelPublicBooking(bookingToken, cancelReason || null)
      await loadBookingStatus()
      setShowCancelModal(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cancel booking')
    } finally {
      setCancelling(false)
    }
  }
  
  function copyMeetingLink() {
    if (booking?.meeting_link) {
      navigator.clipboard.writeText(booking.meeting_link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }
  
  if (error && !booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Booking Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/" className="text-blue-600 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    )
  }
  
  const statusConfig = STATUS_CONFIG[booking.status] || STATUS_CONFIG.requested
  const StatusIcon = statusConfig.icon
  
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            {booking.practitioner_photo_url ? (
              <img
                src={booking.practitioner_photo_url}
                alt={booking.practitioner_name}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="w-8 h-8 text-blue-600" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {booking.practitioner_title && `${booking.practitioner_title} `}
                {booking.practitioner_name}
              </h1>
              <p className="text-gray-600">Appointment Details</p>
            </div>
          </div>
          
          {/* Status Badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-${statusConfig.color}-100 text-${statusConfig.color}-700`}>
            <StatusIcon className="w-4 h-4" />
            <span className="font-medium">{statusConfig.label}</span>
          </div>
        </div>
        
        {/* Payment Required Alert */}
        {booking.status === 'pending_payment' && booking.payment_link_url && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-800 mb-1">Payment Required</h3>
                <p className="text-yellow-700 text-sm mb-4">
                  Please complete your payment to confirm this appointment. Your slot is reserved for a limited time.
                </p>
                <a
                  href={booking.payment_link_url}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
                >
                  Complete Payment →
                </a>
              </div>
            </div>
          </div>
        )}
        
        {/* Meeting Link Card (for confirmed bookings) */}
        {booking.status === 'confirmed' && booking.session_mode === 'online' && booking.meeting_link && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <Video className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-800 mb-1">Meeting Link</h3>
                <p className="text-blue-700 text-sm mb-3">
                  Use this link to join your session at the scheduled time.
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={booking.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Join Meeting
                  </a>
                  <button
                    onClick={copyMeetingLink}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Appointment Details */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Appointment Details</h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-500">Date</div>
                <div className="font-medium text-gray-900">{formatDate(booking.appointment_date)}</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-500">Time</div>
                <div className="font-medium text-gray-900">
                  {formatTime(booking.appointment_time)} ({booking.duration_minutes} minutes)
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              {booking.session_mode === 'online' ? (
                <Video className="w-5 h-5 text-gray-400 mt-0.5" />
              ) : (
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
              )}
              <div>
                <div className="text-sm text-gray-500">Session Mode</div>
                <div className="font-medium text-gray-900">
                  {booking.session_mode === 'online' ? 'Online (Video Call)' : 'In-Person'}
                </div>
                {booking.session_mode === 'offline' && booking.clinic_address && (
                  <div className="text-sm text-gray-600 mt-1">{booking.clinic_address}</div>
                )}
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-500">Session Type</div>
                <div className="font-medium text-gray-900">
                  {SESSION_TYPE_LABELS[booking.session_type] || booking.session_type}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Payment Details */}
        {booking.payment_amount && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h2>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Amount</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(booking.payment_amount, booking.payment_currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status</span>
                <span className={`font-medium ${
                  booking.payment_status === 'paid' ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {booking.payment_status === 'paid' ? 'Paid' : 'Pending'}
                </span>
              </div>
              {booking.receipt_number && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice #</span>
                  <span className="font-mono text-gray-900">{booking.receipt_number}</span>
                </div>
              )}
            </div>
            
            {booking.status === 'confirmed' && booking.receipt_number && (
              <Link
                to={`/booking/${bookingToken}/receipt`}
                className="inline-flex items-center gap-2 mt-4 text-blue-600 hover:underline text-sm"
              >
                <Download className="w-4 h-4" />
                View Invoice
              </Link>
            )}
          </div>
        )}
        
        {/* Contact Information */}
        {(booking.therapist_email || booking.therapist_phone) && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            
            <div className="space-y-3">
              {booking.therapist_email && (
                <a
                  href={`mailto:${booking.therapist_email}`}
                  className="flex items-center gap-3 text-gray-600 hover:text-blue-600"
                >
                  <Mail className="w-5 h-5" />
                  <span>{booking.therapist_email}</span>
                </a>
              )}
              {booking.therapist_phone && (
                <a
                  href={`tel:${booking.therapist_phone}`}
                  className="flex items-center gap-3 text-gray-600 hover:text-blue-600"
                >
                  <Phone className="w-5 h-5" />
                  <span>{booking.therapist_phone}</span>
                </a>
              )}
            </div>
          </div>
        )}
        
        {/* Actions */}
        {booking.status !== 'cancelled' && booking.status !== 'confirmed' && booking.status !== 'expired' && (
          <div className="text-center">
            <button
              onClick={() => setShowCancelModal(true)}
              className="text-red-600 hover:text-red-700 text-sm"
            >
              Cancel Booking
            </button>
          </div>
        )}
        
        {/* Cancel Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Booking?</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to cancel this appointment? This action cannot be undone.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Please let us know why you're cancelling..."
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Keep Booking
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
