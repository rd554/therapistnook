import { useState, useEffect } from 'react'
import { Calendar, Clock, User, Mail, Phone, FileText, ArrowLeft, ArrowRight, Check, Loader2, Video, MapPin } from 'lucide-react'
import { getPublicBookingSlots, createPublicBooking } from '../api/client'

const SESSION_TYPE_LABELS = {
  therapy_session: 'Therapy Session',
  consultation: 'Initial Consultation',
  follow_up: 'Follow-up Session',
  assessment_session: 'Assessment Session',
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(timeStr) {
  const date = new Date(timeStr)
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount / 100)
}

export default function PublicBooking({ slug, practitionerName, onClose }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  
  const [slotsData, setSlotsData] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [selectedSessionType, setSelectedSessionType] = useState('therapy_session')
  const [sessionMode, setSessionMode] = useState('online')
  
  const [formData, setFormData] = useState({
    patient_name: '',
    patient_email: '',
    patient_phone: '',
    patient_notes: '',
  })
  
  const [bookingResult, setBookingResult] = useState(null)
  
  useEffect(() => {
    loadSlots()
  }, [slug])
  
  async function loadSlots() {
    setLoading(true)
    setError(null)
    try {
      const data = await getPublicBookingSlots(slug, null, 14)
      setSlotsData(data)

      const firstAvailable = data.days.find(d => d.is_available && d.slots.length > 0)
      if (firstAvailable) {
        setSelectedDate(firstAvailable.date)
      }

      // Default to an introductory consultation rather than a therapy session, since
      // this booking flow is now framed as "Book an Introductory Call" — a therapist
      // shouldn't start therapy before understanding the client's core issue. Only
      // apply if the practitioner actually offers a consultation type; otherwise fall
      // back to whatever session type they do offer, so we never submit an
      // unconfigured session_type.
      const offeredTypes = data.session_types || []
      if (offeredTypes.some(t => t.id === 'consultation')) {
        setSelectedSessionType('consultation')
      } else if (offeredTypes.length > 0 && !offeredTypes.some(t => t.id === 'therapy_session')) {
        setSelectedSessionType(offeredTypes[0].id)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load available slots')
    } finally {
      setLoading(false)
    }
  }
  
  async function handleSubmit() {
    if (!selectedSlot || !formData.patient_name || !formData.patient_email) {
      setError('Please fill in all required fields')
      return
    }
    
    setSubmitting(true)
    setError(null)
    
    try {
      const result = await createPublicBooking(slug, {
        patient_name: formData.patient_name,
        patient_email: formData.patient_email,
        patient_phone: formData.patient_phone || null,
        requested_date: selectedDate,
        requested_start_time: selectedSlot.start,
        session_type: selectedSessionType,
        session_mode: sessionMode,
        patient_notes: formData.patient_notes || null,
      })
      
      setBookingResult(result)
      setStep(4)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create booking')
    } finally {
      setSubmitting(false)
    }
  }
  
  const selectedDateSlots = slotsData?.days.find(d => d.date === selectedDate)?.slots || []
  const selectedSessionTypeInfo = slotsData?.session_types?.find(t => t.id === selectedSessionType)
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }
  
  if (error && !slotsData) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={loadSlots} className="text-blue-600 hover:underline">
          Try again
        </button>
      </div>
    )
  }
  
  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {step > s ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 3 && (
              <div className={`w-16 h-1 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      
      {/* Step 1: Select Date & Time */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Date</h3>
            <div className="grid grid-cols-7 gap-2">
              {slotsData?.days.map((day) => (
                <button
                  key={day.date}
                  onClick={() => {
                    setSelectedDate(day.date)
                    setSelectedSlot(null)
                  }}
                  disabled={!day.is_available}
                  className={`p-2 rounded-lg text-center transition ${
                    selectedDate === day.date
                      ? 'bg-blue-600 text-white'
                      : day.is_available
                      ? 'bg-white border border-gray-200 hover:border-blue-300 text-gray-900'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <div className="text-xs">{formatDate(day.date).split(',')[0]}</div>
                  <div className="font-semibold">{new Date(day.date).getDate()}</div>
                </button>
              ))}
            </div>
          </div>
          
          {selectedDate && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Time</h3>
              {selectedDateSlots.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No available slots for this date</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {selectedDateSlots.map((slot, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-3 rounded-lg text-center transition ${
                        selectedSlot?.start === slot.start
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 hover:border-blue-300 text-gray-900'
                      }`}
                    >
                      <Clock className="w-4 h-4 mx-auto mb-1" />
                      <div className="text-sm font-medium">{formatTime(slot.start)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!selectedSlot}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Step 2: Session Details */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Type</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {slotsData?.session_types?.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedSessionType(type.id)}
                  className={`p-4 rounded-lg text-left transition ${
                    selectedSessionType === type.id
                      ? 'bg-blue-50 border-2 border-blue-600'
                      : 'bg-white border border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{type.name}</div>
                  <div className="text-sm text-gray-500">{type.duration_minutes} minutes</div>
                  {type.fee > 0 && (
                    <div className="text-sm font-semibold text-blue-600 mt-1">
                      {formatCurrency(type.fee, type.currency)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Mode</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSessionMode('online')}
                className={`p-4 rounded-lg flex items-center gap-3 transition ${
                  sessionMode === 'online'
                    ? 'bg-blue-50 border-2 border-blue-600'
                    : 'bg-white border border-gray-200 hover:border-blue-300'
                }`}
              >
                <Video className="w-5 h-5 text-blue-600" />
                <div className="text-left">
                  <div className="font-medium text-gray-900">Online</div>
                  <div className="text-xs text-gray-500">Video call</div>
                </div>
              </button>
              <button
                onClick={() => setSessionMode('offline')}
                className={`p-4 rounded-lg flex items-center gap-3 transition ${
                  sessionMode === 'offline'
                    ? 'bg-blue-50 border-2 border-blue-600'
                    : 'bg-white border border-gray-200 hover:border-blue-300'
                }`}
              >
                <MapPin className="w-5 h-5 text-blue-600" />
                <div className="text-left">
                  <div className="font-medium text-gray-900">In-Person</div>
                  <div className="text-xs text-gray-500">At clinic</div>
                </div>
              </button>
            </div>
          </div>
          
          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-6 py-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Step 3: Your Details */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.patient_name}
                    onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your full name"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.patient_email}
                    onChange={(e) => setFormData({ ...formData, patient_email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.patient_phone}
                    onChange={(e) => setFormData({ ...formData, patient_phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+91 XXXXX XXXXX"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes for Therapist
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    value={formData.patient_notes}
                    onChange={(e) => setFormData({ ...formData, patient_notes: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Any specific concerns or topics you'd like to discuss..."
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Booking Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-gray-900">Booking Summary</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Therapist:</span>
                <span className="font-medium text-gray-900">{practitionerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-medium text-gray-900">{formatDate(selectedDate)}</span>
              </div>
              <div className="flex justify-between">
                <span>Time:</span>
                <span className="font-medium text-gray-900">{formatTime(selectedSlot?.start)}</span>
              </div>
              <div className="flex justify-between">
                <span>Session:</span>
                <span className="font-medium text-gray-900">{SESSION_TYPE_LABELS[selectedSessionType]}</span>
              </div>
              <div className="flex justify-between">
                <span>Mode:</span>
                <span className="font-medium text-gray-900">{sessionMode === 'online' ? 'Online (Video)' : 'In-Person'}</span>
              </div>
              {selectedSessionTypeInfo?.fee > 0 && (
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="font-medium">Total:</span>
                  <span className="font-semibold text-blue-600">
                    {formatCurrency(selectedSessionTypeInfo.fee, selectedSessionTypeInfo.currency)}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-6 py-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !formData.patient_name || !formData.patient_email}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  Book an Introductory Call <Check className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Step 4: Confirmation */}
      {step === 4 && bookingResult && (
        <div className="text-center space-y-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Booking Request Submitted!</h3>
            <p className="text-gray-600 mt-2">
              Your appointment request has been received. Please complete the payment to confirm your booking.
            </p>
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4 space-y-2">
            <div className="text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Confirmation Code:</span>
                <span className="font-mono font-medium text-gray-900">{bookingResult.booking_token}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="font-medium text-yellow-600">Pending Payment</span>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Important:</strong> Your appointment will be confirmed once payment is complete. 
              A confirmation email with the meeting link will be sent to {formData.patient_email}.
            </p>
          </div>
          
          {bookingResult.payment_link_url && (
            <a
              href={bookingResult.payment_link_url}
              className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Complete Payment →
            </a>
          )}
          
          <p className="text-sm text-gray-500">
            You can track your booking status at:{' '}
            <a href={`/booking/${bookingResult.booking_token}`} className="text-blue-600 hover:underline">
              Booking Status Page
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
