import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, X, Users } from 'lucide-react'
import { updateAppointment } from '../../api/client'

const DASHBOARD_LIMIT = 5

const ATTENDANCE_MAP = {
  present: 'completed',
  absent: 'no_show',
}

const STATUS_TO_ATTENDANCE = {
  completed: 'present',
  no_show: 'absent',
}

function formatDateTime(appt) {
  const date = new Date(appt.date + (String(appt.date).includes('T') ? '' : 'T12:00:00')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const time = new Date(appt.start_time).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${date} · ${time}`
}

// Single segmented pair, used identically at every width (design system §7:
// "one segmented pair, used identically on desktop and mobile") — replaces
// the old AttendanceCheck/AttendancePill split, which was two different
// components standing in for the same state.
function AttendanceSeg({ appt, attendance, savingId, onSet }) {
  return (
    <div className="seg">
      <button
        type="button"
        className="seg-option"
        aria-pressed={attendance === 'present'}
        disabled={savingId === appt.id}
        onClick={() => onSet(appt, 'present')}
      >
        <Check size={14} strokeWidth={2.5} />
        Present
      </button>
      <button
        type="button"
        className="seg-option"
        aria-pressed={attendance === 'absent'}
        disabled={savingId === appt.id}
        onClick={() => onSet(appt, 'absent')}
      >
        <X size={14} strokeWidth={2.5} />
        Absent
      </button>
    </div>
  )
}

export default function RecentPatients({ appointments = [] }) {
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
    <section>
      <div className="section-head">
        <h2 className="t-h2">Recent patients</h2>
        {hasMore && (
          <Link to="/calendar" className="link">
            View all
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <Users size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} />
          <h3 className="empty-title">No recent appointments</h3>
          <p className="empty-body">Past sessions will appear here for attendance tracking</p>
        </div>
      ) : (
        <div className="table-wrap card-flush">
          {displayRows.map((appt) => {
            const attendance = STATUS_TO_ATTENDANCE[appt.status] || null
            return (
              <div key={appt.id} className="list-row rp-row">
                <div className="rp-id">
                  <span className="t-caption tnum rp-datetime">{formatDateTime(appt)}</span>
                  <span className="t-cell-key truncate">{appt.patient_name}</span>
                </div>
                <AttendanceSeg appt={appt} attendance={attendance} savingId={savingId} onSet={handleAttendance} />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
