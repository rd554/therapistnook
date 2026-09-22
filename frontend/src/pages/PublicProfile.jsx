import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, Mail, Phone, MapPin, Instagram, FileText } from 'lucide-react'
import {
  getPublicProfile, getPublicOnboarding, getPublicResources, getPublicBookingSlots,
} from '../api/client'
import BookingSheet from '../components/BookingSheet'
import Modal from '../components/ui/Modal'
import { CRISIS_RESOURCES } from '../constants/crisisResources'

// Sentence case everywhere per the design spec — these replace the old
// Title Case maps that lived in this file.
const SPECIALIZATION_LABELS = {
  anxiety: 'Anxiety',
  depression: 'Depression',
  trauma_ptsd: 'Trauma & PTSD',
  relationship_issues: 'Relationship issues',
  grief_loss: 'Grief & loss',
  stress_management: 'Stress management',
  self_esteem: 'Self-esteem',
  anger_management: 'Anger management',
  ocd: 'OCD',
  addiction: 'Addiction',
  eating_disorders: 'Eating disorders',
  bipolar_disorder: 'Bipolar disorder',
  personality_disorders: 'Personality disorders',
  schizophrenia: 'Schizophrenia',
  child_adolescent: 'Child & adolescent',
  couples_therapy: 'Couples therapy',
  family_therapy: 'Family therapy',
  lgbtq: 'LGBTQ+',
  life_transitions: 'Life transitions',
  career_counseling: 'Career counseling',
  chronic_illness: 'Chronic illness',
  sleep_disorders: 'Sleep disorders',
  other: 'Other',
}

// Short forms for the About section — "Therapy" dropped, acronyms bare,
// per spec item 108 ("Psychodynamic", "Mindfulness-based", "CBT"...).
const APPROACH_CHIP_LABELS = {
  cognitive_behavioral: 'CBT',
  psychodynamic: 'Psychodynamic',
  humanistic: 'Humanistic',
  integrative: 'Integrative',
  mindfulness_based: 'Mindfulness-based',
  dialectical_behavior: 'DBT',
  solution_focused: 'Solution-focused',
  narrative: 'Narrative',
  family_systems: 'Family systems',
  trauma_informed: 'Trauma-informed',
  acceptance_commitment: 'ACT',
  interpersonal: 'Interpersonal',
  gestalt: 'Gestalt',
  emdr: 'EMDR',
  art_therapy: 'Art',
  play_therapy: 'Play',
  other: 'Other',
}

const RESOURCE_TYPE_LABELS = {
  consent_form: 'Consent form',
  therapy_guidelines: 'Therapy guidelines',
  cancellation_policy: 'Cancellation policy',
  privacy_policy: 'Privacy policy',
  faq: 'FAQ',
  emergency_info: 'Emergency information',
  welcome_packet: 'Welcome packet',
  intake_instructions: 'Intake instructions',
  other: 'Other',
}

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return null
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100)
}

function formatSlotTime(iso) {
  const s = new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  return s.replace('AM', 'am').replace('PM', 'pm')
}

function formatSlotLabel(dateStr, iso) {
  const d = new Date(`${dateStr}T00:00:00`)
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' })
  return `${weekday} ${d.getDate()} · ${formatSlotTime(iso)}`
}

// Approximates "Monday to Friday, 9:00 AM – 6:00 PM" from the 14-day slot
// window the booking endpoint returns. There's no endpoint that exposes the
// underlying PractitionerAvailability weekly rule directly to the public
// profile, so this is a best-effort summary of what's actually open in the
// next two weeks rather than a literal readback of Scheduling settings.
function buildHoursLine(days) {
  const withSlots = (days || []).filter((d) => d.is_available && d.slots.length > 0)
  if (withSlots.length === 0) return null
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const present = new Set(withSlots.map((d) => new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })))
  const sorted = order.filter((w) => present.has(w))
  const dayRange = sorted.length > 1 ? `${sorted[0]} to ${sorted[sorted.length - 1]}` : sorted[0]

  let minMinutes = null
  let maxMinutes = null
  withSlots.forEach((d) => d.slots.forEach((s) => {
    const start = new Date(s.start)
    const end = new Date(s.end)
    const startMin = start.getHours() * 60 + start.getMinutes()
    const endMin = end.getHours() * 60 + end.getMinutes()
    if (minMinutes === null || startMin < minMinutes) minMinutes = startMin
    if (maxMinutes === null || endMin > maxMinutes) maxMinutes = endMin
  }))
  const fmt = (mins) => {
    const d = new Date()
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
    return formatSlotTime(d.toISOString())
  }
  return `${dayRange}, ${fmt(minMinutes)} – ${fmt(maxMinutes)}.`
}

function setMetaTag(selector, attrs) {
  let el = document.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    Object.entries(attrs).forEach(([k, v]) => { if (k !== 'content') el.setAttribute(k, v) })
    document.head.appendChild(el)
  }
  if (attrs.content) el.setAttribute('content', attrs.content)
}

function AccordionItem({ id, title, open, onToggle, children }) {
  return (
    <div>
      <button type="button" className="pp-acc" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {title}
        <ChevronDown size={16} strokeWidth={1.5} />
      </button>
      <div className="pp-acc-panel" id={id} hidden={!open}>
        {children}
      </div>
    </div>
  )
}

export default function PublicProfile() {
  const { slug } = useParams()
  const [profile, setProfile] = useState(null)
  const [onboarding, setOnboarding] = useState(null)
  const [resources, setResources] = useState([])
  const [slotsData, setSlotsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [sheetState, setSheetState] = useState(null) // null | { date, slot } | {}
  const [readResource, setReadResource] = useState(null)
  const [openPanels, setOpenPanels] = useState({ before: true, faq: null })
  const [stickyVisible, setStickyVisible] = useState(false)

  const mainRef = useRef(null)
  const bookButtonRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [profileData, onboardingData, resourcesData, slots] = await Promise.all([
          getPublicProfile(slug),
          getPublicOnboarding(slug).catch(() => null),
          getPublicResources(slug).catch(() => []),
          getPublicBookingSlots(slug, null, 14).catch(() => null),
        ])
        if (cancelled) return
        setProfile(profileData)
        setOnboarding(onboardingData)
        setResources(resourcesData || [])
        setSlotsData(slots)
      } catch (err) {
        if (cancelled) return
        setError(err.response?.status === 404 ? 'Profile not found' : 'Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [slug])

  // Best-effort client-side <title>/meta updates. This is NOT server-side
  // rendering — the spec asks for name/tagline/booking button to be in the
  // first HTML response for Instagram's in-app browser, which this Vite SPA
  // (Vercel frontend, no prerender/SSR tooling) cannot do. Real crawlers and
  // link-unfurlers will still see the static index.html defaults. Flagging
  // this prominently rather than silently only fixing it for human visitors.
  useEffect(() => {
    if (!profile) return
    const displayTitle = [profile.title, profile.display_name].filter(Boolean).join(' ')
    const profession = profile.profession || 'Clinical psychologist'
    document.title = displayTitle ? `${displayTitle} — ${profession}` : 'Therapist Nook'
    setMetaTag('meta[name="description"]', { name: 'description', content: profile.tagline || '' })
    setMetaTag('meta[property="og:title"]', { property: 'og:title', content: document.title })
    setMetaTag('meta[property="og:description"]', { property: 'og:description', content: profile.tagline || '' })
    setMetaTag('meta[property="og:type"]', { property: 'og:type', content: 'profile' })
    setMetaTag('meta[property="og:url"]', { property: 'og:url', content: window.location.href })
    // No server-side initials-image generator exists yet, so we only set
    // og:image when a real photo is uploaded — never the old gradient, and
    // never a broken URL.
    if (profile.profile_photo_url) {
      setMetaTag('meta[property="og:image"]', { property: 'og:image', content: profile.profile_photo_url })
    }
  }, [profile])

  // /p/:slug/onboarding now redirects to /p/:slug#before-your-first-session.
  // The accordion is already open by default, but a client-rendered page
  // won't get the browser's native hash scroll on first paint, so do it
  // ourselves once the section exists.
  useEffect(() => {
    if (!loading && window.location.hash === '#before-your-first-session') {
      document.getElementById('before-your-first-session')?.scrollIntoView({ block: 'start' })
    }
  }, [loading])

  useEffect(() => {
    const button = bookButtonRef.current
    if (!button) return undefined
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting), { threshold: 0 })
    observer.observe(button)
    return () => observer.disconnect()
  }, [profile])

  // Page behind the sheet is inert while it's open — set via ref rather
  // than the `inert` JSX prop, which React 18 doesn't recognise as boolean.
  useEffect(() => {
    mainRef.current?.toggleAttribute('inert', !!sheetState)
  }, [sheetState])

  const openSheet = useCallback((date, slot) => setSheetState({ date, slot }), [])
  const closeSheet = useCallback(() => setSheetState(null), [])

  if (loading) {
    return <div className="clinical-ink"><div className="pp-page"><p className="t-caption">Loading…</p></div></div>
  }
  if (error || !profile) {
    return (
      <div className="clinical-ink">
        <div className="pp-page">
          <p className="t-h3">{error || 'Profile not found'}</p>
        </div>
      </div>
    )
  }

  const profession = profile.profession || 'Clinical psychologist'
  const initials = (profile.display_name || '?')
    .trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const cityShort = profile.location_short ? profile.location_short.split(',').pop().trim() : null
  const roleLine = [profession, cityShort].filter(Boolean).join(' · ')
  const metaLine = [
    profession,
    profile.years_of_experience ? `${profile.years_of_experience} years' practice` : null,
    profile.languages?.length ? profile.languages.map((l) => l.language).join(', ') : null,
    profile.location_short || null,
    profile.license_number || null,
  ].filter(Boolean).join(' · ')

  const days = (slotsData?.days || []).filter((d) => d.is_available && d.slots.length > 0)
  const flatSlots = []
  days.forEach((d) => d.slots.forEach((s) => flatSlots.push({ ...s, date: d.date })))
  const nextThree = flatSlots.slice(0, 3)
  const hoursLine = buildHoursLine(slotsData?.days)
  const practitionerName = [profile.title, profile.display_name].filter(Boolean).join(' ') || profile.slug

  const approachChips = (profile.therapy_approaches || []).map((a) => APPROACH_CHIP_LABELS[a] || a)

  const hasQualifications = !!(
    profile.qualifications?.length || profile.certifications?.length ||
    profile.license_number || profile.professional_memberships?.length
  )
  const beforeItems = [
    onboarding?.what_to_expect && { key: 'what', title: 'What to expect', body: onboarding.what_to_expect },
    onboarding?.how_therapy_works && { key: 'how', title: 'How therapy works', body: onboarding.how_therapy_works },
    onboarding?.preparation_guidelines && { key: 'prep', title: 'How to prepare', body: onboarding.preparation_guidelines },
    onboarding?.consent_info && { key: 'consent', title: 'Consent & confidentiality', body: onboarding.consent_info },
  ].filter(Boolean)
  const faqItems = onboarding?.faq_content || []
  const hasContact = !!(profile.public_email || profile.public_phone || profile.clinic_address || profile.instagram_handle || profile.website_url)
  const instagramHandle = profile.instagram_handle
    ?.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/$/, '')

  return (
    <div className="clinical-ink">
      <div className="pp-page" ref={mainRef}>
        <header className="pp-header">
          {profile.profile_photo_url ? (
            <img className="pp-avatar" src={profile.profile_photo_url} alt={profile.display_name} />
          ) : (
            <div className="pp-avatar pp-avatar-initials" aria-hidden="true">{initials}</div>
          )}
          <div className="pp-header-text">
            <h1 className="pp-name">{[profile.title, profile.display_name].filter(Boolean).join(' ')}</h1>
            <p className="pp-role">{roleLine}</p>
            {profile.tagline && <p className="pp-tagline">{profile.tagline}</p>}
            {metaLine && <p className="pp-meta">{metaLine}</p>}
          </div>
        </header>

        {(profile.tagline || metaLine) && (
          <div className="pp-header-below">
            {profile.tagline && <p className="pp-tagline">{profile.tagline}</p>}
            {metaLine && <p className="pp-meta">{metaLine}</p>}
          </div>
        )}

        <div className="pp-layout">
          <main className="pp-main">
            {profile.specializations?.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-section-title">What I help with</h2>
                <ul className="pp-chips">
                  {profile.specializations.map((s) => (
                    <li key={s} className="pp-chip">{SPECIALIZATION_LABELS[s] || s}</li>
                  ))}
                </ul>
              </section>
            )}

            {(profile.bio || approachChips.length > 0) && (
              <section className="pp-section">
                <h2 className="pp-section-title">About</h2>
                {profile.bio && <p className="pp-body" style={{ whiteSpace: 'pre-wrap' }}>{profile.bio}</p>}
                {approachChips.length > 0 && (
                  <ul className="pp-chips">
                    {approachChips.map((label, i) => <li key={i} className="pp-chip">{label}</li>)}
                  </ul>
                )}
              </section>
            )}

            {hasQualifications && (
              <section className="pp-section">
                <h2 className="pp-section-title">Qualifications</h2>
                <ul className="pp-quals">
                  {profile.qualifications?.map((q, i) => (
                    <li key={`q${i}`}>
                      <strong>{q.degree}</strong>
                      <span>{[q.institution, q.year].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                  {profile.certifications?.map((c, i) => (
                    <li key={`c${i}`}>
                      <strong>{c.name}</strong>
                      <span>{[c.issuer, c.year].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                  {profile.license_number && (
                    <li>
                      <strong>Registered — RCI</strong>
                      <span>{profile.license_number}</span>
                    </li>
                  )}
                  {profile.professional_memberships?.map((m, i) => (
                    <li key={`m${i}`}>
                      <strong>{m.organization}</strong>
                      {m.membership_id && <span>{m.membership_id}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {beforeItems.length > 0 && (
              <section className="pp-section" id="before-your-first-session">
                <h2 className="pp-section-title">Before your first session</h2>
                <div className="pp-acc-group">
                  {beforeItems.map((item, i) => (
                    <AccordionItem
                      key={item.key}
                      id={`before-${item.key}`}
                      title={item.title}
                      open={openPanels.before === true ? i === 0 : openPanels.before === item.key}
                      onToggle={() => setOpenPanels((p) => ({ ...p, before: (p.before === item.key || (p.before === true && i === 0)) ? null : item.key }))}
                    >
                      <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>
                    </AccordionItem>
                  ))}
                </div>
              </section>
            )}

            {faqItems.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-section-title">Common questions</h2>
                <div className="pp-acc-group">
                  {faqItems.map((item, i) => (
                    <AccordionItem
                      key={i}
                      id={`faq-${i}`}
                      title={item.question}
                      open={openPanels.faq === i}
                      onToggle={() => setOpenPanels((p) => ({ ...p, faq: p.faq === i ? null : i }))}
                    >
                      <p style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</p>
                    </AccordionItem>
                  ))}
                </div>
              </section>
            )}

            {resources.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-section-title">Documents</h2>
                <ul className="pp-quals">
                  {resources.map((r) => (
                    <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={16} strokeWidth={1.5} />
                          {r.title}
                        </strong>
                        <span>{RESOURCE_TYPE_LABELS[r.resource_type] || r.resource_type}</span>
                      </div>
                      {r.file_url ? (
                        <a className="link" href={r.file_url} target="_blank" rel="noopener noreferrer">View</a>
                      ) : r.content ? (
                        <button type="button" className="link" onClick={() => setReadResource(r)}>Read</button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasContact && (
              <section className="pp-section">
                <h2 className="pp-section-title">Contact</h2>
                <ul className="pp-contact">
                  {profile.public_email && (
                    <li><Mail size={18} strokeWidth={1.5} /><a href={`mailto:${profile.public_email}`}>{profile.public_email}</a></li>
                  )}
                  {profile.public_phone && (
                    <li><Phone size={18} strokeWidth={1.5} /><a href={`tel:${profile.public_phone}`}>{profile.public_phone}</a></li>
                  )}
                  {profile.clinic_address && (
                    <li>
                      <MapPin size={18} strokeWidth={1.5} />
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(profile.clinic_address)}`} target="_blank" rel="noopener noreferrer">
                        {profile.clinic_address}
                      </a>
                    </li>
                  )}
                  {instagramHandle && (
                    <li>
                      <Instagram size={18} strokeWidth={1.5} />
                      <a href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noopener noreferrer">@{instagramHandle}</a>
                    </li>
                  )}
                </ul>
              </section>
            )}
          </main>

          <aside className="pp-rail">
            <div className="pp-book">
              {profile.consultation_fee != null && (
                <div className="pp-fee">
                  <span className="pp-fee-amount">{formatCurrency(profile.consultation_fee, profile.consultation_fee_currency)}</span>
                  <span className="pp-fee-unit">
                    {slotsData?.session_types?.[0]?.duration_minutes ? `per ${slotsData.session_types[0].duration_minutes}-minute session` : 'per session'}
                  </span>
                </div>
              )}
              {profile.fee_notes && <p className="pp-fee-note">{profile.fee_notes}</p>}
              <p className="pp-fee-note">Your first session is a free introductory call, just to see if it's a good fit — nothing is charged when you book.</p>

              <button type="button" ref={bookButtonRef} className="btn btn-primary" onClick={() => openSheet(null, null)}>
                Book a first session
              </button>

              <hr className="pp-book-divider" />

              {nextThree.length > 0 ? (
                <>
                  <p className="pp-slots-title">Next available</p>
                  <div className="pp-slots">
                    {nextThree.map((slot, i) => (
                      <button key={i} type="button" className="pp-slot" onClick={() => openSheet(slot.date, slot)}>
                        {formatSlotLabel(slot.date, slot.start)}
                      </button>
                    ))}
                  </div>
                  {hoursLine && <p className="pp-hours">{hoursLine}</p>}
                </>
              ) : (
                <p className="pp-hours">No open times in the next month.</p>
              )}
            </div>

            <div className="pp-crisis">
              <p className="pp-crisis-title">If you need help now</p>
              <p>Therapy appointments aren't emergencies.</p>
              <ul>
                {CRISIS_RESOURCES.map((r) => (
                  <li key={r.label}>{r.label}: <a href={`tel:${r.tel}`}>{r.number}</a></li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <p className="pp-footer">
          Profile hosted on <a href="https://therapistnook.com" rel="noopener noreferrer">Therapist Nook</a>.
        </p>
      </div>

      {!sheetState && (
        <div className={`pp-stickybar${stickyVisible ? ' is-visible' : ''}`} aria-hidden={!stickyVisible} inert={!stickyVisible ? '' : undefined}>
          {profile.consultation_fee != null && (
            <div className="pp-stickybar-fee">
              <strong>{formatCurrency(profile.consultation_fee, profile.consultation_fee_currency)}</strong>
              <span>per session</span>
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={() => openSheet(null, null)}>Book a first session</button>
        </div>
      )}

      {sheetState && (
        <BookingSheet
          slug={slug}
          practitionerName={practitionerName}
          initialDate={sheetState.date}
          initialSlot={sheetState.slot}
          onClose={closeSheet}
        />
      )}

      <Modal open={!!readResource} onClose={() => setReadResource(null)} title={readResource?.title}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{readResource?.content}</p>
      </Modal>
    </div>
  )
}
