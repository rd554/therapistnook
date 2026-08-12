import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, Users, ArrowRight } from 'lucide-react'
import { updateAppointment } from '../../api/client'

const DASHBOARD_LIMIT = 5

const ATTENDANCE_MAP = {
  present: 'completed',
  absent: 'no_show',
  rescheduled: 'rescheduled',
}

const STATUS_TO_ATTENDANCE = {
  completed: 'present',
  no_show: 'absent',
  rescheduled: 'rescheduled',
}

function formatDate(dateStr) {
  return new Date(dateStr + (String(dateStr).includes('T') ? '' : 'T12:00:00')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function AttendanceCheck({ kind, active, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`dash-check dash-check--${kind}${active ? ' dash-check--on' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={kind}
    >
      {active && <Check size={12} strokeWidth={2.5} />}
    </button>
  )
}

export default function RecentPatientsTable({ appointments = [] }) {
  const [rows, setRows] = useState(appointments)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    setRows(appointments)
  }, [appointments])

  const handleAttendance = async (appt, next) => {
    const current = STATUS_TO_ATTENDANCE[appt.status]
    const newStatus = current === next ? 'scheduled' : ATTENDANCE_MAP[next]
    setSavingId(appt.id)
    setRows((prev) => prev.map((r) => (r.id === appt.id ? { ...r, status: newStatus } : r)))
    try {
      await updateAppointment(appt.id, { status: newStatus })
    } catch {
      setRows((prev) => prev.map((r) => (r.id === appt.id ? { ...r, status: appt.status } : r)))
    } finally {
      setSavingId(null)
    }
  }

  const displayRows = rows.slice(0, DASHBOARD_LIMIT)
  const hasMore = rows.length > DASHBOARD_LIMIT

  return (
    <section className="dash-section">
      <div className="dash-section__heading dash-section__heading--narrow">
        <div className="dash-section__heading-left">
          <h2 className="dash-section__title">Recent Patients</h2>
        </div>
        {rows.length > 0 && (
          <Link to="/calendar" className="dash-section__action">
            View all
            <ArrowRight size={14} strokeWidth={1.5} />
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="dash-empty">
          <div className="empty-state-icon mx-auto mb-3">
            <Users size={28} strokeWidth={1.5} />
          </div>
          <h3 className="text-card-title mb-1">No recent appointments</h3>
          <p className="text-secondary" style={{ fontSize: '14px' }}>
            Past sessions will appear here for attendance tracking
          </p>
        </div>
      ) : (
        <div className="dash-recent-wrap">
          <div className="dash-recent-labels" aria-hidden="true">
            <span>Date</span>
            <span>Time</span>
            <span>Appointment</span>
            <span className="text-center">Present</span>
            <span className="text-center">Absent</span>
            <span className="text-center">Rescheduled</span>
          </div>
          <div className="dash-recent-list">
            {displayRows.map((appt) => {
              const attendance = STATUS_TO_ATTENDANCE[appt.status] || null
              const isOnline = appt.session_mode === 'online'
              return (
                <div key={appt.id} className="dash-recent-card">
                  <span className="truncate">{formatDate(appt.date)}</span>
                  <span className="truncate">{formatTime(appt.start_time)}</span>
                  <div className="dash-recent-card__appt">
                    <span className={`dash-mode-dot ${isOnline ? 'dash-mode-dot--online' : 'dash-mode-dot--offline'}`} />
                    <span className="truncate">{appt.patient_name}</span>
                  </div>
                  <div className="flex justify-center">
                    <AttendanceCheck
                      kind="present"
                      active={attendance === 'present'}
                      disabled={savingId === appt.id}
                      onClick={() => handleAttendance(appt, 'present')}
                    />
                  </div>
                  <div className="flex justify-center">
                    <AttendanceCheck
                      kind="absent"
                      active={attendance === 'absent'}
                      disabled={savingId === appt.id}
                      onClick={() => handleAttendance(appt, 'absent')}
                    />
                  </div>
                  <div className="flex justify-center">
                    <AttendanceCheck
                      kind="rescheduled"
                      active={attendance === 'rescheduled'}
                      disabled={savingId === appt.id}
                      onClick={() => handleAttendance(appt, 'rescheduled')}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
