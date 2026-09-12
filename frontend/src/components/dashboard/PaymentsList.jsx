import { Wallet } from 'lucide-react'

function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format((amount || 0) / 100)
}

// Splits a formatted amount into its currency symbol and digits so the two
// can carry different colors (B6: "the ₹ symbol renders at --text-muted
// while the digits take the row's colour"). formatToParts keeps this
// locale/currency-agnostic instead of assuming ₹.
function formatAmountParts(amount, currency = 'INR') {
  const parts = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).formatToParts((amount || 0) / 100)
  return {
    symbol: parts.filter((p) => p.type === 'currency').map((p) => p.value).join(''),
    digits: parts.filter((p) => p.type !== 'currency').map((p) => p.value).join(''),
  }
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

function sortRecentFirst(transactions) {
  return [...transactions].sort((a, b) => {
    const da = new Date(a.date || a.appointment_date).getTime()
    const db = new Date(b.date || b.appointment_date).getTime()
    return db - da
  })
}

const DASHBOARD_LIMIT = 5

// .t-num (received) or .t-num-key (overdue) — B6.
function AmountCell({ amount, currency, overdue }) {
  const { symbol, digits } = formatAmountParts(amount, currency)
  return (
    <span className={overdue ? 't-num-key tnum' : 't-num tnum'}>
      <span style={{ color: 'var(--text-muted)' }}>{symbol}</span>
      {digits}
    </span>
  )
}

export default function PaymentsList({ transactions = [] }) {
  const sorted = sortRecentFirst(transactions)
  const items = sorted.slice(0, DASHBOARD_LIMIT)
  // Summed over all fetched transactions, not just the 5 displayed rows —
  // otherwise an account with >5 overdue payments would silently under-report
  // the total in this --status-alert. Still bounded by however many
  // transactions the caller fetched (Home.jsx currently asks for 30), not a
  // true account-wide figure.
  const overdueTotal = sorted
    .filter((tx) => displayStatus(tx) === 'overdue')
    .reduce((sum, tx) => sum + (tx.amount || 0), 0)

  return (
    <section>
      <div className="section-head">
        <h2 className="t-h2">Payments</h2>
        {overdueTotal > 0 && (
          <span className="status-alert">{formatCurrency(overdueTotal)} overdue</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <Wallet size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} />
          <h3 className="empty-title">No payments yet</h3>
          <p className="empty-body">Payment activity will show here</p>
        </div>
      ) : (
        <div className="table-wrap card-flush">
          {items.map((tx) => {
            const overdue = displayStatus(tx) === 'overdue'
            return (
              <div key={tx.id} className={overdue ? 'list-row pay-row rule-error' : 'list-row pay-row'}>
                <div className={overdue ? 't-cell-key' : 'pay-name-received'}>
                  {tx.patient_name}
                  <div className={overdue ? 'status-alert' : 'status-quiet'}>
                    {overdue ? 'Overdue' : 'Received'}
                  </div>
                </div>
                <div className="pay-right">
                  <AmountCell amount={tx.amount} currency={tx.currency} overdue={overdue} />
                  <span className="t-caption">{formatChipDate(tx.date || tx.appointment_date)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
