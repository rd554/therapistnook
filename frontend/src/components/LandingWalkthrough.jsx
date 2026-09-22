import { useEffect, useRef, useState } from 'react'
import { Video, FileText, Users } from 'lucide-react'

// The one orchestrated scroll moment on the landing page — everything else on
// the page is static. Panels below are built from the real product's own
// classes (see each panel's comment for the source component), not a second,
// simplified copy of the UI — so this doesn't drift from the product the way
// a forked mockup would.
const STEPS = [
  {
    label: 'Intake',
    title: 'A patient fills your intake form',
    body: 'They land on your booking page, fill a short intake form, and show up in your patient list — no back-and-forth emails.',
  },
  {
    label: 'Schedule',
    title: 'Book it once, both calendars agree',
    body: 'Sessions sync both ways with Google Calendar, so a booking on either side is never out of date on the other.',
  },
  {
    label: 'Assess',
    title: 'Full inventories, scored automatically',
    body: 'Send a standardized assessment, and get gender-specific scoring the moment it’s submitted — no manual lookups.',
  },
  {
    label: 'Understand',
    title: 'The clinical picture, drawn from the record',
    body: 'Assessment results, documents and session history are pulled into one clinical summary you can read in a minute.',
  },
  {
    label: 'Get paid',
    title: 'A month of sessions, one invoice',
    body: 'Select a patient’s sessions for the month and generate one combined invoice instead of chasing each one down.',
  },
]

const LEAD_FACTOR = 1.08

export default function LandingWalkthrough() {
  const trackRef = useRef(null)
  const pathFillRef = useRef(null)
  const tickingRef = useRef(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const render = () => {
      tickingRef.current = false
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const vh = window.innerHeight
      const total = rect.height - vh
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0
      const idx = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * LEAD_FACTOR))
      setActiveIndex(idx)
      if (pathFillRef.current) {
        pathFillRef.current.style.height = `${(idx / (STEPS.length - 1)) * 100}%`
      }
    }

    const onScrollOrResize = () => {
      if (tickingRef.current) return
      tickingRef.current = true
      requestAnimationFrame(render)
    }

    render()
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [])

  return (
    <div className="clinical-ink">
      <section id="product" className="wt">
        <div style={{ maxWidth: 'var(--container)', margin: '0 auto', padding: 'var(--band-pad-y-tight) var(--page-pad) 24px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
            <h2 className="m-h2">How Therapistnook works</h2>
            <p className="m-lead" style={{ margin: '12px auto 0' }}>
              From the first intake form to the invoice, in one workspace.
            </p>
          </div>
        </div>

        <div className="wt-track" ref={trackRef}>
          <div className="wt-sticky">
            <div className="wt-inner">
              <div className="wt-steps">
                <div className="wt-path">
                  <div className="wt-path-fill" ref={pathFillRef} />
                </div>
                {STEPS.map((step, i) => (
                  <div
                    key={step.label}
                    className={`wt-step${i === activeIndex ? ' is-active' : ''}${i < activeIndex ? ' is-done' : ''}`}
                  >
                    <span className="wt-dot" />
                    <div className="wt-step-label">{step.label}</div>
                    <div className="wt-step-title">{step.title}</div>
                    <div className="wt-step-body">{step.body}</div>
                  </div>
                ))}
              </div>

              <div className="wt-stage" aria-hidden="true">
                <div className={`wt-panel${activeIndex === 0 ? ' is-active' : ''}`}>
                  <IntakePanel />
                </div>
                <div className={`wt-panel${activeIndex === 1 ? ' is-active' : ''}`}>
                  <SchedulePanel />
                </div>
                <div className={`wt-panel${activeIndex === 2 ? ' is-active' : ''}`}>
                  <AssessPanel />
                </div>
                <div className={`wt-panel${activeIndex === 3 ? ' is-active' : ''}`}>
                  <UnderstandPanel />
                </div>
                <div className={`wt-panel${activeIndex === 4 ? ' is-active' : ''}`}>
                  <GetPaidPanel />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile / reduced-motion — a separate section (not a reflow of
            .wt-inner): each step's copy sits directly above its own visual,
            mirroring the prototype's dedicated .mob-wrap markup. */}
        <div className="wt-mobile">
          <div style={{ maxWidth: 'var(--container)', margin: '0 auto', padding: '0 var(--page-pad) 24px' }}>
            {STEPS.map((step, i) => (
              <div className="wt-mobile-step" key={step.label}>
                <div className="wt-step-label">{step.label}</div>
                <div className="wt-step-title">{step.title}</div>
                <p className="wt-step-lead">{step.body}</p>
                <div className="wt-mobile-visual">
                  {i === 0 && <IntakePanel chrome={false} />}
                  {i === 1 && <SchedulePanel chrome={false} />}
                  {i === 2 && <AssessPanel chrome={false} />}
                  {i === 3 && <UnderstandPanel chrome={false} />}
                  {i === 4 && <GetPaidPanel chrome={false} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// Real markup: PractitionerPatients.jsx patient table — .table, tr.needs-action,
// .avatar.avatar-accent, .chip.chip-intake.
function IntakePanel({ chrome = true }) {
  const body = (
    <div className="frame-body">
      <table className="table">
        <tbody>
          <tr className="needs-action">
            <td>
              <span className="t-cell-key" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="avatar avatar-accent">KN</span>
                <span>
                  Kabir Nair
                  <span className="t-caption" style={{ display: 'block' }}>29 &middot; Male &middot; added just now</span>
                </span>
              </span>
            </td>
            <td><span className="chip chip-intake">New intake</span></td>
          </tr>
          <tr>
            <td>
              <span className="t-cell-key" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="avatar">PS</span>Priya Sharma
              </span>
            </td>
            <td className="t-cell-muted">Active</td>
          </tr>
          <tr>
            <td>
              <span className="t-cell-key" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="avatar">AM</span>Arjun Mehta
              </span>
            </td>
            <td className="t-cell-muted">Active</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
  if (!chrome) return body
  return (
    <div className="frame">
      <div className="frame-bar"><i /><i /><i /><span>Patients</span></div>
      {body}
    </div>
  )
}

// Real markup: TodaySchedule.jsx — .stack-cards, .card.sched-card.rule-accent,
// .sched-left/.sched-right, .icon-badge, btn-primary "Join now".
function SchedulePanel({ chrome = true }) {
  const body = (
    <div className="frame-body">
      <div className="stack-cards">
        <div className="card sched-card rule-accent">
          <div className="sched-left">
            <span className="icon-badge"><Video size={16} strokeWidth={1.5} /></span>
            <div className="sched-text">
              <span className="t-h3">Priya Sharma</span>
              <span className="t-body-s">Therapy session &middot; Online</span>
            </div>
          </div>
          <div className="sched-right">
            <span className="t-num-key">10:00 AM</span>
            <button type="button" className="btn btn-primary btn-sm" tabIndex={-1}>
              <Video size={14} strokeWidth={2} /> Join now
            </button>
          </div>
        </div>
        <div className="card sched-card">
          <div className="sched-left">
            <span className="icon-badge"><Users size={16} strokeWidth={1.5} /></span>
            <div className="sched-text">
              <span className="t-h3">Arjun Mehta</span>
              <span className="t-body-s">Follow-up &middot; In person</span>
            </div>
          </div>
          <div className="sched-right">
            <span className="t-num">11:30 AM</span>
          </div>
        </div>
      </div>
    </div>
  )
  if (!chrome) return body
  return (
    <div className="frame">
      <div className="frame-bar"><i /><i /><i /><span>Today</span></div>
      {body}
    </div>
  )
}

// Disclosed marketing-only fork: no real product view renders MMPI-2 subscale
// results as bars (Results.jsx uses a plain scored table with ad hoc
// red/green Tailwind classes) — see design/marketing.css .wt-scale comment.
function AssessPanel({ chrome = true }) {
  const scales = [
    { name: 'Hypochondriasis', pct: 46, t: 52 },
    { name: 'Depression', pct: 58, t: 58 },
    { name: 'Social anxiety', pct: 78, t: 74, elevated: true },
    { name: 'Hysteria', pct: 44, t: 49 },
  ]
  const body = (
    <div className="frame-body">
      <div className="ci-card-head" style={{ marginBottom: 12 }}>
        <span className="icon-badge"><FileText size={15} strokeWidth={1.5} /></span>
        <span className="t-h3">MMPI-2</span>
      </div>
      {scales.map((s) => (
        <div className="wt-scale" key={s.name}>
          <span className="wt-scale-name">{s.name}</span>
          <span className="wt-scale-track">
            <span className={`wt-scale-fill${s.elevated ? ' is-elevated' : ''}`} style={{ width: `${s.pct}%` }} />
          </span>
          <span className={`wt-scale-t${s.elevated ? ' is-elevated' : ''}`}>{s.t}</span>
        </div>
      ))}
      <div className="t-caption" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
        One elevated subscale &middot; scored automatically
      </div>
    </div>
  )
  if (!chrome) return body
  return (
    <div className="frame">
      <div className="frame-bar"><i /><i /><i /><span>Assessment result</span></div>
      {body}
    </div>
  )
}

// Real markup: ClinicalIntelligenceTab.jsx — .card-narrative, .ci-card-head,
// .t-narrative.
function UnderstandPanel({ chrome = true }) {
  const body = (
    <div className="frame-body">
      <div className="card-narrative">
        <div className="ci-card-head">
          <span className="icon-badge"><Users size={15} strokeWidth={1.5} /></span>
          <span className="t-h3">Patient summary</span>
        </div>
        <p className="t-narrative">
          Reported reduced avoidance across the last three sessions. Grounding exercises are
          holding. Continue breathing work and review the anxiety subscales at the next assessment.
        </p>
        <div className="t-caption" style={{ marginTop: 14 }}>2 current diagnoses &middot; 10 active goals</div>
      </div>
    </div>
  )
  if (!chrome) return body
  return (
    <div className="frame">
      <div className="frame-bar"><i /><i /><i /><span>Clinical intelligence</span></div>
      {body}
    </div>
  )
}

// Real markup: PatientProfile.jsx / PaymentsList.jsx — .pay-row, .date-badge,
// .pay-main/.pay-foot, .pay-amount, .status-alert/.status-quiet, .bulk-bar.
function GetPaidPanel({ chrome = true }) {
  const body = (
    <div className="frame-body">
      <div className="section-head" style={{ marginBottom: 12 }}>
        <h3 className="t-h3">August 2026</h3>
        <span className="status-alert">&#8377;3,000 overdue</span>
      </div>
      <div className="table-wrap card-flush">
        <div className="pay-row">
          <input type="checkbox" className="checkbox" checked readOnly tabIndex={-1} />
          <div className="date-badge"><span className="date-badge-m">Aug</span><span className="date-badge-d">23</span></div>
          <div className="pay-main"><span className="t-body-s">Therapy session</span></div>
          <div className="pay-foot">
            <span className="pay-amount"><span className="cur">&#8377;</span>1,500</span>
            <span className="pay-status"><span className="status-quiet">Pending</span></span>
          </div>
        </div>
        <div className="pay-row rule-error">
          <input type="checkbox" className="checkbox" checked readOnly tabIndex={-1} />
          <div className="date-badge"><span className="date-badge-m">Aug</span><span className="date-badge-d">6</span></div>
          <div className="pay-main"><span className="t-body-s">Therapy session</span></div>
          <div className="pay-foot">
            <span className="pay-amount"><span className="cur">&#8377;</span>3,000</span>
            <span className="pay-status"><span className="status-alert">Overdue</span></span>
          </div>
        </div>
      </div>
      <div className="bulk-bar">
        <span className="bulk-count">2 selected</span>
        <span className="bulk-sum">&middot; &#8377;4,500</span>
        <div className="bulk-actions">
          <button type="button" className="btn btn-on-ink btn-sm" tabIndex={-1}>Generate combined invoice</button>
        </div>
      </div>
    </div>
  )
  if (!chrome) return body
  return (
    <div className="frame">
      <div className="frame-bar"><i /><i /><i /><span>Payments</span></div>
      {body}
    </div>
  )
}
