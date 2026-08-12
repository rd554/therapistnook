import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CreditCard, Clock, User, Calendar, CheckCircle, AlertCircle, Loader2, Shield, Lock } from 'lucide-react'
import { getPaymentDetails, confirmPayment } from '../api/client'

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
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount / 100)
}

const SESSION_TYPE_LABELS = {
  therapy_session: 'Therapy Session',
  consultation: 'Initial Consultation',
  follow_up: 'Follow-up Session',
  assessment_session: 'Assessment Session',
}

export default function PaymentPage() {
  const { paymentToken } = useParams()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [paymentData, setPaymentData] = useState(null)
  const [success, setSuccess] = useState(false)
  const [bookingToken, setBookingToken] = useState(null)
  
  const [paymentMethod, setPaymentMethod] = useState('card')
  
  useEffect(() => {
    loadPaymentDetails()
  }, [paymentToken])
  
  async function loadPaymentDetails() {
    setLoading(true)
    setError(null)
    try {
      const data = await getPaymentDetails(paymentToken)
      setPaymentData(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load payment details')
    } finally {
      setLoading(false)
    }
  }
  
  async function handlePayment() {
    setProcessing(true)
    setError(null)
    
    try {
      const result = await confirmPayment(paymentToken, paymentMethod)
      setSuccess(true)
      setBookingToken(result.booking_token)
    } catch (err) {
      setError(err.response?.data?.detail || 'Payment failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }
  
  if (error && !paymentData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Payment Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:underline"
          >
            Return to Home
          </button>
        </div>
      </div>
    )
  }
  
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-gray-600 mb-6">
            Your appointment has been confirmed. A confirmation email with the meeting link has been sent to your email address.
          </p>
          
          <div className="bg-green-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800">
              Your appointment is now confirmed. You will receive reminder emails before your session.
            </p>
          </div>
          
          {bookingToken && (
            <a
              href={`/booking/${bookingToken}`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              View Appointment Details →
            </a>
          )}
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Order Summary</h2>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-500">Therapist</div>
                  <div className="font-medium text-gray-900">
                    {paymentData.practitioner_title && `${paymentData.practitioner_title} `}
                    {paymentData.practitioner_name}
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-500">Appointment</div>
                  <div className="font-medium text-gray-900">
                    {formatDate(paymentData.appointment_date)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatTime(paymentData.appointment_time)} · {SESSION_TYPE_LABELS[paymentData.session_type] || paymentData.session_type}
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-500">Mode</div>
                  <div className="font-medium text-gray-900">
                    {paymentData.session_mode === 'online' ? 'Online (Video Call)' : 'In-Person'}
                  </div>
                </div>
              </div>
            </div>
            
            <hr className="my-6" />
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Session Fee</span>
                <span className="text-gray-900">{formatCurrency(paymentData.session_fee, paymentData.currency)}</span>
              </div>
              
              {paymentData.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="text-green-600">-{formatCurrency(paymentData.discount_amount, paymentData.currency)}</span>
                </div>
              )}
              
              {paymentData.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="text-gray-900">{formatCurrency(paymentData.tax_amount, paymentData.currency)}</span>
                </div>
              )}
              
              <hr className="my-2" />
              
              <div className="flex justify-between font-semibold text-lg">
                <span className="text-gray-900">Total</span>
                <span className="text-blue-600">{formatCurrency(paymentData.amount, paymentData.currency)}</span>
              </div>
            </div>
          </div>
          
          {/* Payment Form */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Payment Method</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            
            <div className="space-y-3 mb-6">
              {[
                { id: 'card', label: 'Credit / Debit Card', icon: CreditCard },
                { id: 'upi', label: 'UPI', icon: null },
                { id: 'bank_transfer', label: 'Net Banking', icon: null },
              ].map((method) => (
                <label
                  key={method.id}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition ${
                    paymentMethod === method.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment_method"
                    value={method.id}
                    checked={paymentMethod === method.id}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="font-medium text-gray-900">{method.label}</span>
                </label>
              ))}
            </div>
            
            {/* Simulated Card Form */}
            {paymentMethod === 'card' && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expiry</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                    <input
                      type="text"
                      placeholder="123"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {paymentMethod === 'upi' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
                <input
                  type="text"
                  placeholder="yourname@upi"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
            
            <button
              onClick={handlePayment}
              disabled={processing}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  Pay {formatCurrency(paymentData.amount, paymentData.currency)}
                </>
              )}
            </button>
            
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4" />
              <span>Secure payment powered by SSL encryption</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
