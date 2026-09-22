// "Notifications & security" — private to the practitioner, not shown on
// the public page. Ported from the old pages/Settings.jsx sections that
// used to live at the bottom of ProfileSettings.jsx (NotificationPreferencesCard
// / SecurityCard, built on shared SettingsSection/ToggleControl). Rebuilt
// here in Clinical Ink: ToggleControl isn't reused (it's shared and hard-
// wired to the old `bg-primary` purple — editing it for a new variant is
// out of this page's scope), replaced by the page-local Switch. The old
// green "current session" styling is gone — this file is in-scope, and
// the design system has no green.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  getNotificationPreferences, updateNotificationPreferences,
  getActiveSessions, terminateSession, logoutAllSessions, deleteMyAccount,
} from '../../api/client'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import Switch from './Switch'

const NOTIF_ROWS = [
  { label: 'New booking request', desc: 'When a patient books an appointment', email: 'email_new_booking', inapp: 'inapp_new_booking' },
  { label: 'Booking cancelled', desc: 'When a patient cancels their appointment', email: 'email_booking_cancelled', inapp: 'inapp_booking_cancelled' },
  { label: 'Booking rescheduled', desc: 'When an appointment is rescheduled', email: 'email_booking_rescheduled', inapp: 'inapp_booking_rescheduled' },
  { label: 'Payment received', desc: 'When a patient completes payment', email: 'email_payment_received', inapp: 'inapp_payment_received' },
  { label: 'Daily summary', desc: 'A daily summary of your schedule', email: 'email_daily_summary', inapp: null },
  { label: 'Upcoming appointment reminders', desc: null, email: null, inapp: 'inapp_reminder_upcoming' },
]

function NotificationsCard() {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch((err) => console.error('Failed to load preferences:', err))
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(field, value) {
    setPrefs((prev) => ({ ...prev, [field]: value }))
    setSaving(true)
    try {
      await updateNotificationPreferences({ [field]: value })
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}><Loader2 className="animate-spin" size={20} color="var(--icon-muted)" /></div>
  }
  if (!prefs) return null

  return (
    <div className="card">
      <p className="t-h3" style={{ marginBottom: '2px' }}>Notifications</p>
      <p className="t-body-s" style={{ marginBottom: 'var(--space-5)' }}>Choose how you want to be notified.</p>

      <div className="tn-notif-grid tn-notif-grid-head" style={{ marginBottom: 'var(--space-2)' }}>
        <span />
        <span className="t-caption tn-notif-col-label">Email</span>
        <span className="t-caption tn-notif-col-label">In-app</span>
      </div>
      {NOTIF_ROWS.map((row) => (
        <div key={row.label} className="tn-notif-grid" style={{ padding: '10px 0', borderTop: '1px solid var(--hairline)' }}>
          <div>
            <p className="t-body-s" style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 500 }}>{row.label}</p>
            {row.desc && <p className="t-caption tn-notif-desc" style={{ margin: '2px 0 0' }}>{row.desc}</p>}
          </div>
          <div className="tn-notif-col-label">
            {row.email ? (
              <Switch id={`notif-${row.email}`} checked={prefs[row.email]} onChange={(v) => handleChange(row.email, v)} />
            ) : <span className="t-caption">—</span>}
          </div>
          <div className="tn-notif-col-label">
            {row.inapp ? (
              <Switch id={`notif-${row.inapp}`} checked={prefs[row.inapp]} onChange={(v) => handleChange(row.inapp, v)} />
            ) : <span className="t-caption">—</span>}
          </div>
        </div>
      ))}

      {saving && (
        <p className="t-caption" style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 className="animate-spin" size={12} /> Saving…
        </p>
      )}
    </div>
  )
}

function SecurityCards() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    try {
      const data = await getActiveSessions()
      setSessions(data.sessions)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleTerminate(sessionId) {
    if (!confirm('Are you sure you want to terminate this session?')) return
    try { await terminateSession(sessionId); loadSessions() } catch (err) { console.error('Failed to terminate session:', err) }
  }

  async function handleLogoutAll() {
    if (!confirm('Are you sure you want to log out of all other sessions?')) return
    try { await logoutAllSessions(); loadSessions() } catch (err) { console.error('Failed to logout sessions:', err) }
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteMyAccount()
      localStorage.removeItem('mmpi_token')
      localStorage.removeItem('mmpi_role')
      localStorage.removeItem('mmpi_prac_name')
      localStorage.removeItem('mmpi_must_change_password')
      localStorage.removeItem('mmpi_profile_setup_complete')
      window.location.href = '/login?account_deleted=true'
    } catch (err) {
      setDeleteError(err.userMessage || err.response?.data?.detail || 'Failed to delete account')
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="tn-account-card">
        <p className="t-h4" style={{ margin: '0 0 4px' }}>Password</p>
        <p className="t-body-s" style={{ margin: '0 0 var(--space-3)' }}>Update your account password.</p>
        <a href="/change-password" className="btn btn-secondary">Change password</a>
      </div>

      <div className="tn-account-card">
        <div className="field-head" style={{ marginBottom: 'var(--space-3)' }}>
          <div>
            <p className="t-h4" style={{ margin: '0 0 4px' }}>Signed-in devices</p>
            <p className="t-body-s" style={{ margin: 0 }}>
              {sessions.length <= 1 ? 'Only this device is signed in right now.' : 'Manage where you\'re signed in.'}
            </p>
          </div>
          {sessions.length > 1 && (
            <button type="button" className="link" onClick={handleLogoutAll}>Log out all other devices</button>
          )}
        </div>
        {loading ? (
          <Loader2 className="animate-spin" size={16} color="var(--icon-muted)" />
        ) : (
          <div>
            {sessions.map((session) => (
              <div key={session.id} className={`tn-session-row${session.is_current ? ' is-current' : ''}`}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="t-body-s" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{session.device_info || 'Unknown device'}</span>
                    {session.is_current && <span className="tn-session-badge">Current</span>}
                  </div>
                  <p className="t-caption" style={{ margin: '2px 0 0' }}>
                    {session.ip_address && `${session.ip_address} · `}
                    Last active: {new Date(session.last_active_at).toLocaleString()}
                  </p>
                </div>
                {!session.is_current && (
                  <button type="button" className="link" onClick={() => handleTerminate(session.id)}>Log out</button>
                )}
              </div>
            ))}
            {sessions.length === 0 && <p className="t-body-s" style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>No active sessions</p>}
          </div>
        )}
      </div>

      <div className="tn-account-card">
        <p className="t-h4" style={{ margin: '0 0 4px' }}>Delete account</p>
        {deleteError && <div className="alert alert-error" style={{ marginBottom: 'var(--space-3)' }}>{deleteError}</div>}
        <p className="t-body-s" style={{ margin: '0 0 var(--space-3)' }}>
          You'll be logged out immediately and this account can't be used to sign in again. Your patients
          and session records aren't deleted — they stay part of the practice and remain accessible to your
          practice administrator. If you'd like to come back, you can sign up again later with this same
          email. This can't be undone.
        </p>
        <button type="button" className="tn-danger-link" onClick={() => setShowDeleteConfirm(true)}>Delete my account</button>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => !deleting && setShowDeleteConfirm(false)}
        onConfirm={handleDeleteAccount}
        title="Delete your account?"
        message="You'll be logged out immediately and this account can't be used to sign in again. Your patients and session records stay with the practice, and you can sign up again later with this same email if you come back. This can't be undone."
        confirmLabel="Delete account"
        variant="danger"
        isLoading={deleting}
      />
    </>
  )
}

export default function AccountPrivacySection() {
  return (
    <div className="tn-field-group">
      <NotificationsCard />
      <div className="tn-field-group">
        <SecurityCards />
      </div>
    </div>
  )
}
