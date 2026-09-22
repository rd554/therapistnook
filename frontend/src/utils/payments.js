// Shared payment vocabulary between the patient-level Payments tab
// (PatientProfile.jsx) and the practice-wide Payments page, so a clinician
// moving between the two sees identical labels, currency formatting, and
// status treatment.

export function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount / 100)
}

export function formatAmountParts(amount, currency = 'INR') {
  const parts = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).formatToParts(amount / 100)
  return {
    symbol: parts.filter((p) => p.type === 'currency').map((p) => p.value).join(''),
    digits: parts.filter((p) => p.type !== 'currency').map((p) => p.value).join(''),
  }
}

// Spelled-out currency name for aria-label, since a screen reader sounding
// out "₹" on every row would be worse than saying nothing.
export function formatAmountSpoken(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    currencyDisplay: 'name',
    minimumFractionDigits: 0,
  }).format(amount / 100)
}

export function getSessionTypeLabel(type) {
  const labels = {
    therapy_session: 'Therapy session',
    follow_up: 'Follow-up',
    assessment_session: 'Assessment',
    consultation: 'Consultation',
  }
  return labels[type] || type || ''
}

// "Overdue" isn't a raw payment status — it's pending plus a session date
// that's already passed. payment_link_expires_at was considered instead but
// rejected: it tracks time since booking, not the session date, so a payment
// booked far ahead can "expire" before the session even happens, or stay
// "valid" long after it's overdue. appointment_date is already on every list
// row, so no schema change is needed to derive this on the client.
export function derivePaymentStatus(payment) {
  if (payment.status === 'pending' && payment.appointment_date) {
    const apptDate = new Date(payment.appointment_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (apptDate < today) return 'overdue'
  }
  return payment.status
}

export function paymentStatusMeta(status) {
  switch (status) {
    case 'paid':      return { label: 'Paid',      cls: 'status-quiet' }
    case 'pending':   return { label: 'Pending',   cls: 'status-plain' }
    case 'overdue':   return { label: 'Overdue',   cls: 'status-alert' }
    case 'failed':    return { label: 'Failed',    cls: 'status-alert' }
    case 'refunded':  return { label: 'Refunded',  cls: 'status-quiet' }
    case 'cancelled': return { label: 'Cancelled', cls: 'status-quiet' }
    case 'expired':   return { label: 'Expired',   cls: 'status-quiet' }
    default:          return { label: status || '', cls: 'status-plain' }
  }
}
