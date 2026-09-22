import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, Loader2, Plus, Download, MoreVertical, Eye, Send, Banknote,
  X, User, ExternalLink, CreditCard, CheckCircle, RefreshCcw, Receipt,
} from 'lucide-react'
import {
  getPaymentDashboard, listPayments, getPayment, listPractitioners,
  markPaymentPaid, sendPaymentReminder, getPaymentReceipt,
  getInvoicePdfUrl, getInvoicePdfPreviewUrl, createBulkInvoice,
} from '../api/client'
import { formatDate, formatDateTime } from '../utils/date'
import {
  formatCurrency, formatAmountParts, formatAmountSpoken,
  derivePaymentStatus, paymentStatusMeta,
} from '../utils/payments'
import { BulkInvoiceBar, MonthCheckbox, useBulkInvoiceSelection } from '../components/payments/BulkInvoiceBar'

const PAYMENT_METHODS = {
  payment_link: 'Payment link',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  upi: 'UPI',
  other: 'Other',
}

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
]

function getInitials(name = '') {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// A session can be invoiced (individually or swept into a bulk invoice) as
// long as it hasn't been invoiced yet and isn't failed/refunded/cancelled —
// mirrors PatientPaymentsTab's identical rule.
const isInvoiceable = (p) => !p.receipt_id && (p.status === 'pending' || p.status === 'paid')

// Kebab row-action menu, portaled to <body> since .card-flush (the list's
// outer container) has overflow:hidden and would clip an ordinary
// absolutely-positioned popover. Mirrors Assessments.jsx's RowMenu.
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

  const toggle = (e) => {
    e.stopPropagation()
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
        // document.body escapes any .clinical-ink ancestor, so it needs its
        // own wrapper.
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

export default function Payments() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [practitioners, setPractitioners] = useState([])
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false)
  const [generatingId, setGeneratingId] = useState(null)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [toast, setToast] = useState('')

  const [filters, setFilters] = useState({
    status: '',
    practitionerId: '',
    dateRange: '',
    startDate: '',
    endDate: '',
    paymentMethod: '',
    search: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState('newest')

  const userRole = localStorage.getItem('mmpi_role')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    loadPayments()
  }, [filters, sortBy])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  async function loadData() {
    try {
      const dashboardData = await getPaymentDashboard()
      setDashboard(dashboardData)

      if (userRole === 'owner') {
        const pracs = await listPractitioners()
        setPractitioners(pracs)
      }
    } catch (err) {
      console.error('Failed to load payment data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadPayments() {
    setLoadingPayments(true)
    try {
      let startDate = filters.startDate
      let endDate = filters.endDate

      if (filters.dateRange === 'today') {
        startDate = new Date().toISOString().split('T')[0]
        endDate = startDate
      } else if (filters.dateRange === 'week') {
        const now = new Date()
        const start = new Date(now)
        start.setDate(now.getDate() - now.getDay())
        startDate = start.toISOString().split('T')[0]
        endDate = now.toISOString().split('T')[0]
      } else if (filters.dateRange === 'month') {
        const now = new Date()
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        endDate = now.toISOString().split('T')[0]
      }

      const data = await listPayments({
        status: filters.status || undefined,
        practitionerId: filters.practitionerId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        search: filters.search || undefined,
        perPage: 100,
      })

      let sorted = [...data]
      switch (sortBy) {
        case 'oldest':
          sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          break
        case 'highest':
          sorted.sort((a, b) => b.final_amount - a.final_amount)
          break
        case 'lowest':
          sorted.sort((a, b) => a.final_amount - b.final_amount)
          break
        case 'pending_first':
          sorted.sort((a, b) => (a.status === 'pending' ? -1 : 1))
          break
        case 'paid_first':
          sorted.sort((a, b) => (a.status === 'paid' ? -1 : 1))
          break
        default:
          sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      }

      setPayments(sorted)
    } catch (err) {
      console.error('Failed to load payments:', err)
    } finally {
      setLoadingPayments(false)
    }
  }

  async function handleViewPayment(paymentId) {
    try {
      const payment = await getPayment(paymentId)
      setSelectedPayment(payment)
      setShowPaymentDrawer(true)
    } catch (err) {
      console.error('Failed to load payment:', err)
    }
  }

  async function handleGenerateSingle(paymentId) {
    if (generatingId) return
    setGeneratingId(paymentId)
    try {
      await getPaymentReceipt(paymentId) // get-or-create
      await loadPayments()
      setToast('Invoice generated')
    } catch (err) {
      console.error('Failed to generate invoice:', err)
      setToast(err.userMessage || 'Failed to generate invoice')
    } finally {
      setGeneratingId(null)
    }
  }

  // Only sessions grouped under the same patient AND practitioner can be
  // combined — create_bulk_invoice is scoped to a single patient in its URL
  // path, and rejects a mix of practitioners the same way the patient tab's
  // own bulk invoicing does.
  const { selectedIds, selectedItems: selectedPayments, isSelectable, hasBlockedOthers, toggleRow, toggleGroup, clearSelection } =
    useBulkInvoiceSelection({ items: payments, isInvoiceable, lockKeyOf: (p) => `${p.patient_id}:${p.practitioner_id}` })

  async function handleBulkInvoice() {
    if (bulkGenerating || selectedIds.size === 0) return
    setBulkGenerating(true)
    try {
      const patientId = selectedPayments[0].patient_id
      const receipt = await createBulkInvoice(patientId, Array.from(selectedIds))
      clearSelection()
      await loadPayments()
      setToast('Invoice generated')
      window.open(getInvoicePdfUrl(receipt.payment_id), '_blank')
    } catch (err) {
      console.error('Failed to create bulk invoice:', err)
      setToast(err.userMessage || 'Failed to create bulk invoice')
    } finally {
      setBulkGenerating(false)
    }
  }

  const activeFilterCount = useMemo(() => {
    return [
      filters.status,
      filters.practitionerId,
      filters.dateRange,
      filters.paymentMethod,
    ].filter(Boolean).length
  }, [filters])

  const clearFilters = () => {
    setFilters({
      status: '',
      practitionerId: '',
      dateRange: '',
      startDate: '',
      endDate: '',
      paymentMethod: '',
      search: '',
    })
  }

  // Month grouping only makes sense for the date-ordered sorts — grouping a
  // list sorted by amount or status into calendar months would put groups
  // out of order relative to the sort the user picked.
  const isDateSort = sortBy === 'newest' || sortBy === 'oldest'

  const monthGroups = useMemo(() => {
    if (!isDateSort) return []
    const map = new Map()
    for (const p of payments) {
      const d = new Date(p.appointment_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          payments: [],
        })
      }
      map.get(key).payments.push(p)
    }
    return Array.from(map.values()).map((group) => ({
      ...group,
      total: group.payments.reduce((sum, p) => sum + p.final_amount, 0),
    }))
  }, [payments, isDateSort])

  const selectedSum = selectedPayments.reduce((sum, p) => sum + p.final_amount, 0)

  function renderRow(payment) {
    const derivedStatus = derivePaymentStatus(payment)
    const statusMeta = paymentStatusMeta(derivedStatus)
    const flagged = derivedStatus === 'overdue' || derivedStatus === 'failed'
    const selected = selectedIds.has(payment.id)
    const selectable = isSelectable(payment)
    const amountParts = formatAmountParts(payment.final_amount, payment.currency)
    const checkboxLabel = `Select payment, ${payment.patient_name}, ${formatCurrency(payment.final_amount, payment.currency)}`
    const checkboxTitle = !isInvoiceable(payment)
      ? 'Already invoiced'
      : !selectable
        ? 'Different patient or practitioner — clear the current selection to include this session'
        : undefined

    const actions = [
      { label: 'View details', icon: Eye, onClick: () => handleViewPayment(payment.id) },
    ]
    if (payment.receipt_number) {
      actions.push({ label: 'Preview invoice', icon: Eye, onClick: () => window.open(getInvoicePdfPreviewUrl(payment.id), '_blank') })
      actions.push({ label: 'Download invoice', icon: Download, onClick: () => window.open(getInvoicePdfUrl(payment.id), '_blank') })
    }
    if (payment.status === 'pending') {
      actions.push({ label: 'Send reminder', icon: Send, onClick: async () => {
        try {
          await sendPaymentReminder(payment.id)
          setToast('Reminder sent')
        } catch (err) {
          console.error('Failed to send reminder:', err)
          setToast(err.userMessage || 'Failed to send reminder')
        }
      } })
    }

    return (
      <div
        key={payment.id}
        className={`pay-row${selected ? ' is-selected' : ''}${flagged ? ' is-overdue' : ''}`}
        style={{ cursor: 'pointer' }}
        onClick={() => handleViewPayment(payment.id)}
      >
        <input
          type="checkbox"
          className="checkbox"
          checked={selected}
          disabled={!selectable}
          title={checkboxTitle}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleRow(payment)}
          aria-label={checkboxLabel}
        />
        <span className="avatar" aria-hidden="true">{getInitials(payment.patient_name) || '?'}</span>
        <div className="pay-main">
          <p className="doc-name">{payment.patient_name}</p>
          <p className="doc-meta">{formatDate(payment.appointment_date)}</p>
        </div>
        <div className="pay-foot">
          <span className="pay-amount" aria-label={formatAmountSpoken(payment.final_amount, payment.currency)} style={!flagged ? { fontWeight: 500 } : undefined}>
            <span className="cur">{amountParts.symbol}</span>{amountParts.digits}
          </span>
          <span className="pay-status"><span className={statusMeta.cls}>{statusMeta.label}</span></span>
          {payment.receipt_id ? (
            <a
              href={getInvoicePdfUrl(payment.id)}
              className="btn btn-ghost btn-icon btn-icon-sm pay-action"
              aria-label="Download invoice"
              title="Download invoice"
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={16} strokeWidth={1.5} />
            </a>
          ) : isInvoiceable(payment) ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm pay-action"
              disabled={generatingId === payment.id}
              onClick={(e) => { e.stopPropagation(); handleGenerateSingle(payment.id) }}
            >
              {generatingId === payment.id ? 'Generating…' : 'Invoice'}
            </button>
          ) : (
            <span className="status-quiet pay-action">—</span>
          )}
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={payment.patient_name} actions={actions} />
          </span>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="clinical-ink flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
      </div>
    )
  }

  return (
    <div className="clinical-ink">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="t-h1">Payments</h1>
        <div className="flex gap-3">
          <button type="button" className="btn btn-secondary btn-icon sm:hidden" aria-label="Export">
            <Download size={16} strokeWidth={1.5} />
          </button>
          <button type="button" className="btn btn-secondary hidden sm:inline-flex">
            <Download size={16} strokeWidth={1.5} />
            Export
          </button>
          <button
            type="button"
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={() => navigate('/calendar')}
          >
            <Plus size={16} strokeWidth={1.5} />
            Create payment
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="stat-row" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat">
          <span className="stat-label">Outstanding</span>
          <span className="stat-value">{formatCurrency(dashboard?.outstanding_amount || 0)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Overdue</span>
          <span className={`stat-value${dashboard?.overdue_count > 0 ? ' is-warn' : ''}`}>{formatCurrency(dashboard?.overdue_amount || 0)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Collected this month</span>
          <span className="stat-value">{formatCurrency(dashboard?.monthly_revenue || 0)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Collected today</span>
          <span className="stat-value">{formatCurrency(dashboard?.today_revenue || 0)}</span>
        </div>
      </div>

      <div className="card card-flush">
        <div className="table-toolbar">
          <div className="input-search">
            <Search size={16} strokeWidth={1.5} />
            <input
              type="search"
              className="input"
              placeholder="Search patient or invoice"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              aria-label="Search payments"
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          <select
            className="select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort payments"
            style={{ width: 'auto' }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest amount</option>
            <option value="lowest">Lowest amount</option>
            <option value="pending_first">Pending first</option>
            <option value="paid_first">Paid first</option>
          </select>
        </div>

        {showFilters && (
          <div className="filter-bar">
            <div className="field-inline field-inline-sm">
              <label htmlFor="pay_status">Status</label>
              <select id="pay_status" className="select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div className="field-inline field-inline-sm">
              <label htmlFor="pay_date_range">Date range</label>
              <select id="pay_date_range" className="select" value={filters.dateRange} onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}>
                {DATE_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {filters.dateRange === 'custom' && (
              <>
                <div className="field-inline field-inline-sm">
                  <label htmlFor="pay_from">From</label>
                  <input id="pay_from" type="date" className="input" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
                </div>
                <div className="field-inline field-inline-sm">
                  <label htmlFor="pay_to">To</label>
                  <input id="pay_to" type="date" className="input" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
                </div>
              </>
            )}
            <div className="field-inline field-inline-sm">
              <label htmlFor="pay_method">Payment method</label>
              <select id="pay_method" className="select" value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}>
                <option value="">All methods</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
            {userRole === 'owner' && practitioners.length > 0 && (
              <div className="field-inline field-inline-sm">
                <label htmlFor="pay_practitioner">Practitioner</label>
                <select id="pay_practitioner" className="select" value={filters.practitionerId} onChange={(e) => setFilters({ ...filters, practitionerId: e.target.value })}>
                  <option value="">All practitioners</option>
                  {practitioners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="filter-spacer" />
            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>
        )}

        <p className="t-caption" style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
          {payments.length} payment{payments.length !== 1 ? 's' : ''}
        </p>

        {loadingPayments ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
          </div>
        ) : payments.length === 0 ? (
          <div className="empty">
            <Receipt size={20} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} aria-hidden="true" />
            <h3 className="empty-title">No payments yet</h3>
            <p className="empty-body">Payments from completed appointments will appear here.</p>
          </div>
        ) : isDateSort ? (
          <div>
            {monthGroups.map((group) => {
              const eligible = group.payments.filter(isSelectable)
              const allSelected = eligible.length > 0 && eligible.every((p) => selectedIds.has(p.id))
              const someSelected = eligible.some((p) => selectedIds.has(p.id))
              return (
                <div key={group.key} className="month-group">
                  <div className="month-head">
                    <MonthCheckbox
                      checked={allSelected}
                      indeterminate={someSelected && !allSelected}
                      disabled={eligible.length === 0}
                      onChange={() => toggleGroup(group.payments)}
                      label={`Select all in ${group.label}`}
                    />
                    <span className="month-head-label">{group.label}</span>
                    <span className="month-head-meta">
                      {group.payments.length} payment{group.payments.length !== 1 ? 's' : ''} · {formatCurrency(group.total)}
                    </span>
                  </div>
                  {group.payments.map(renderRow)}
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            {payments.map(renderRow)}
          </div>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {selectedIds.size > 0 ? `${selectedIds.size} payment${selectedIds.size !== 1 ? 's' : ''} selected` : ''}
      </span>

      <BulkInvoiceBar
        count={selectedIds.size}
        sumLabel={formatCurrency(selectedSum)}
        note={hasBlockedOthers ? 'Only sessions for the same patient and practitioner can be combined' : null}
        generating={bulkGenerating}
        generateLabel={`Generate invoice for ${selectedIds.size} payment${selectedIds.size !== 1 ? 's' : ''}`}
        onClear={clearSelection}
        onGenerate={handleBulkInvoice}
      />

      {toast && (
        <div className="toast toast-wrap" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {showPaymentDrawer && selectedPayment && (
        <PaymentDrawer
          payment={selectedPayment}
          onClose={() => {
            setShowPaymentDrawer(false)
            setSelectedPayment(null)
          }}
          onUpdate={() => {
            loadData()
            loadPayments()
          }}
        />
      )}
    </div>
  )
}

function PaymentDrawer({ payment, onClose, onUpdate }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [toast, setToast] = useState('')

  const derivedStatus = derivePaymentStatus(payment)
  const statusMeta = paymentStatusMeta(derivedStatus)

  useEffect(() => {
    // Only fetch if a receipt is already attached — getPaymentReceipt() will
    // get-or-create, and invoicing is a deliberate action, not something
    // that should happen as a side effect of merely opening this drawer.
    if (payment.receipt_number) {
      loadReceipt()
    }
  }, [payment])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  async function loadReceipt() {
    try {
      const data = await getPaymentReceipt(payment.id)
      setReceipt(data)
    } catch (err) {
      console.error('Failed to load receipt:', err)
    }
  }

  async function handleMarkPaid() {
    setLoading(true)
    try {
      await markPaymentPaid(payment.id, { status: 'paid', payment_method: paymentMethod })
      onUpdate()
      setShowMarkPaid(false)
      onClose()
    } catch (err) {
      console.error('Failed to mark paid:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSendReminder() {
    setLoading(true)
    try {
      await sendPaymentReminder(payment.id)
      setToast('Reminder sent')
    } catch (err) {
      console.error('Failed to send reminder:', err)
      setToast(err.userMessage || 'Failed to send reminder')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop"
      style={{ padding: 'var(--space-4)' }}
      onClick={onClose}
    >
      <div
        className="modal"
        style={{ display: 'flex', flexDirection: 'column', maxWidth: 480, width: '100%', maxHeight: '85vh', padding: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--space-6)', borderBottom: 'var(--border-width) solid var(--hairline)', flex: 'none' }}>
          <div>
            <h2 id="payment-drawer-title" className="modal-title">Payment details</h2>
            <p className="t-body-s" style={{ marginTop: 2 }}>{payment.patient_name}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <span className={statusMeta.cls}>{statusMeta.label}</span>
            {payment.paid_at && <p className="t-caption" style={{ marginTop: 2 }}>Paid on {formatDateTime(payment.paid_at)}</p>}
          </div>

          <div className="field-group">
            <span className="t-h4 field-group-label">Amount</span>
            <dl className="field-grid">
              <div className="field-item">
                <dt className="field-label">Session fee</dt>
                <dd className="field-value field-value-num">{formatCurrency(payment.session_fee, payment.currency)}</dd>
              </div>
              {payment.discount_amount > 0 && (
                <div className="field-item">
                  <dt className="field-label">Discount{payment.discount_reason ? ` (${payment.discount_reason})` : ''}</dt>
                  <dd className="field-value field-value-num">-{formatCurrency(payment.discount_amount, payment.currency)}</dd>
                </div>
              )}
              {payment.tax_amount > 0 && (
                <div className="field-item">
                  <dt className="field-label">Tax ({payment.tax_percentage / 100}%)</dt>
                  <dd className="field-value field-value-num">{formatCurrency(payment.tax_amount, payment.currency)}</dd>
                </div>
              )}
              <div className="field-item">
                <dt className="field-label">Total</dt>
                <dd className="field-value field-value-num" style={{ fontWeight: 700 }}>{formatCurrency(payment.final_amount, payment.currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="field-group">
            <span className="t-h4 field-group-label">Session</span>
            <dl className="field-grid">
              <div className="field-item">
                <dt className="field-label">Date</dt>
                <dd className="field-value">
                  {payment.appointment_start_time
                    ? formatDateTime(payment.appointment_start_time)
                    : formatDate(payment.appointment_date)}
                </dd>
              </div>
              <div className="field-item">
                <dt className="field-label">Practitioner</dt>
                <dd className="field-value">{payment.practitioner_name}</dd>
              </div>
              {payment.payment_method && (
                <div className="field-item">
                  <dt className="field-label">Payment method</dt>
                  <dd className="field-value">{PAYMENT_METHODS[payment.payment_method] || payment.payment_method}</dd>
                </div>
              )}
            </dl>
          </div>

          {receipt && (
            <div className="field-group">
              <span className="t-h4 field-group-label">Invoice</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <div>
                  <p className="field-value" style={{ fontFamily: 'monospace' }}>{receipt.receipt_number}</p>
                  <p className="t-caption">Generated on {formatDateTime(receipt.generated_at)}</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <a href={getInvoicePdfPreviewUrl(payment.id)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                    <Eye size={14} strokeWidth={1.5} />
                    Preview
                  </a>
                  <a href={getInvoicePdfUrl(payment.id)} className="btn btn-secondary btn-sm">
                    <Download size={14} strokeWidth={1.5} />
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="field-group">
            <span className="t-h4 field-group-label">Timeline</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <TimelineItem icon={CreditCard} title="Payment created" time={formatDateTime(payment.created_at)} />
              {payment.paid_at && (
                <TimelineItem icon={CheckCircle} title="Payment received" time={formatDateTime(payment.paid_at)} />
              )}
              {payment.refund_initiated_at && (
                <TimelineItem icon={RefreshCcw} title="Refund initiated" time={formatDateTime(payment.refund_initiated_at)} />
              )}
            </div>
          </div>

          {showMarkPaid && (
            <div className="field-group">
              <span className="t-h4 field-group-label">Mark as paid</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button type="button" className="btn btn-primary" disabled={loading} onClick={handleMarkPaid}>
                    {loading ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : 'Confirm payment'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMarkPaid(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: 'var(--border-width) solid var(--hairline)', padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {payment.status === 'pending' && !showMarkPaid && (
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowMarkPaid(true)}>
                <Banknote size={16} strokeWidth={1.5} />
                Mark as paid
              </button>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={loading} onClick={handleSendReminder}>
                <Send size={16} strokeWidth={1.5} />
                Send reminder
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', paddingLeft: 0 }}
            onClick={() => navigate(`/patients/${payment.patient_id}`)}
          >
            <User size={16} strokeWidth={1.5} />
            View patient profile
            <ExternalLink size={14} strokeWidth={1.5} style={{ marginLeft: 'auto' }} />
          </button>
        </div>
      </div>

      {toast && (
        <div className="toast toast-wrap" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

function TimelineItem({ icon: Icon, title, time }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
      <span className="icon-badge"><Icon size={16} strokeWidth={1.5} /></span>
      <div>
        <p className="field-value">{title}</p>
        <p className="t-caption">{time}</p>
      </div>
    </div>
  )
}
