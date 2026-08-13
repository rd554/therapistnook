import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, CalendarPlus, Video, MapPin, Loader2, Mail, Check } from 'lucide-react'
import { generateMeetingLink } from '../../api/client'

const SESSION_TYPE_LABELS = {
  therapy_session: 'Therapy Session',
  follow_up: 'Follow-up',
  assessment_session: 'Assessment',
  consultation: 'Consultation',
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function TodaySchedule({ schedule }) {
  const navigate = useNavigate()
  const appointments = schedule?.appointments || []
  const totalCount = schedule?.total_count ?? appointments.length
  const hasAppointments = appointments.length > 0

  // Appointments created before Google Calendar was connected (or before
  // this feature existed) don't have a meeting_link yet. Track links we
  // generate on demand, and which appointment is currently generating one.
  const [generatedLinks, setGeneratedLinks] = useState({})
  const [generatingId, setGeneratingId] = useState(null)
  const [errorId, setErrorId] = useState(null)

  // Separate from generatingId — this is for re-emailing a link that already
  // exists, so it doesn't touch Google Calendar and shouldn't open a new tab.
  const [emailingId, setEmailingId] = useState(null)
  const [emailedId, setEmailedId] = useState(null)
  const [emailErrorId, setEmailErrorId] = useState(null)
  const [emailErrorMsg, setEmailErrorMsg] = useState('')

  const handleGenerateLink = async (appt) => {
    setGeneratingId(appt.id)
    setErrorId(null)
    try {
      const updated = await generateMeetingLink(appt.id)
      if (updated.meeting_link) {
        setGeneratedLinks((prev) => ({ ...prev, [appt.id]: updated.meeting_link }))
        window.open(updated.meeting_link, '_blank', 'noopener,noreferrer')
      }
    } catch {
      setErrorId(appt.id)
    } finally {
      setGeneratingId(null)
    }
  }

  const handleEmailLink = async (appt) => {
    setEmailingId(appt.id)
    setEmailErrorId(null)
    try {
      // Same endpoint — when a link already exists it skips Google entirely
      // and just (re)sends the email to the patient.
      const updated = await generateMeetingLink(appt.id)
      if (updated.email_sent) {
        setEmailedId(appt.id)
        setTimeout(() => setEmailedId((current) => (current === appt.id ? null : current)), 3000)
      } else {
        // Link exists, but the email itself didn't go out — don't show the
        // checkmark for something that didn't happen.
        setEmailErrorId(appt.id)
        setEmailErrorMsg(updated.email_error || 'Could not email the link')
      }
    } catch {
      setEmailErrorId(appt.id)
      setEmailErrorMsg('Could not email the link')
    } finally {
      setEmailingId(null)
    }
  }

  return (
    <section className="dash-section">
      <div className="dash-section__heading">
        <div className="dash-section__heading-left">
          <h2 className="dash-section__title">Today&apos;s Schedule</h2>
          {hasAppointments && (
            <span className="dash-section__badge">
              {totalCount} session{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {!hasAppointments ? (
        <div className="dash-empty">
          <div className="empty-state-icon mx-auto mb-3">
            <Calendar size={28} strokeWidth={1.5} />
          </div>
          <h3 className="text-card-title mb-1">No appointments today</h3>
          <p className="text-secondary mb-5" style={{ fontSize: '14px' }}>
            Your schedule is clear for today
          </p>
          <Link to="/calendar" className="btn-primary-sm inline-flex items-center gap-2">
            <CalendarPlus size={16} strokeWidth={1.5} />
            Schedule Appointment
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {appointments.map((appt) => {
            const isOnline = appt.session_mode === 'online'
            // Only a still-scheduled session should offer a join/generate action —
            // a cancelled or completed online session shouldn't create a fresh
            // calendar invite.
            const canJoin = isOnline && appt.status === 'scheduled'
            const typeLabel = SESSION_TYPE_LABELS[appt.session_type] || appt.session_type?.replace(/_/g, ' ')
            const meetingLink = appt.meeting_link || generatedLinks[appt.id]
            const isGenerating = generatingId === appt.id
            return (
              <div
                key={appt.id}
                className={`dash-session-card ${isOnline ? 'dash-session-card--online' : 'dash-session-card--offline'}`}
                onClick={() => navigate('/calendar')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate('/calendar')
                  }
                }}
              >
                <div className="dash-session-card__chip">
                  {isOnline ? (
                    <Video size={18} strokeWidth={1.5} />
                  ) : (
                    <MapPin size={18} strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="dash-session-card__name truncate">{appt.patient_name}</p>
                  <p className="dash-session-card__meta">
                    {formatTime(appt.start_time)}
                    <span style={{ margin: '0 8px', color: '#94A3B8' }}>·</span>
                    {typeLabel}
                    <span style={{ margin: '0 8px', color: '#94A3B8' }}>·</span>
                    {isOnline ? 'Online' : 'In-person'}
                  </p>
                  {errorId === appt.id && (
                    <p className="dash-session-card__error">
                      Couldn&apos;t create a link. Connect Google Calendar in Settings.
                    </p>
                  )}
                  {emailErrorId === appt.id && (
                    <p className="dash-session-card__error">{emailErrorMsg}</p>
                  )}
                </div>
                {canJoin && (
                  meetingLink ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dash-session-card__join"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Video size={14} strokeWidth={2} />
                        Join Now
                      </a>
                      <button
                        type="button"
                        title={emailedId === appt.id ? 'Link emailed to patient' : 'Email link to patient'}
                        className="dash-session-card__icon-btn"
                        disabled={emailingId === appt.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEmailLink(appt)
                        }}
                      >
                        {emailingId === appt.id ? (
                          <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                        ) : emailedId === appt.id ? (
                          <Check size={14} strokeWidth={2} />
                        ) : (
                          <Mail size={14} strokeWidth={2} />
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="dash-session-card__join"
                      disabled={isGenerating}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleGenerateLink(appt)
                      }}
                    >
                      {isGenerating ? (
                        <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                      ) : (
                        <Video size={14} strokeWidth={2} />
                      )}
                      {isGenerating ? 'Getting link…' : 'Get Meet Link'}
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
