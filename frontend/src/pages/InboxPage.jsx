import { useState, useEffect } from 'react'
import { 
  Bell, CreditCard, Calendar, Video, CheckCircle, XCircle, AlertCircle,
  Clock, User, Filter, Loader2, Mail, Check, RefreshCw
} from 'lucide-react'
import { getInboxNotifications, markNotificationRead, markAllNotificationsRead } from '../api/client'

const NOTIFICATION_ICONS = {
  payment_received: { icon: CreditCard, color: 'text-green-600', bg: 'bg-green-100' },
  payment_failed: { icon: CreditCard, color: 'text-red-600', bg: 'bg-red-100' },
  refund_completed: { icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-100' },
  appointment_awaiting_payment: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  new_booking_request: { icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-100' },
  booking_confirmed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
  booking_cancelled: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
  booking_rescheduled: { icon: RefreshCw, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  meeting_link_generated: { icon: Video, color: 'text-purple-600', bg: 'bg-purple-100' },
  reminder_sent: { icon: Bell, color: 'text-blue-600', bg: 'bg-blue-100' },
}

const NOTIFICATION_TYPE_LABELS = {
  payment_received: 'Payment Received',
  payment_failed: 'Payment Failed',
  refund_completed: 'Refund Completed',
  appointment_awaiting_payment: 'Awaiting Payment',
  new_booking_request: 'New Booking',
  booking_confirmed: 'Booking Confirmed',
  booking_cancelled: 'Booking Cancelled',
  booking_rescheduled: 'Rescheduled',
  meeting_link_generated: 'Meeting Created',
  reminder_sent: 'Reminder Sent',
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
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

export default function InboxPage() {
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [countsByType, setCountsByType] = useState({})
  const [filter, setFilter] = useState('all')
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  
  useEffect(() => {
    loadNotifications()
  }, [filter, showUnreadOnly])
  
  async function loadNotifications() {
    setLoading(true)
    try {
      const params = {}
      if (showUnreadOnly) params.unread_only = true
      if (filter !== 'all') params.notification_type = filter
      
      const data = await getInboxNotifications(params)
      setNotifications(data.notifications)
      setTotalCount(data.total_count)
      setUnreadCount(data.unread_count)
      setCountsByType(data.counts_by_type)
    } catch (err) {
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }
  
  async function handleMarkRead(notificationId) {
    try {
      await markNotificationRead(notificationId)
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      ))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }
  
  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }
  
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'payment_received', label: 'Payments' },
    { value: 'new_booking_request', label: 'Bookings' },
    { value: 'meeting_link_generated', label: 'Meetings' },
  ]
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <p className="text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'No unread notifications'}
          </p>
        </div>
        
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            <Check className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  filter === opt.value
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          
          <label className="flex items-center gap-2 ml-auto">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-600">Unread only</span>
          </label>
        </div>
      </div>
      
      {/* Notifications List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
          <p className="text-gray-500">
            {showUnreadOnly ? 'You have no unread notifications' : 'Your inbox is empty'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          {notifications.map((notification) => {
            const config = NOTIFICATION_ICONS[notification.notification_type] || {
              icon: Bell,
              color: 'text-gray-600',
              bg: 'bg-gray-100',
            }
            const Icon = config.icon
            
            return (
              <div
                key={notification.id}
                className={`p-4 hover:bg-gray-50 transition ${
                  !notification.is_read ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className={`font-medium ${notification.is_read ? 'text-gray-700' : 'text-gray-900'}`}>
                          {notification.title}
                        </h4>
                        <p className={`text-sm mt-0.5 ${notification.is_read ? 'text-gray-500' : 'text-gray-600'}`}>
                          {notification.message}
                        </p>
                      </div>
                      
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-gray-500">{formatDate(notification.created_at)}</div>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 ml-auto" />
                        )}
                      </div>
                    </div>
                    
                    {/* Extra data */}
                    {(notification.patient_name || notification.amount) && (
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {notification.patient_name && (
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            <span>{notification.patient_name}</span>
                          </div>
                        )}
                        {notification.amount && (
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-4 h-4" />
                            <span>{formatCurrency(notification.amount, notification.currency)}</span>
                          </div>
                        )}
                        {notification.appointment_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(notification.appointment_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Actions */}
                    {!notification.is_read && (
                      <button
                        onClick={() => handleMarkRead(notification.id)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
