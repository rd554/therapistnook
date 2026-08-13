import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Loader2,
  Clock, User, Video, Building, Search, X, CalendarPlus,
  MoreVertical, Edit, Trash2, RefreshCw, XCircle, CheckCircle,
  Stethoscope, ClipboardCheck, MessageSquare, AlertTriangle,
  Copy, ExternalLink,
} from 'lucide-react'
import {
  getCalendarEvents, getAppointment, createAppointment, updateAppointment, rescheduleAppointment,
  cancelAppointment, deleteAppointment, listPatients, listPractitioners,
} from '../api/client'
import ScheduleModal from '../components/ScheduleModal'
import AppointmentDetail from '../components/AppointmentDetail'
import { EmptyState } from '../components/ui'

const VIEWS = ['day', 'week', 'month']
const VIEW_LABELS = { day: 'Day', week: 'Week', month: 'Month' }

const STATUS_COLORS = {
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-blue-500' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-l-green-500' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-l-red-500' },
  no_show: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-l-orange-500' },
  rescheduled: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-l-purple-500' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-l-amber-500' },
}

const SESSION_TYPE_CONFIG = {
  therapy_session: { label: 'Therapy', color: 'border-l-blue-500', icon: Stethoscope },
  assessment_session: { label: 'Assessment', color: 'border-l-purple-500', icon: ClipboardCheck },
  consultation: { label: 'Consultation', color: 'border-l-green-500', icon: MessageSquare },
  follow_up: { label: 'Follow-up', color: 'border-l-amber-500', icon: RefreshCw },
  emergency: { label: 'Emergency', color: 'border-l-red-500', icon: AlertTriangle },
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'Missed' },
  { value: 'pending', label: 'Pending' },
]

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

function getWeekDates(date) {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function getMonthDates(date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - startDate.getDay())
  const dates = []
  const current = new Date(startDate)
  while (current <= lastDay || dates.length % 7 !== 0) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// Format a Date using its *local* calendar date, not toISOString() (which
// converts to UTC first and rolls the date back a day for any local time
// before the UTC offset boundary, e.g. before ~5:30am in IST).
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDateRange(view, currentDate) {
  const d = new Date(currentDate)
  if (view === 'day') {
    return { start: d, end: d }
  } else if (view === 'week') {
    const start = new Date(d)
    start.setDate(start.getDate() - start.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start, end }
  } else {
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { start, end }
  }
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7)

export default function Calendar() {
  const navigate = useNavigate()
  const [view, setView] = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [patients, setPatients] = useState([])
  const [practitioners, setPractitioners] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const calendarRef = useRef(null)
  
  const userRole = localStorage.getItem('mmpi_role')
  const isOwner = userRole === 'owner'

  const loadEvents = async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(view, currentDate)
      const startStr = toLocalDateStr(start)
      const endStr = toLocalDateStr(end)
      const data = await getCalendarEvents(startStr, endStr)
      setEvents(data)
    } catch (err) {
      console.error('Failed to load events:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadPatients = async () => {
    try {
      const data = await listPatients({ status: 'active' })
      setPatients(data)
    } catch (err) {
      console.error('Failed to load patients:', err)
    }
  }

  const loadPractitioners = async () => {
    if (isOwner) {
      try {
        const data = await listPractitioners()
        setPractitioners(data.filter(p => p.is_active))
      } catch (err) {
        console.error('Failed to load practitioners:', err)
      }
    }
  }

  useEffect(() => {
    loadEvents()
  }, [view, currentDate])

  useEffect(() => {
    loadPatients()
    loadPractitioners()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showScheduleModal || showDetailPanel || showEditModal) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      
      switch (e.key) {
        case 'ArrowLeft':
          navigateDate(-1)
          break
        case 'ArrowRight':
          navigateDate(1)
          break
        case 't':
        case 'T':
          goToToday()
          break
        case 'd':
        case 'D':
          handleViewChange('day')
          break
        case 'w':
        case 'W':
          handleViewChange('week')
          break
        case 'm':
        case 'M':
          handleViewChange('month')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showScheduleModal, showDetailPanel, showEditModal, view, currentDate])

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      window.addEventListener('click', handleClick)
      return () => window.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  const filteredEvents = useMemo(() => {
    let filtered = events
    if (statusFilter) {
      filtered = filtered.filter(e => e.status === statusFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(e => 
        e.patient_name?.toLowerCase().includes(q) ||
        e.title?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [events, statusFilter, searchQuery])

  const navigateDate = useCallback((direction) => {
    const d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() + direction)
    else if (view === 'week') d.setDate(d.getDate() + direction * 7)
    else d.setMonth(d.getMonth() + direction)
    setCurrentDate(d)
  }, [view, currentDate])

  const goToToday = useCallback(() => setCurrentDate(new Date()), [])

  // Switching Day/Week/Month should always land on today, not whatever date
  // was last navigated to in the previous view.
  const handleViewChange = useCallback((v) => {
    setView(v)
    setCurrentDate(new Date())
  }, [])

  const handleSlotClick = (date, hour) => {
    const start = new Date(date)
    start.setHours(hour, 0, 0, 0)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + 50)
    setSelectedSlot({ date: start, startTime: start, endTime: end })
    setShowScheduleModal(true)
  }

  const handleEventClick = (event) => {
    setSelectedEvent(event)
    setShowDetailPanel(true)
  }

  const handleContextMenu = (e, event) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      event,
    })
  }

  const handleCreateAppointment = async (data) => {
    try {
      await createAppointment(data)
      await loadEvents()
      setShowScheduleModal(false)
      setSelectedSlot(null)
    } catch (err) {
      throw err
    }
  }

  const handleUpdateAppointment = async (appointmentId, data) => {
    try {
      await updateAppointment(appointmentId, data)
      await loadEvents()
      setShowDetailPanel(false)
      setSelectedEvent(null)
    } catch (err) {
      throw err
    }
  }

  const handleEditAppointment = async (appointmentId) => {
    try {
      const data = await getAppointment(appointmentId)
      setEditingAppointment(data)
      setShowEditModal(true)
      setShowDetailPanel(false)
      setSelectedEvent(null)
      setContextMenu(null)
    } catch (err) {
      console.error('Failed to load appointment for editing:', err)
    }
  }

  const handleSaveEditedAppointment = async (data) => {
    try {
      await updateAppointment(editingAppointment.id, data)
      await loadEvents()
      setShowEditModal(false)
      setEditingAppointment(null)
    } catch (err) {
      throw err
    }
  }

  const handleCancelAppointment = async (appointmentId, reason) => {
    try {
      await cancelAppointment(appointmentId, reason)
      await loadEvents()
      setShowDetailPanel(false)
      setSelectedEvent(null)
    } catch (err) {
      console.error('Failed to cancel:', err)
    }
  }

  const handleDeleteAppointment = async (appointmentId) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return
    try {
      await deleteAppointment(appointmentId)
      await loadEvents()
      setShowDetailPanel(false)
      setSelectedEvent(null)
    } catch (err) {
      console.error('Failed to delete:', err)
      throw err
    }
  }

  const getHeaderText = () => {
    const d = currentDate
    if (view === 'day') {
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    } else if (view === 'week') {
      const week = getWeekDates(d)
      const start = week[0]
      const end = week[6]
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`
      }
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    } else {
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
  }

  const todayCount = useMemo(() => {
    const today = new Date()
    return events.filter(e => isSameDay(new Date(e.start), today)).length
  }, [events])

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-section-title text-content-primary">Calendar</h1>
        <button
          onClick={() => {
            setSelectedSlot(null)
            setShowScheduleModal(true)
          }}
          className="btn-primary !px-5"
        >
          <CalendarPlus className="h-4 w-4" strokeWidth={1.5} />
          Schedule Session
        </button>
      </div>

      {/* Unified Toolbar */}
      <div className="bg-white rounded-[16px] border border-[#E8ECF4] px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={goToToday}
              className="rounded-[12px] px-4 py-2 text-sm font-medium text-content-primary hover:bg-lavender transition-colors"
            >
              Today
            </button>
            <div className="flex items-center">
              <button
                onClick={() => navigateDate(-1)}
                className="rounded-[12px] p-2 text-content-secondary hover:bg-lavender hover:text-content-primary transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => navigateDate(1)}
                className="rounded-[12px] p-2 text-content-secondary hover:bg-lavender hover:text-content-primary transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <span className="ml-2 text-lg font-semibold text-content-primary">{getHeaderText()}</span>
          </div>

          {/* Center/Right: Search, Filter, View Toggle */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" strokeWidth={1.5} />
              <input
                type="text"
                placeholder="Search patient name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-56 rounded-[12px] border border-[#E2E8F0] bg-white pl-10 pr-4 text-sm text-content-primary placeholder:text-content-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-[12px] border border-[#E2E8F0] bg-white px-3 pr-8 text-sm font-medium text-content-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer transition-all"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748B' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 8px center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '20px',
              }}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* View Toggle - Segmented Control */}
            <div className="flex rounded-[12px] bg-[#F1F5F9] p-1">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  onClick={() => handleViewChange(v)}
                  className={`rounded-[10px] px-4 py-1.5 text-sm font-medium transition-all duration-150 ${
                    view === v 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'text-content-secondary hover:text-content-primary hover:bg-lavender/50'
                  }`}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div 
        ref={calendarRef}
        className="bg-white rounded-[20px] border border-[#E8ECF4] shadow-sm overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
          </div>
        ) : filteredEvents.length === 0 && (searchQuery || statusFilter) ? (
          <div className="py-20">
            <EmptyState
              icon="search"
              title="No results found"
              description={`No appointments match "${searchQuery || statusFilter}". Try adjusting your search or filters.`}
              action={() => {
                setSearchQuery('')
                setStatusFilter('')
              }}
              actionLabel="Clear filters"
            />
          </div>
        ) : events.length === 0 ? (
          <div className="py-20">
            <EmptyState
              icon="calendar"
              title="No appointments scheduled"
              description="Your calendar is free. Schedule your first session to get started."
              action={() => setShowScheduleModal(true)}
              actionLabel="Schedule Session"
            />
          </div>
        ) : view === 'month' ? (
          <MonthView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onSlotClick={(date) => handleSlotClick(date, 9)}
            onContextMenu={handleContextMenu}
          />
        ) : view === 'week' ? (
          <WeekView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
            onContextMenu={handleContextMenu}
          />
        ) : (
          <DayView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-[14px] border border-[#E8ECF4] bg-white py-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleEditAppointment(contextMenu.event.id)}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-content-primary hover:bg-lavender transition-colors"
          >
            <Edit className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
            Edit Appointment
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${contextMenu.event.patient_name} - ${formatTime(contextMenu.event.start)}`)
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-content-primary hover:bg-lavender transition-colors"
          >
            <Copy className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
            Copy Details
          </button>
          <button
            onClick={() => {
              navigate(`/patients/${contextMenu.event.patient_id}`)
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-content-primary hover:bg-lavender transition-colors"
          >
            <ExternalLink className="h-4 w-4 text-content-muted" strokeWidth={1.5} />
            Open Patient
          </button>
          <div className="my-1.5 border-t border-[#F1F5F9]" />
          <button
            onClick={() => {
              handleCancelAppointment(contextMenu.event.id)
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-error-text hover:bg-error-bg transition-colors"
          >
            <XCircle className="h-4 w-4" strokeWidth={1.5} />
            Cancel Appointment
          </button>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleModal
          initialDate={selectedSlot?.date}
          initialStartTime={selectedSlot?.startTime}
          initialEndTime={selectedSlot?.endTime}
          patients={patients}
          practitioners={isOwner ? practitioners : []}
          onSubmit={handleCreateAppointment}
          onClose={() => {
            setShowScheduleModal(false)
            setSelectedSlot(null)
          }}
        />
      )}

      {/* Appointment Detail Panel */}
      {showDetailPanel && selectedEvent && (
        <AppointmentDetail
          appointmentId={selectedEvent.id}
          onUpdate={handleUpdateAppointment}
          onCancel={handleCancelAppointment}
          onDelete={handleDeleteAppointment}
          onEdit={handleEditAppointment}
          onClose={() => {
            setShowDetailPanel(false)
            setSelectedEvent(null)
          }}
          onRefresh={loadEvents}
        />
      )}

      {/* Edit Appointment Modal */}
      {showEditModal && editingAppointment && (
        <ScheduleModal
          editMode
          initialData={editingAppointment}
          patients={patients}
          practitioners={isOwner ? practitioners : []}
          onSubmit={handleSaveEditedAppointment}
          onClose={() => {
            setShowEditModal(false)
            setEditingAppointment(null)
          }}
        />
      )}
    </div>
  )
}

// Day View Component
function DayView({ currentDate, events, onEventClick, onSlotClick, onContextMenu }) {
  const dayEvents = events.filter(e => isSameDay(new Date(e.start), currentDate))
  const now = new Date()
  const isToday = isSameDay(currentDate, now)
  const currentHourOffset = isToday ? (now.getHours() + now.getMinutes() / 60 - 7) * 72 : -1
  const scrollRef = useRef(null)

  // Open the grid scrolled to something relevant instead of the empty 7 AM slot:
  // current time if viewing today, otherwise the day's earliest session.
  useEffect(() => {
    if (!scrollRef.current) return
    const targetHour = isToday
      ? now.getHours() + now.getMinutes() / 60
      : dayEvents.length > 0
        ? Math.min(...dayEvents.map(e => { const t = new Date(e.start); return t.getHours() + t.getMinutes() / 60 }))
        : 9
    scrollRef.current.scrollTop = Math.max(0, (targetHour - 7) * 72 - 72)
  }, [currentDate])

  if (dayEvents.length === 0) {
    return (
      <div className="py-20">
        <EmptyState
          icon="calendar"
          title="No appointments today"
          description="This day is free. Click any time slot to schedule a session."
          action={() => onSlotClick(currentDate, 9)}
          actionLabel="Schedule Session"
        />
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex h-[700px] overflow-auto">
      {/* Time Column */}
      <div className="sticky left-0 z-10 w-20 flex-shrink-0 border-r border-[#E8ECF4] bg-white">
        <div className="h-14 border-b border-[#E8ECF4]" />
        {HOURS.map((hour) => (
          <div key={hour} className="h-[72px] border-b border-[#F1F5F9] pr-3 pt-0 text-right">
            <span className="text-xs font-medium text-content-muted">
              {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
            </span>
          </div>
        ))}
      </div>

      {/* Day Column */}
      <div className={`flex-1 ${isToday ? 'bg-indigo-50/30' : ''}`}>
        <div className={`sticky top-0 z-10 flex h-14 flex-col items-center justify-center border-b border-[#E8ECF4] ${isToday ? 'bg-primary-light' : 'bg-slate-50/80'}`}>
          <span className="text-xs font-medium text-content-muted">{currentDate.toLocaleDateString('en-US', { weekday: 'short' })}</span>
          <span className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-content-primary'}`}>{currentDate.getDate()}</span>
        </div>
        <div className="relative">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="h-[72px] border-b border-[#F1F5F9] cursor-pointer hover:bg-lavender/30 transition-colors"
              onClick={() => onSlotClick(currentDate, hour)}
            />
          ))}
          
          {/* Current Time Indicator */}
          {isToday && currentHourOffset >= 0 && currentHourOffset <= HOURS.length * 72 && (
            <div
              className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
              style={{ top: `${currentHourOffset}px` }}
            >
              <div className="h-3 w-3 rounded-full bg-primary shadow-md" />
              <div className="flex-1 h-[2px] bg-primary" />
            </div>
          )}
          
          {/* Events */}
          {dayEvents.map((event) => (
            <EventBlock 
              key={event.id} 
              event={event} 
              onClick={() => onEventClick(event)} 
              onContextMenu={(e) => onContextMenu(e, event)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Week View Component
function WeekView({ currentDate, events, onEventClick, onSlotClick, onContextMenu }) {
  const weekDates = getWeekDates(currentDate)
  const today = new Date()
  const now = new Date()
  const currentHourOffset = (now.getHours() + now.getMinutes() / 60 - 7) * 72
  const isCurrentWeek = weekDates.some(d => isSameDay(d, today))
  const scrollRef = useRef(null)

  // Open the grid scrolled to something relevant instead of the empty 7 AM slot:
  // current time if this week includes today, otherwise the week's earliest session.
  useEffect(() => {
    if (!scrollRef.current) return
    const targetHour = isCurrentWeek
      ? now.getHours() + now.getMinutes() / 60
      : events.length > 0
        ? Math.min(...events.map(e => { const t = new Date(e.start); return t.getHours() + t.getMinutes() / 60 }))
        : 9
    scrollRef.current.scrollTop = Math.max(0, (targetHour - 7) * 72 - 72)
  }, [currentDate])

  return (
    <div ref={scrollRef} className="flex h-[700px] overflow-auto">
      {/* Time Column */}
      <div className="sticky left-0 z-10 w-20 flex-shrink-0 border-r border-[#E8ECF4] bg-white">
        <div className="h-14 border-b border-[#E8ECF4]" />
        {HOURS.map((hour) => (
          <div key={hour} className="h-[72px] border-b border-[#F1F5F9] pr-3 pt-0 text-right">
            <span className="text-xs font-medium text-content-muted">
              {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
            </span>
          </div>
        ))}
      </div>

      {/* Days */}
      {weekDates.map((date, idx) => {
        const dayEvents = events.filter(e => isSameDay(new Date(e.start), date))
        const isToday = isSameDay(date, today)
        const weekend = isWeekend(date)

        return (
          <div 
            key={idx} 
            className={`flex-1 min-w-[120px] border-r border-[#E8ECF4] last:border-r-0 ${
              isToday ? 'bg-indigo-50/30' : weekend ? 'bg-slate-50/50' : ''
            }`}
          >
            <div className={`sticky top-0 z-10 flex h-14 flex-col items-center justify-center border-b border-[#E8ECF4] ${
              isToday ? 'bg-primary-light' : 'bg-slate-50/80'
            }`}>
              <span className="text-xs font-medium text-content-muted">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-content-primary'}`}>{date.getDate()}</span>
            </div>
            <div className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-[72px] border-b border-[#F1F5F9] cursor-pointer hover:bg-lavender/30 transition-colors"
                  onClick={() => onSlotClick(date, hour)}
                />
              ))}
              
              {/* Current Time Indicator */}
              {isToday && currentHourOffset >= 0 && currentHourOffset <= HOURS.length * 72 && (
                <div
                  className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                  style={{ top: `${currentHourOffset}px` }}
                >
                  <div className="h-3 w-3 rounded-full bg-primary shadow-md" />
                  <div className="flex-1 h-[2px] bg-primary" />
                </div>
              )}
              
              {dayEvents.map((event) => (
                <EventBlock 
                  key={event.id} 
                  event={event} 
                  onClick={() => onEventClick(event)} 
                  onContextMenu={(e) => onContextMenu(e, event)}
                  compact 
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Month View Component
function MonthView({ currentDate, events, onEventClick, onSlotClick, onContextMenu }) {
  const monthDates = getMonthDates(currentDate)
  const today = new Date()
  const currentMonth = currentDate.getMonth()

  const getEventsForDate = (date) => events.filter(e => isSameDay(new Date(e.start), date))

  return (
    <div>
      {/* Week Days Header */}
      <div className="grid grid-cols-7 border-b border-[#E8ECF4] bg-slate-50/80">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-content-muted">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {monthDates.map((date, idx) => {
          const dayEvents = getEventsForDate(date)
          const isToday = isSameDay(date, today)
          const isCurrentMonth = date.getMonth() === currentMonth
          const weekend = isWeekend(date)

          return (
            <div
              key={idx}
              className={`min-h-[120px] border-b border-r border-[#F1F5F9] p-2 cursor-pointer transition-colors hover:bg-lavender/20 ${
                !isCurrentMonth ? 'bg-slate-50/50' : weekend ? 'bg-slate-50/30' : ''
              }`}
              onClick={() => onSlotClick(date)}
            >
              <div className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                isToday 
                  ? 'bg-primary text-white shadow-sm' 
                  : isCurrentMonth 
                    ? 'text-content-primary' 
                    : 'text-content-muted'
              }`}>
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => {
                  const typeConfig = SESSION_TYPE_CONFIG[event.session_type] || SESSION_TYPE_CONFIG.therapy_session
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event) }}
                      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, event) }}
                      className={`truncate rounded-md border-l-[3px] bg-white px-2 py-1 text-xs font-medium cursor-pointer shadow-sm hover:shadow transition-shadow ${typeConfig.color}`}
                    >
                      <span className="text-content-muted">{formatTime(event.start)}</span>{' '}
                      <span className="text-content-primary">{event.patient_name}</span>
                    </div>
                  )
                })}
                {dayEvents.length > 3 && (
                  <div className="text-xs font-medium text-primary px-2">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Event Block Component
function EventBlock({ event, onClick, onContextMenu, compact = false }) {
  const startTime = new Date(event.start)
  const endTime = new Date(event.end)
  const startHour = startTime.getHours() + startTime.getMinutes() / 60
  const duration = (endTime - startTime) / (1000 * 60 * 60)
  const top = (startHour - 7) * 72
  const height = Math.max(duration * 72, 32)
  
  const typeConfig = SESSION_TYPE_CONFIG[event.session_type] || SESSION_TYPE_CONFIG.therapy_session
  const TypeIcon = typeConfig.icon
  const ModeIcon = event.session_mode === 'online' ? Video : Building

  const showAvatar = !compact && height >= 48
  const showTime = height >= 48
  const showTypeRow = !compact && height >= 72

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`absolute left-1.5 right-1.5 rounded-[14px] border-l-[4px] bg-white px-3 py-2 cursor-pointer overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 shadow-sm ${typeConfig.color}`}
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      <div className="flex items-start gap-2">
        {showAvatar && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-content-primary">
            {event.patient_name?.charAt(0) || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-content-primary truncate">
            {event.patient_name}
          </div>
          {showTime && (
            <div className="flex items-center gap-1 text-xs text-content-muted truncate">
              <span className="truncate">{formatTime(event.start)} – {formatTime(event.end)}</span>
              {compact && <ModeIcon className="h-3 w-3 shrink-0" strokeWidth={1.5} />}
            </div>
          )}
          {showTypeRow && (
            <div className="mt-1 flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-content-muted">
                <ModeIcon className="h-3 w-3" strokeWidth={1.5} />
                <span>{event.session_mode === 'online' ? 'Video' : 'In-Person'}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-content-muted">
                <TypeIcon className="h-3 w-3" strokeWidth={1.5} />
                <span className="truncate">{typeConfig.label}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
