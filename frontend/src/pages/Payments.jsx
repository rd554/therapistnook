import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CreditCard, TrendingUp, Clock, AlertCircle, CheckCircle, XCircle,
  RefreshCcw, Search, Filter, ChevronDown, Eye, Send,
  MoreVertical, Download, Loader2, Calendar, User, IndianRupee, X,
  Banknote, Plus, FileText, ExternalLink,
  Wallet, Stethoscope, ClipboardCheck, MessageSquare,
} from 'lucide-react'
import {
  getPaymentDashboard, listPayments, getPayment,
  markPaymentPaid, sendPaymentReminder, initiateRefund, completeRefund,
  getPaymentReceipt, regeneratePaymentLink, listPractitioners,
} from '../api/client'
import { EmptyState, SummaryCard } from '../components/ui'

const STATUS_CONFIG = {
  pending: { 
    label: 'Pending', 
    color: 'bg-warning-bg text-warning-text', 
    icon: Clock,
    dotColor: 'bg-amber-500',
  },
  paid: { 
    label: 'Paid', 
    color: 'bg-success-bg text-success-text', 
    icon: CheckCircle,
    dotColor: 'bg-green-500',
  },
  failed: { 
    label: 'Failed', 
    color: 'bg-error-bg text-error-text', 
    icon: XCircle,
    dotColor: 'bg-red-500',
  },
  refunded: { 
    label: 'Refunded', 
    color: 'bg-purple-100 text-purple-700', 
    icon: RefreshCcw,
    dotColor: 'bg-purple-500',
  },
  cancelled: { 
    label: 'Cancelled', 
    color: 'bg-slate-100 text-slate-600', 
    icon: XCircle,
    dotColor: 'bg-slate-400',
  },
  expired: { 
    label: 'Expired', 
    color: 'bg-slate-100 text-slate-500', 
    icon: Clock,
    dotColor: 'bg-slate-400',
  },
}

const PAYMENT_METHODS = {
  payment_link: 'Payment Link',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  upi: 'UPI',
  other: 'Other',
}

const SESSION_TYPES = {
  therapy_session: { label: 'Therapy Session', icon: Stethoscope },
  follow_up: { label: 'Follow Up', icon: RefreshCcw },
  assessment_session: { label: 'Assessment', icon: ClipboardCheck },
  consultation: { label: 'Consultation', icon: MessageSquare },
}

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
]

function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount / 100)
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
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
  
  const [filters, setFilters] = useState({
    status: '',
    practitionerId: '',
    dateRange: '',
    startDate: '',
    endDate: '',
    paymentMethod: '',
    sessionType: '',
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

  const activeFilterCount = useMemo(() => {
    return [
      filters.status,
      filters.practitionerId,
      filters.dateRange,
      filters.paymentMethod,
      filters.sessionType,
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
      sessionType: '',
      search: '',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-section-title text-content-primary">Payments</h1>
        <div className="flex items-center gap-3">
          <button className="btn-secondary !py-2.5">
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Export
          </button>
          <button
            onClick={() => navigate('/calendar')}
            className="btn-primary !py-2.5 shadow-lg shadow-indigo-500/20"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Create Payment
          </button>
        </div>
      </div>

      {/* Financial Snapshot - 4 Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Pending Revenue"
          amount={formatCurrency(dashboard?.pending_amount || 0)}
          supportingText={`${dashboard?.pending_count || 0} payment${dashboard?.pending_count !== 1 ? 's' : ''} pending`}
          icon={Clock}
          semantic="payments"
          variant="mini"
          className="summary-card-mini--with-support"
        />
        <SummaryCard
          title="Today's Revenue"
          amount={formatCurrency(dashboard?.today_revenue || 0)}
          supportingText="Collected today"
          icon={TrendingUp}
          semantic="revenue"
          variant="mini"
          className="summary-card-mini--with-support"
        />
        <SummaryCard
          title="Monthly Revenue"
          amount={formatCurrency(dashboard?.monthly_revenue || 0)}
          supportingText={`${dashboard?.paid_count || 0} paid this month`}
          icon={Wallet}
          semantic="analytics"
          variant="mini"
          className="summary-card-mini--with-support"
        />
        <SummaryCard
          title="Outstanding"
          amount={formatCurrency(dashboard?.outstanding_amount || 0)}
          supportingText={`${dashboard?.failed_count || 0} need follow-up`}
          icon={AlertCircle}
          semantic="sessions"
          variant="mini"
          className="summary-card-mini--with-support"
        />
      </div>

      {/* All Payments */}
      <div id="all-payments" className="flex flex-col gap-5 mt-12">
        {/* Section Header */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-section-title text-content-primary">All Payments</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-content-muted">
                {payments.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" strokeWidth={1.5} />
                <input
                  type="text"
                  placeholder="Search patient, invoice or receipt..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="h-10 w-72 rounded-[12px] border border-[#E2E8F0] bg-white pl-10 pr-4 text-sm text-content-primary placeholder:text-content-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                />
                {filters.search && (
                  <button
                    onClick={() => setFilters({ ...filters, search: '' })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>
              
              {/* Filter Button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 rounded-[12px] border h-10 px-4 text-sm font-medium transition-all ${
                  showFilters || activeFilterCount > 0
                    ? 'border-primary bg-primary-light text-primary'
                    : 'border-[#E2E8F0] text-content-secondary hover:border-primary/30 hover:bg-lavender/50'
                }`}
              >
                <Filter className="h-4 w-4" strokeWidth={1.5} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-10 rounded-[12px] border border-[#E2E8F0] bg-white px-3 pr-8 text-sm font-medium text-content-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer transition-all"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748B' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 8px center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '20px',
                }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest">Highest Amount</option>
                <option value="lowest">Lowest Amount</option>
                <option value="pending_first">Pending First</option>
                <option value="paid_first">Paid First</option>
              </select>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-[#F1F5F9]">
              <div className="flex flex-wrap items-end gap-4">
                {/* Status Filter */}
                <div>
                  <label className="label !text-xs !mb-1.5">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="h-9 rounded-[10px] border border-[#E2E8F0] bg-white px-3 pr-7 text-sm focus:border-primary focus:outline-none appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748B' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 6px center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '16px',
                    }}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>

                {/* Date Range Filter */}
                <div>
                  <label className="label !text-xs !mb-1.5">Date Range</label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                    className="h-9 rounded-[10px] border border-[#E2E8F0] bg-white px-3 pr-7 text-sm focus:border-primary focus:outline-none appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748B' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 6px center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '16px',
                    }}
                  >
                    {DATE_RANGE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Custom Date Range */}
                {filters.dateRange === 'custom' && (
                  <>
                    <div>
                      <label className="label !text-xs !mb-1.5">From</label>
                      <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                        className="h-9 rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="label !text-xs !mb-1.5">To</label>
                      <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                        className="h-9 rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Payment Method Filter */}
                <div>
                  <label className="label !text-xs !mb-1.5">Payment Method</label>
                  <select
                    value={filters.paymentMethod}
                    onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
                    className="h-9 rounded-[10px] border border-[#E2E8F0] bg-white px-3 pr-7 text-sm focus:border-primary focus:outline-none appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748B' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 6px center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '16px',
                    }}
                  >
                    <option value="">All Methods</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>

                {/* Practitioner Filter (Owner only) */}
                {userRole === 'owner' && practitioners.length > 0 && (
                  <div>
                    <label className="label !text-xs !mb-1.5">Practitioner</label>
                    <select
                      value={filters.practitionerId}
                      onChange={(e) => setFilters({ ...filters, practitionerId: e.target.value })}
                      className="h-9 rounded-[10px] border border-[#E2E8F0] bg-white px-3 pr-7 text-sm focus:border-primary focus:outline-none appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748B' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 6px center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '16px',
                      }}
                    >
                      <option value="">All Practitioners</option>
                      {practitioners.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="h-9 px-3 text-sm font-medium text-content-muted hover:text-content-secondary transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Table Content */}
        {loadingPayments ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" strokeWidth={1.5} />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon="payment"
              title="No Payments Yet"
              description="Payments from completed appointments will appear here."
              action={() => navigate('/calendar')}
              actionLabel="Create Payment"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[2.2fr_1fr_1.3fr_1fr_1fr_0.9fr_40px] gap-3 px-[18px] text-xs text-[#64748B] tracking-[0.01em]">
              <span>Patient</span>
              <span>Date</span>
              <span>Session Type</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
              <span>Receipt</span>
              <span />
            </div>
            <div className="flex flex-col gap-2">
              {payments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  onView={() => handleViewPayment(payment.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Detail Drawer */}
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


function PaymentRow({ payment, onView }) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const config = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending
  const Icon = config.icon
  const sessionType = SESSION_TYPES[payment.session_type] || { label: payment.session_type, icon: Stethoscope }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      onClick={onView}
      className="grid grid-cols-[2.2fr_1fr_1.3fr_1fr_1fr_0.9fr_40px] items-center gap-3 rounded-[16px] bg-[#FAFBFC] px-[18px] cursor-pointer transition-colors duration-150 hover:bg-[#F1F5F9] shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
      style={{ height: '64px' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
          {payment.patient_name?.charAt(0) || '?'}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-content-primary truncate">{payment.patient_name}</p>
          <p className="text-xs text-content-muted truncate">{sessionType.label}</p>
        </div>
      </div>
      <span className="text-sm text-content-secondary">{formatDate(payment.appointment_date)}</span>
      <span className="text-sm text-content-secondary truncate">{sessionType.label}</span>
      <span className="text-sm font-semibold text-content-primary text-right">
        {formatCurrency(payment.final_amount, payment.currency)}
      </span>
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" strokeWidth={2} />
        {config.label}
      </span>
      {payment.receipt_number ? (
        <span className="font-mono text-xs text-content-secondary truncate">{payment.receipt_number}</span>
      ) : payment.status === 'paid' ? (
        <span
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-primary font-medium cursor-pointer hover:underline w-fit"
        >
          Generate
        </span>
      ) : (
        <span className="text-content-muted">—</span>
      )}
      <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-content-muted hover:bg-lavender hover:text-content-primary transition-colors"
        >
          <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
        </button>

        {showMenu && (
          <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-[14px] border border-[#E8ECF4] bg-white py-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => { onView(); setShowMenu(false) }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-content-primary hover:bg-lavender transition-colors"
            >
              <Eye className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
              View Details
            </button>
            {payment.receipt_number && (
              <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-content-primary hover:bg-lavender transition-colors">
                <Download className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
                Download Receipt
              </button>
            )}
            {payment.status === 'pending' && (
              <>
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-content-primary hover:bg-lavender transition-colors">
                  <Banknote className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
                  Mark Paid
                </button>
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-content-primary hover:bg-lavender transition-colors">
                  <Send className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
                  Send Reminder
                </button>
              </>
            )}
            <div className="my-1.5 border-t border-[#F1F5F9]" />
            <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-error-text hover:bg-error-bg transition-colors">
              <XCircle className="h-4 w-4" strokeWidth={1.5} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PaymentDrawer({ payment, onClose, onUpdate }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  const config = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending
  const Icon = config.icon
  const sessionType = SESSION_TYPES[payment.session_type] || { label: payment.session_type }

  useEffect(() => {
    if (payment.status === 'paid' || payment.status === 'refunded') {
      loadReceipt()
    }
  }, [payment])

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
      alert('Payment reminder sent successfully')
    } catch (err) {
      console.error('Failed to send reminder:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F1F5F9] px-6 py-5 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-content-primary">Payment Details</h2>
            <p className="text-sm text-content-secondary mt-0.5">{payment.patient_name}</p>
          </div>
          <button 
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] text-content-muted hover:bg-lavender hover:text-content-primary transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status Banner */}
          <div className={`flex items-center gap-3 rounded-[14px] p-4 ${config.color}`}>
            <Icon className="h-5 w-5" strokeWidth={1.5} />
            <div>
              <p className="font-semibold">{config.label}</p>
              {payment.paid_at && <p className="text-xs opacity-75">Paid on {formatDateTime(payment.paid_at)}</p>}
            </div>
          </div>

          {/* Amount Card */}
          <div className="rounded-[16px] border border-[#E8ECF4] overflow-hidden">
            <div className="bg-slate-50/80 px-5 py-3 border-b border-[#F1F5F9]">
              <h3 className="text-sm font-semibold text-content-primary">Amount Details</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-content-secondary">Session Fee</span>
                <span className="text-content-primary">{formatCurrency(payment.session_fee, payment.currency)}</span>
              </div>
              {payment.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-success-text">
                  <span>Discount {payment.discount_reason && `(${payment.discount_reason})`}</span>
                  <span>-{formatCurrency(payment.discount_amount, payment.currency)}</span>
                </div>
              )}
              {payment.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-content-secondary">Tax ({payment.tax_percentage / 100}%)</span>
                  <span className="text-content-primary">{formatCurrency(payment.tax_amount, payment.currency)}</span>
                </div>
              )}
              <div className="border-t border-[#F1F5F9] pt-3 flex justify-between">
                <span className="font-semibold text-content-primary">Total</span>
                <span className="text-xl font-semibold text-content-primary">{formatCurrency(payment.final_amount, payment.currency)}</span>
              </div>
            </div>
          </div>

          {/* Session Details */}
          <div className="rounded-[16px] border border-[#E8ECF4] overflow-hidden">
            <div className="bg-slate-50/80 px-5 py-3 border-b border-[#F1F5F9]">
              <h3 className="text-sm font-semibold text-content-primary">Session Details</h3>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-content-muted mb-1">Date</p>
                <p className="text-sm font-medium text-content-primary">
                  {payment.appointment_start_time
                    ? formatDateTime(payment.appointment_start_time)
                    : formatDate(payment.appointment_date)}
                </p>
              </div>
              <div>
                <p className="text-xs text-content-muted mb-1">Session Type</p>
                <p className="text-sm font-medium text-content-primary">{sessionType.label}</p>
              </div>
              <div>
                <p className="text-xs text-content-muted mb-1">Practitioner</p>
                <p className="text-sm font-medium text-content-primary">{payment.practitioner_name}</p>
              </div>
              {payment.payment_method && (
                <div>
                  <p className="text-xs text-content-muted mb-1">Payment Method</p>
                  <p className="text-sm font-medium text-content-primary">{PAYMENT_METHODS[payment.payment_method] || payment.payment_method}</p>
                </div>
              )}
            </div>
          </div>

          {/* Receipt */}
          {receipt && (
            <div className="rounded-[16px] border border-[#E8ECF4] overflow-hidden">
              <div className="bg-slate-50/80 px-5 py-3 border-b border-[#F1F5F9]">
                <h3 className="text-sm font-semibold text-content-primary">Receipt</h3>
              </div>
              <div className="p-5 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-medium text-content-primary">{receipt.receipt_number}</p>
                  <p className="text-xs text-content-muted">Generated on {formatDateTime(receipt.generated_at)}</p>
                </div>
                <button className="btn-secondary !py-2 !px-4 !text-xs">
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Download
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-[16px] border border-[#E8ECF4] overflow-hidden">
            <div className="bg-slate-50/80 px-5 py-3 border-b border-[#F1F5F9]">
              <h3 className="text-sm font-semibold text-content-primary">Timeline</h3>
            </div>
            <div className="p-5 space-y-4">
              <TimelineItem 
                icon={CreditCard}
                title="Payment created"
                time={formatDateTime(payment.created_at)}
              />
              {payment.paid_at && (
                <TimelineItem 
                  icon={CheckCircle}
                  title="Payment received"
                  time={formatDateTime(payment.paid_at)}
                  success
                />
              )}
              {payment.refund_initiated_at && (
                <TimelineItem 
                  icon={RefreshCcw}
                  title="Refund initiated"
                  time={formatDateTime(payment.refund_initiated_at)}
                />
              )}
            </div>
          </div>

          {/* Mark Paid Form */}
          {showMarkPaid && (
            <div className="rounded-[16px] border border-primary bg-primary-light p-5">
              <h3 className="text-sm font-semibold text-primary mb-4">Mark as Paid</h3>
              <div className="space-y-4">
                <div>
                  <label className="label !text-xs !mb-1.5">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="input-field !h-10"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleMarkPaid}
                    disabled={loading}
                    className="btn-primary !py-2.5"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : 'Confirm Payment'}
                  </button>
                  <button
                    onClick={() => setShowMarkPaid(false)}
                    className="btn-secondary !py-2.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 border-t border-[#F1F5F9] px-6 py-5 space-y-3">
          {payment.status === 'pending' && !showMarkPaid && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowMarkPaid(true)}
                className="flex-1 btn-primary !py-2.5"
              >
                <Banknote className="h-4 w-4" strokeWidth={1.5} />
                Mark as Paid
              </button>
              <button
                onClick={handleSendReminder}
                disabled={loading}
                className="flex-1 btn-secondary !py-2.5"
              >
                <Send className="h-4 w-4" strokeWidth={1.5} />
                Send Reminder
              </button>
            </div>
          )}
          <button
            onClick={() => navigate(`/patients/${payment.patient_id}`)}
            className="w-full btn-ghost !justify-start !px-0 text-sm"
          >
            <User className="h-4 w-4" strokeWidth={1.5} />
            View Patient Profile
            <ExternalLink className="h-3.5 w-3.5 ml-auto" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </>
  )
}

function TimelineItem({ icon: Icon, title, time, success = false }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${success ? 'bg-success-bg' : 'bg-slate-100'}`}>
        <Icon className={`h-4 w-4 ${success ? 'text-success-text' : 'text-content-muted'}`} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-content-primary">{title}</p>
        <p className="text-xs text-content-muted">{time}</p>
      </div>
    </div>
  )
}
