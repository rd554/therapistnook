import { Link } from 'react-router-dom'
import { Wallet, ArrowRight } from 'lucide-react'

function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format((amount || 0) / 100)
}

function toDayKey(dateValue) {
  const d = new Date(dateValue)
  return d.toLocaleDateString('en-CA')
}

function formatChipDate(dateValue) {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const key = toDayKey(dateValue)
  if (key === today.toLocaleDateString('en-CA')) return 'Today'
  if (key === yesterday.toLocaleDateString('en-CA')) return 'Yesterday'
  return new Date(dateValue).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Map API payment status → display category (only Received or Overdue) */
function displayStatus(tx) {
  if (tx.status === 'paid') return 'received'
  return 'overdue'
}

const STATUS_LABEL = {
  received: 'Received',
  overdue: 'Overdue',
}

const STATUS_CARD_CLASS = {
  received: 'dash-payment-card dash-payment-card--received',
  overdue: 'dash-payment-card dash-payment-card--overdue',
}


function sortRecentFirst(transactions) {
  return [...transactions].sort((a, b) => {
    const da = new Date(a.date || a.appointment_date).getTime()
    const db = new Date(b.date || b.appointment_date).getTime()
    return db - da
  })
}

const DASHBOARD_LIMIT = 5

export default function PaymentsList({ transactions = [] }) {
  const items = sortRecentFirst(transactions).slice(0, DASHBOARD_LIMIT)

  return (
    <section className="dash-section">
      <div className="dash-section__heading dash-section__heading--medium">
        <div className="dash-section__heading-left">
          <h2 className="dash-section__title">Payments</h2>
        </div>
        <Link to="/payments" className="dash-section__action">
          View all
          <ArrowRight size={14} strokeWidth={1.5} />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="dash-empty">
          <div className="empty-state-icon mx-auto mb-3">
            <Wallet size={28} strokeWidth={1.5} />
          </div>
          <h3 className="text-card-title mb-1">No payments yet</h3>
          <p className="text-secondary" style={{ fontSize: '14px' }}>
            Payment activity will show here
          </p>
        </div>
      ) : (
        <div className="dash-payment-list">
          {items.map((tx) => {
            const status = displayStatus(tx)
            return (
              <div key={tx.id} className={STATUS_CARD_CLASS[status] || STATUS_CARD_CLASS.overdue}>
                <div className="min-w-0">
                  <p className="dash-payment-card__name truncate">{tx.patient_name}</p>
                  <p className="dash-payment-card__amount">
                    {formatCurrency(tx.amount, tx.currency)}
                  </p>
                </div>
                <div className="dash-payment-card__right">
                  <span className="dash-payment-card__status">
                    {STATUS_LABEL[status]}
                  </span>
                  <span className="dash-payment-card__date">
                    {formatChipDate(tx.date || tx.appointment_date)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
