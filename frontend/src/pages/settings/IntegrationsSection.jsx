import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import {
  getCalendarIntegration, updateCalendarIntegration, getGoogleAuthUrl,
  disconnectGoogleCalendar, syncCalendar,
} from '../../api/client'
import { useDirtyForm } from '../../hooks/useDirtyForm'
import { useRegisterSettingsGuard } from './SettingsGuardContext'

const FIELD_LABELS = { google_sync_direction: 'sync direction' }

function toFormShape(integration) {
  return { google_sync_direction: integration.google_sync_direction || 'two_way' }
}

// Per-practitioner (not owner-only) — every practitioner connects their own
// calendar. Spec lists only Connect/Disconnect as the settings-row control;
// "Sync now" and the sync-direction select are existing functionality kept
// as secondary controls (flagged as a deviation in the check-in report), not
// a spec requirement.
//
// Google Meet links are created via the Calendar API (there's no separate
// "Meet API"), so the same Google OAuth connection powers both the Calendar
// row and the Meet row below — connecting or disconnecting either one
// connects/disconnects both, same as in the pre-rebuild Settings.jsx.
export default function IntegrationsSection() {
  const { refreshNavStatus } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [integration, setIntegration] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { form, setField, isDirty, changedKeys, changedLabels, discard, commit } = useDirtyForm({}, FIELD_LABELS)

  const load = async () => {
    try {
      const data = await getCalendarIntegration()
      setIntegration(data)
      commit(toFormShape(data))
    } catch (err) {
      setServerError(err.userMessage || 'Failed to load integrations.')
    } finally {
      setLoading(false)
    }
  }

  // Raw refresh only — no commit(). Used after actions that don't invalidate
  // a pending sync-direction edit (i.e. "Sync now"), so it can't silently
  // discard unsaved form state the way load() would.
  const refreshIntegration = async () => {
    try {
      const data = await getCalendarIntegration()
      setIntegration(data)
    } catch (err) {
      setServerError(err.userMessage || 'Failed to refresh integration status.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useRegisterSettingsGuard(isDirty, changedLabels)

  const handleConnect = async () => {
    setServerError('')
    setConnecting(true)
    try {
      const redirectUri = `${window.location.origin}/settings/google-callback`
      const { auth_url } = await getGoogleAuthUrl(redirectUri)
      window.location.href = auth_url
    } catch (err) {
      setConnecting(false)
      setServerError(err.userMessage || 'Failed to start Google connection.')
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar?')) return
    setServerError('')
    try {
      await disconnectGoogleCalendar()
      await load()
      await refreshNavStatus()
    } catch (err) {
      setServerError(err.userMessage || 'Failed to disconnect Google Calendar.')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setServerError('')
    try {
      await syncCalendar()
      // Connection stays connected and sync_direction is still meaningful —
      // refresh the display-only fields (last-sync time, sync error) without
      // touching the dirty form, so an unsaved sync-direction edit survives.
      await refreshIntegration()
    } catch (err) {
      setServerError(err.userMessage || 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setServerError('')
    try {
      const payload = {}
      for (const k of changedKeys) payload[k] = form[k]
      const saved = await updateCalendarIntegration(payload)
      setIntegration(saved)
      commit(toFormShape(saved))
      await refreshNavStatus()
    } catch (err) {
      setServerError(err.userMessage || 'Failed to save integration settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card settings-section"><p className="t-caption">Loading…</p></div>
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {serverError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="card settings-section">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <li className="settings-row">
            <div>
              <p className="settings-section-title settings-row-title">Google Calendar</p>
              <p className="settings-row-desc">
                {integration.google_connected
                  ? `Connected as ${integration.google_calendar_id || 'your Google account'}`
                  : 'Not connected'}
                {integration.google_sync_error && ` — ${integration.google_sync_error}`}
              </p>
            </div>
            <div className="settings-row-control">
              {integration.google_connected && (
                <button type="button" className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={integration.google_connected ? handleDisconnect : handleConnect}
                disabled={connecting}
              >
                {integration.google_connected ? 'Disconnect' : (connecting ? 'Connecting…' : 'Connect')}
              </button>
            </div>
          </li>

          {integration.google_connected && (
            <li>
              <div className="field-head"><label htmlFor="google_sync_direction">Sync direction</label></div>
              <select
                id="google_sync_direction"
                className="select"
                style={{ maxWidth: 300 }}
                value={form.google_sync_direction}
                onChange={(e) => setField('google_sync_direction', e.target.value)}
              >
                <option value="two_way">Two-way sync</option>
                <option value="one_way_to_google">Only push to Google</option>
                <option value="one_way_from_google">Only pull from Google</option>
              </select>
            </li>
          )}
        </ul>

        <p className="t-caption">Outlook and Apple Calendar are coming later.</p>
      </div>

      <div className="card settings-section" style={{ marginTop: 'var(--space-4)' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li className="settings-row">
            <div>
              <p className="settings-section-title settings-row-title">Google Meet</p>
              <p className="settings-row-desc">
                {integration.google_connected
                  ? 'Connected — Meet links are added automatically to online appointments.'
                  : 'Automatically create Google Meet links for online appointments. Uses the same connection as Google Calendar.'}
              </p>
            </div>
            <div className="settings-row-control">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={integration.google_connected ? handleDisconnect : handleConnect}
                disabled={connecting}
              >
                {integration.google_connected ? 'Disconnect' : (connecting ? 'Connecting…' : 'Connect')}
              </button>
            </div>
          </li>
        </ul>

        <p className="t-caption">Zoom and Microsoft Teams are coming later.</p>
      </div>

      {isDirty && (
        <div className="form-actions">
          <span className="form-status t-caption">Unsaved changes: {changedLabels}</span>
          <button type="button" className="btn btn-secondary" onClick={discard} disabled={saving}>Discard</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  )
}
