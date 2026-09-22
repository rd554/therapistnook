import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Loader2,
  Video, Building, Search,
  Edit, XCircle, AlertTriangle,
  Stethoscope, ClipboardCheck, MessageSquare, RefreshCw,
  Copy, ExternalLink,
} from 'lucide-react'
import {
  getCalendarEvents, getAppointment, createAppointment, updateAppointment,
  cancelAppointment, deleteAppointment, listPatients, getAvailability,
} from '../api/client'
import ScheduleModal from '../components/ScheduleModal'
import AppointmentDetail from '../components/AppointmentDetail'

const VIEWS = ['day', 'week', 'month']
const VIEW_LABELS = { day: 'Day', week: 'Week', month: 'Month' }

// Status decides the event's left rule and (for month view) its dot — never
// session type. See tokens.css .cal-event / .is-noshow / .is-done / .is-cancelled.
function eventStatusClass(status) {
  if (status === 'no_show') return 'is-noshow'
  if (status === 'completed') return 'is-done'
  if (status === 'cancelled') return 'is-cancelled'
  return '' // scheduled / pending / rescheduled default to the accent rule
}

// Mirrors PatientProfile.jsx's status->{label,cls} pattern: plain text, no chips.
const STATUS_META = {
  scheduled: { label: 'Scheduled', cls: 'status-plain' },
  completed: { label: 'Completed', cls: 'status-quiet' },
  cancelled: { label: 'Cancelled', cls: 'status-quiet' },
  no_show: { label: 'No show', cls: 'status-warn' },
  rescheduled: { label: 'Rescheduled', cls: 'status-plain' },
  pending: { label: 'Pending', cls: 'status-plain' },
}

const SESSION_TYPE_META = {
  therapy_session: { label: 'Therapy', icon: Stethoscope },
  assessment_session: { label: 'Assessment', icon: ClipboardCheck },
  consultation: { label: 'Consultation', icon: MessageSquare },
  follow_up: { label: 'Follow-up', icon: RefreshCw },
  emergency: { label: 'Emergency', icon: AlertTriangle },
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All status' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'Missed' },
  { value: 'pending', label: 'Pending' },
]

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_PX = 56

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatHourLabel(hour) {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`
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

function hourDecimal(date) {
  return date.getHours() + date.getMinutes() / 60
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

function parseTimeToDecimal(str) {
  if (!str) return null
  const [h, m] = str.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h + (Number.isNaN(m) ? 0 : m) / 60
}

// A hour-cell is off-hours if it doesn't overlap [practiceHours.start, practiceHours.end) at all.
function isOffHoursCell(hour, practiceHours) {
  if (!practiceHours) return false
  return hour + 1 <= practiceHours.start || hour >= practiceHours.end
}

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
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [practiceHours, setPracticeHours] = useState(null)
  const [now, setNow] = useState(() => new Date())

  // Now-line ticks once a minute — see .cal-now.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

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

  // Practice hours (Settings > Availability) drive both the off-hours tint
  // and the default scroll landing. Falls back to 08:00–18:00 if the call
  // fails — the backend itself always returns a row (auto-created), so this
  // is a defensive fallback, not the expected path.
  const loadPracticeHours = async () => {
    try {
      const data = await getAvailability()
      setPracticeHours({
        start: parseTimeToDecimal(data.work_start_time) ?? 8,
        end: parseTimeToDecimal(data.work_end_time) ?? 18,
      })
    } catch (err) {
      console.error('Failed to load practice hours:', err)
      setPracticeHours({ start: 8, end: 18 })
    }
  }

  useEffect(() => {
    loadEvents()
  }, [view, currentDate])

  useEffect(() => {
    loadPatients()
    loadPracticeHours()
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

  // The confirmation step lives in AppointmentDetail (a styled .btn-danger
  // dialog, mirroring PatientEdit's discard-changes modal) — this handler
  // only runs once the user has already confirmed, so it no longer gates on
  // window.confirm() itself.
  const handleDeleteAppointment = async (appointmentId) => {
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

  return (
    <div className="clinical-ink space-y-5">
      {/* Page header — title + the one .btn-primary this screen gets */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="t-h1">Calendar</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setSelectedSlot(null)
            setShowScheduleModal(true)
          }}
        >
          Schedule session
        </button>
      </div>

      {/* Toolbar — stacks on mobile: nav, then search+filter, then view seg */}
      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={goToToday}>Today</button>
            <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Previous" onClick={() => navigateDate(-1)}>
              <ChevronLeft size={18} strokeWidth={1.5} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Next" onClick={() => navigateDate(1)}>
              <ChevronRight size={18} strokeWidth={1.5} />
            </button>
            <span className="t-h3" style={{ marginLeft: 'var(--space-2)', whiteSpace: 'nowrap' }}>{getHeaderText()}</span>
          </div>

          <div className="flex items-center gap-2 sm:flex-1 sm:justify-end sm:min-w-0 sm:max-w-[420px]">
            <div className="input-search">
              <Search size={16} strokeWidth={1.5} />
              <input
                type="search"
                className="input"
                placeholder="Search patient name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search appointments"
              />
            </div>
            <select
              className="select select-sm"
              style={{ width: 'auto', flex: 'none' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="seg w-full sm:w-auto" role="group" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                className="seg-option flex-1 sm:flex-none"
                aria-pressed={view === v}
                onClick={() => handleViewChange(v)}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar body — grid always renders, even with zero events; an
          empty grid communicates "nothing scheduled" on its own and stays
          fully clickable/bookable (see live-vs-prototype-gaps notes). */}
      <div className="card card-flush" style={{ position: 'relative' }}>
        {loading && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="animate-spin" size={28} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
          </div>
        )}
        {!loading && view === 'month' && (
          <MonthView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onSlotClick={(date) => handleSlotClick(date, 9)}
            onContextMenu={handleContextMenu}
          />
        )}
        {!loading && view === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={filteredEvents}
            now={now}
            practiceHours={practiceHours}
            onSlotClick={handleSlotClick}
            onEventClick={handleEventClick}
            onContextMenu={handleContextMenu}
          />
        )}
        {!loading && view === 'day' && (
          <DayView
            currentDate={currentDate}
            events={filteredEvents}
            now={now}
            practiceHours={practiceHours}
            onSlotClick={handleSlotClick}
            onEventClick={handleEventClick}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="card" style={{ position: 'fixed', zIndex: 50, minWidth: '190px', padding: 'var(--space-2)', left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => handleEditAppointment(contextMenu.event.id)}
          >
            <Edit size={16} strokeWidth={1.5} />
            Edit appointment
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              navigator.clipboard.writeText(`${contextMenu.event.patient_name} - ${formatTime(contextMenu.event.start)}`)
              setContextMenu(null)
            }}
          >
            <Copy size={16} strokeWidth={1.5} />
            Copy details
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              navigate(`/patients/${contextMenu.event.patient_id}`)
              setContextMenu(null)
            }}
          >
            <ExternalLink size={16} strokeWidth={1.5} />
            Open patient
          </button>
          <div style={{ margin: 'var(--space-2) 0', borderTop: 'var(--border-width) solid var(--hairline)' }} />
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ justifyContent: 'flex-start', color: 'var(--error)' }}
            onClick={() => {
              handleCancelAppointment(contextMenu.event.id)
              setContextMenu(null)
            }}
          >
            <XCircle size={16} strokeWidth={1.5} />
            Cancel appointment
          </button>
        </div>
      )}

      {/* Schedule modal */}
      {showScheduleModal && (
        <ScheduleModal
          initialDate={selectedSlot?.date}
          initialStartTime={selectedSlot?.startTime}
          initialEndTime={selectedSlot?.endTime}
          patients={patients}
          onSubmit={handleCreateAppointment}
          onScheduled={loadEvents}
          onClose={() => {
            setShowScheduleModal(false)
            setSelectedSlot(null)
          }}
        />
      )}

      {/* Appointment detail */}
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

      {/* Edit appointment modal */}
      {showEditModal && editingAppointment && (
        <ScheduleModal
          editMode
          initialData={editingAppointment}
          patients={patients}
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

// Shared 24-hour grid for Day and Week views — one hour<->pixel mapping
// (HOUR_PX, 0am-anchored) lives here and in EventBlock, nowhere else.
function CalendarGrid({ days, events, now, practiceHours, onSlotClick, onEventClick, onContextMenu }) {
  const scrollRef = useRef(null)
  const today = new Date()
  const dayCount = days.length
  const daysKey = days.map((d) => d.toDateString()).join(',')

  // Default scroll landing = earliest of (first appointment in view − 1h)
  // and the practice's configured start time; 08:00 if neither applies.
  useEffect(() => {
    if (!scrollRef.current) return
    const rangeEvents = events.filter((e) => days.some((d) => isSameDay(new Date(e.start), d)))
    const candidates = []
    if (rangeEvents.length) {
      candidates.push(Math.min(...rangeEvents.map((e) => hourDecimal(new Date(e.start)))) - 1)
    }
    if (practiceHours) candidates.push(practiceHours.start)
    const targetHour = candidates.length ? Math.max(0, Math.min(...candidates)) : 8
    scrollRef.current.scrollTop = targetHour * HOUR_PX
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey, practiceHours])

  return (
    <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-head" style={{ '--days': dayCount }}>
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className={`cal-daycell${isSameDay(d, today) ? ' is-today' : ''}`}>
              <span className="cal-dayname">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className="cal-daynum">{d.getDate()}</span>
            </div>
          ))}
        </div>
        <div className="cal-grid" style={{ '--days': dayCount }}>
          <div className="cal-timecol">
            {HOURS.map((h) => (
              <div key={h} className={`cal-hourlabel${isOffHoursCell(h, practiceHours) ? ' is-offhours' : ''}`}>
                {formatHourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayEvents = events.filter((e) => isSameDay(new Date(e.start), d))
            const showNow = isSameDay(d, today)
            const nowTop = hourDecimal(now) * HOUR_PX

            return (
              <div key={d.toISOString()} className="cal-daycol">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className={`cal-cell${isOffHoursCell(h, practiceHours) ? ' is-offhours' : ''}`}
                    onClick={() => onSlotClick(d, h)}
                  />
                ))}
                {showNow && <div className="cal-now" style={{ top: `${nowTop}px` }} />}
                {dayEvents.map((event) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    onClick={() => onEventClick(event)}
                    onContextMenu={(e) => onContextMenu(e, event)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
  )
}

function DayView({ currentDate, events, now, practiceHours, onSlotClick, onEventClick, onContextMenu }) {
  return (
    <CalendarGrid
      days={[currentDate]}
      events={events}
      now={now}
      practiceHours={practiceHours}
      onSlotClick={onSlotClick}
      onEventClick={onEventClick}
      onContextMenu={onContextMenu}
    />
  )
}

function WeekView({ currentDate, events, now, practiceHours, onSlotClick, onEventClick, onContextMenu }) {
  return (
    <CalendarGrid
      days={getWeekDates(currentDate)}
      events={events}
      now={now}
      practiceHours={practiceHours}
      onSlotClick={onSlotClick}
      onEventClick={onEventClick}
      onContextMenu={onContextMenu}
    />
  )
}

// Month view is unaffected by the 24-hour rule — still a 6x7 grid of dates.
function MonthView({ currentDate, events, onEventClick, onSlotClick, onContextMenu }) {
  const monthDates = getMonthDates(currentDate)
  const today = new Date()
  const currentMonth = currentDate.getMonth()

  const getEventsForDate = (date) => events.filter((e) => isSameDay(new Date(e.start), date))

  return (
    <div>
      <div className="grid grid-cols-7" style={{ borderBottom: 'var(--border-width) solid var(--hairline)', background: 'var(--surface)' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="t-caption" style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'center' }}>
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {monthDates.map((date, idx) => {
          const dayEvents = getEventsForDate(date)
          const isToday = isSameDay(date, today)
          const isCurrentMonth = date.getMonth() === currentMonth

          return (
            <div
              key={idx}
              style={{
                minHeight: '120px', padding: 'var(--space-2)', cursor: 'pointer',
                borderTop: 'var(--border-width) solid var(--hairline)',
                borderLeft: 'var(--border-width) solid var(--hairline)',
                background: !isCurrentMonth ? 'var(--surface)' : 'transparent',
              }}
              onClick={() => onSlotClick(date)}
            >
              <div
                className="t-caption"
                style={{
                  display: 'flex', height: '26px', width: '26px', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', marginBottom: 'var(--space-2)', fontWeight: 600,
                  background: isToday ? 'var(--selected)' : 'transparent',
                  color: isToday ? 'var(--accent)' : isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className={`cal-event cal-event-mini ${eventStatusClass(event.status)}`.trim()}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event) }}
                    onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, event) }}
                  >
                    <span className="cal-event-name">{event.patient_name}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="t-caption" style={{ padding: '0 var(--space-2)', color: 'var(--accent)' }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventBlock({ event, onClick, onContextMenu }) {
  const startTime = new Date(event.start)
  const endTime = new Date(event.end)
  const duration = (endTime - startTime) / (1000 * 60 * 60)
  const top = hourDecimal(startTime) * HOUR_PX
  const height = Math.max(duration * HOUR_PX, 24)
  const ModeIcon = event.session_mode === 'online' ? Video : Building

  return (
    <div
      className={`cal-event ${eventStatusClass(event.status)}`.trim()}
      style={{ top: `${top}px`, height: `${height}px` }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className="cal-event-name">{event.patient_name}</span>
      {height >= 40 && (
        <span className="cal-event-meta">
          <ModeIcon size={11} strokeWidth={1.5} />
          {formatTime(event.start)}
        </span>
      )}
    </div>
  )
}
