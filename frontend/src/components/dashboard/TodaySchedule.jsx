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

  // The "next / current" card (design system §6): the first still-scheduled
  // appointment that hasn't ended yet. Appointments arrive sorted ascending
  // by start_time, so the first match is earliest. Everything else on the
  // list is either later today, already over, or cancelled — none of those
  // get the accent rule, per the one-accented-card rule.
  const now = Date.now()
  const nextAppt = appointments.find(
    (a) => a.status === 'scheduled' && new Date(a.end_time).getTime() > now
  )
  const nextId = nextAppt?.id

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
    <section>
      <div className="section-head">
        <h2 className="t-h2">Today&apos;s schedule</h2>
        {hasAppointments && (
          <span className="t-caption">
            {totalCount} session{totalCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!hasAppointments ? (
        <div className="empty">
          <Calendar size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto 12px' }} />
          <h3 className="empty-title">No appointments today</h3>
          <p className="empty-body">Your schedule is clear for today</p>
          <Link to="/calendar" className="btn btn-primary btn-sm inline-flex items-center gap-2">
            <CalendarPlus size={16} strokeWidth={1.5} />
            Schedule appointment
          </Link>
        </div>
      ) : (
        <div className="stack-cards">
          {appointments.map((appt) => {
            const isOnline = appt.session_mode === 'online'
            const isNext = appt.id === nextId
            const isCancelled = appt.status === 'cancelled'
            // Everything that isn't still-scheduled or cancelled (completed,
            // no-show, rescheduled) reads as "already happened" here — a
            // quiet, muted row with no action. Attendance detail for those
            // lives in Recent Patients, not here.
            const isPast = !isCancelled && appt.status !== 'scheduled'
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
                className={`card sched-card ${isNext ? 'rule-accent' : ''}`}
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
                <div className="sched-left">
                  <span className="icon-badge">
                    {isOnline ? (
                      <Video size={16} strokeWidth={1.5} />
                    ) : (
                      <MapPin size={16} strokeWidth={1.5} />
                    )}
                  </span>
                  <div className="sched-text">
                    <span
                      className="t-h3 truncate"
                      style={
                        isCancelled || isPast
                          ? { fontWeight: 400, color: 'var(--text-muted)' }
                          : isNext
                          ? undefined
                          : { fontWeight: 500 }
                      }
                    >
                      {appt.patient_name}
                    </span>
                    {isCancelled ? (
                      <span className="t-body-s">
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                          {formatTime(appt.start_time)}
                        </span>
                        {' · '}
                        <span style={{ fontWeight: 500, color: 'var(--warning)' }}>Cancelled</span>
                      </span>
                    ) : (
                      <span className="t-body-s" style={isPast ? { color: 'var(--text-muted)' } : undefined}>
                        {typeLabel} · {isOnline ? 'Online' : 'In person'}
                        {isPast && (
                          <>
                            {' '}
                            <Check size={14} strokeWidth={2} style={{ display: 'inline', verticalAlign: '-2px' }} />
                          </>
                        )}
                      </span>
                    )}
                    {errorId === appt.id && (
                      <span className="t-caption" style={{ color: 'var(--error)' }}>
                        Couldn&apos;t create a link. Connect Google Calendar in Settings.
                      </span>
                    )}
                    {emailErrorId === appt.id && (
                      <span className="t-caption" style={{ color: 'var(--error)' }}>{emailErrorMsg}</span>
                    )}
                  </div>
                </div>

                <div className="sched-right">
                  <span className={isNext ? 't-num-key' : 't-num'}>{formatTime(appt.start_time)}</span>
                  {canJoin && (
                    meetingLink ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`btn btn-sm ${isNext ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Video size={14} strokeWidth={2} />
                          Join now
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
                        className={`btn btn-sm ${isNext ? 'btn-primary' : 'btn-secondary'}`}
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
                        {isGenerating ? 'Getting link…' : 'Get link'}
                      </button>
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
