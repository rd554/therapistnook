import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import {
  getAvailability, getEmailConfig, getWhatsAppConfig, getPaymentGatewayConfig,
  getCalendarIntegration, getSecuritySettings,
} from '../../api/client'
import { SettingsGuardProvider, useSettingsGuardRef, confirmDiscardNavigation } from './SettingsGuardContext'
import { schedulingStatus, messagingStatus, paymentsStatus, integrationsStatus, securityStatus } from './navStatus'

// Every old /settings?section=X URL that has a home in the new 5-section
// structure, per spec: "Redirect every old /settings/* route to its new home
// (appointments and availability -> scheduling; email, whatsapp and
// notifications -> messaging; payment -> payments)." Extended past the
// spec's own list to cover every id the old Settings.jsx nav actually used
// (calendar, security), so Phase 3's "visit each old /settings/* URL — it
// redirects" holds for all of them, not just the five named in the prompt.
//
// notifications/security are owner-only destinations in the new shell; a
// non-owner hitting either old id is sent to /profile-settings instead (see
// OWNER_ONLY_TO_ACCOUNT below) — that's where NotificationPreferencesSection/
// PractitionerSecuritySection now live, under "Your account".
const OLD_SECTION_REDIRECTS = {
  appointments: 'scheduling',
  availability: 'scheduling',
  integrations: 'integrations',
  calendar: 'integrations',
  payment: 'payments',
  email: 'messaging',
  whatsapp: 'messaging',
  notifications: 'messaging',
  security: 'security',
}

// Old ids whose non-owner destination isn't a Settings section at all — the
// practitioner's own personal controls, moved to /profile-settings.
const OWNER_ONLY_TO_ACCOUNT = new Set(['notifications', 'security'])

const ALL_SECTIONS = [
  { id: 'scheduling', name: 'Scheduling', ownerOnly: false },
  { id: 'messaging', name: 'Messaging', ownerOnly: true },
  { id: 'payments', name: 'Payments', ownerOnly: true },
  { id: 'integrations', name: 'Integrations', ownerOnly: false },
  { id: 'security', name: 'Security', ownerOnly: true },
]

function useIsDesktop(breakpoint = 1024) {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(`(min-width: ${breakpoint}px)`).matches)
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const handler = (e) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [breakpoint])
  return isDesktop
}

export default function SettingsShell({ auth }) {
  return (
    <SettingsGuardProvider>
      <SettingsShellInner auth={auth} />
    </SettingsGuardProvider>
  )
}

function SettingsShellInner({ auth }) {
  const isOwner = auth?.role === 'owner'
  const sections = ALL_SECTIONS.filter((s) => isOwner || !s.ownerOnly)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const isDesktop = useIsDesktop()
  const guardRef = useSettingsGuardRef()

  const [statuses, setStatuses] = useState({})
  const [statusLoading, setStatusLoading] = useState(true)

  const loadStatuses = useCallback(async () => {
    const results = {}
    const fetches = [
      getAvailability().then((d) => { results.scheduling = schedulingStatus(d) }).catch(() => { results.scheduling = '' }),
      getCalendarIntegration().then((d) => { results.integrations = integrationsStatus(d) }).catch(() => { results.integrations = '' }),
    ]
    if (isOwner) {
      fetches.push(
        Promise.all([getEmailConfig().catch(() => null), getWhatsAppConfig().catch(() => null)])
          .then(([email, whatsapp]) => { results.messaging = messagingStatus({ email, whatsapp }) }),
        getPaymentGatewayConfig().then((d) => { results.payments = paymentsStatus(d) }).catch(() => { results.payments = '' }),
        getSecuritySettings().then((d) => { results.security = securityStatus(d) }).catch(() => { results.security = '' }),
      )
    }
    await Promise.all(fetches)
    setStatuses(results)
    setStatusLoading(false)
  }, [isOwner])

  useEffect(() => { loadStatuses() }, [loadStatuses])

  // Old ?section=X deep links land on their new route the moment someone
  // opens them. A non-owner following an owner-only old link (notifications,
  // security) has no Settings section to land on any more — their personal
  // version of that page moved to /profile-settings instead.
  const oldSection = searchParams.get('section')
  const isIndexRoute = location.pathname === '/settings' || location.pathname === '/settings/'
  if (isIndexRoute && oldSection) {
    if (!isOwner && OWNER_ONLY_TO_ACCOUNT.has(oldSection)) {
      return <Navigate to="/profile-settings" replace />
    }
    const target = OLD_SECTION_REDIRECTS[oldSection]
    if (target && sections.some((s) => s.id === target)) {
      return <Navigate to={`/settings/${target}`} replace />
    }
  }

  // Desktop bare `/settings`: land on the first permitted section instead of
  // showing an empty main column (the mobile .settings-list below covers the
  // <1024px case for the same bare route).
  if (isIndexRoute && isDesktop && sections.length > 0) {
    return <Navigate to={`/settings/${sections[0].id}`} replace />
  }

  const handleNavClick = (e, targetId) => {
    const guard = guardRef?.current
    if (guard?.isDirty && !confirmDiscardNavigation(guard.changedLabels)) {
      e.preventDefault()
      return
    }
    // no preventDefault: the Link/anchor's own navigation proceeds
  }

  const activeId = sections.find((s) => location.pathname.startsWith(`/settings/${s.id}`))?.id

  return (
    // No .workspace-main here: the parent route already renders this inside
    // WorkspaceLayout's <main className="workspace-main"><Outlet/></main>
    // (App.jsx) — adding another one doubles that padding. Same convention
    // as PatientEdit.jsx: just .clinical-ink (+ the 1120px cap it documents).
    <div className="clinical-ink max-w-[1120px]">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="t-h1">Settings</h1>
        <p className="t-caption" style={{ marginTop: '4px' }}>Changes apply to your whole practice.</p>
      </div>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((s) => (
            <Link
              key={s.id}
              to={`/settings/${s.id}`}
              className="settings-nav-item"
              aria-current={activeId === s.id ? 'page' : undefined}
              onClick={(e) => handleNavClick(e, s.id)}
            >
              <span className="settings-nav-name">{s.name}</span>
              <span className="settings-nav-status">
                {statusLoading ? '…' : (statuses[s.id] || '')}
              </span>
            </Link>
            ))}
          </nav>

          <div className="settings-main">
            {isIndexRoute ? (
              <ul className="settings-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {sections.map((s) => (
                  <li key={s.id}>
                    <Link to={`/settings/${s.id}`}>
                      <span>
                        <span className="settings-nav-name">{s.name}</span>
                        <span className="settings-nav-status">
                          {statusLoading ? '…' : (statuses[s.id] || '')}
                        </span>
                      </span>
                      <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <Link
                  to="/settings"
                  className="settings-back"
                  onClick={(e) => handleNavClick(e, null)}
                >
                  <ChevronRight size={16} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} aria-hidden="true" />
                  Settings
                </Link>
                <Outlet context={{ refreshNavStatus: loadStatuses }} />
              </>
            )}
          </div>
        </div>
      </div>
  )
}
