import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { getSecuritySettings, updateSecuritySettings } from '../../api/client'
import { useDirtyForm } from '../../hooks/useDirtyForm'
import { useRegisterSettingsGuard } from './SettingsGuardContext'

const TIMEOUT_OPTIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
  { minutes: 1440, label: '24 hours' },
]

const ATTEMPT_OPTIONS = [3, 5, 10]
const LOCKOUT_OPTIONS = [15, 30, 60]
const MIN_LENGTH_OPTIONS = []
for (let n = 8; n <= 20; n++) MIN_LENGTH_OPTIONS.push(n)

const FIELD_LABELS = {
  session_timeout_minutes: 'sign-out timing',
  max_login_attempts: 'lockout threshold',
  lockout_duration_minutes: 'lockout duration',
  min_password_length: 'minimum password length',
  require_uppercase: 'uppercase requirement',
  require_lowercase: 'lowercase requirement',
  require_numbers: 'number requirement',
  require_special_chars: 'symbol requirement',
}

function toFormShape(settings) {
  return {
    session_timeout_minutes: settings.session_timeout_minutes,
    max_login_attempts: settings.max_login_attempts,
    lockout_duration_minutes: settings.lockout_duration_minutes,
    min_password_length: settings.min_password_length,
    require_uppercase: settings.require_uppercase,
    require_lowercase: settings.require_lowercase,
    require_numbers: settings.require_numbers,
    require_special_chars: settings.require_special_chars,
  }
}

export default function SecuritySection() {
  const { refreshNavStatus } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  const { form, setField, isDirty, changedKeys, changedLabels, discard, commit } = useDirtyForm({}, FIELD_LABELS)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getSecuritySettings()
        if (cancelled) return
        commit(toFormShape(data))
      } catch (err) {
        if (!cancelled) setServerError(err.userMessage || 'Failed to load security settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useRegisterSettingsGuard(isDirty, changedLabels)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setServerError('')
    try {
      const payload = {}
      for (const k of changedKeys) payload[k] = form[k]
      // 2FA doesn't exist yet (spec: "Remove both 2FA toggles") — never send it.
      delete payload.two_factor_enabled
      delete payload.two_factor_required
      const saved = await updateSecuritySettings(payload)
      commit(toFormShape(saved))
      await refreshNavStatus()
    } catch (err) {
      setServerError(err.userMessage || 'Failed to save security settings.')
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

      <div className="card settings-section" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="t-h2">Signing in</h2>

        <div>
          <div className="field-head"><label htmlFor="session_timeout_minutes">Sign out after</label></div>
          <select
            id="session_timeout_minutes"
            className="select"
            style={{ width: 300 }}
            value={form.session_timeout_minutes}
            onChange={(e) => setField('session_timeout_minutes', parseInt(e.target.value, 10))}
          >
            {TIMEOUT_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label} without activity</option>)}
          </select>
          <p className="field-hint">An unattended screen keeps patient records open this long.</p>
        </div>

        <p className="settings-inline">
          <span aria-hidden="true">After</span>
          <label className="sr-only" htmlFor="max_login_attempts">Number of wrong passwords before lockout</label>
          <select
            id="max_login_attempts"
            className="select"
            value={form.max_login_attempts}
            onChange={(e) => setField('max_login_attempts', parseInt(e.target.value, 10))}
          >
            {ATTEMPT_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span aria-hidden="true">wrong passwords, lock the account for</span>
          <label className="sr-only" htmlFor="lockout_duration_minutes">Lockout duration</label>
          <select
            id="lockout_duration_minutes"
            className="select"
            value={form.lockout_duration_minutes}
            onChange={(e) => setField('lockout_duration_minutes', parseInt(e.target.value, 10))}
          >
            {LOCKOUT_OPTIONS.map((n) => <option key={n} value={n}>{n} minutes</option>)}
          </select>
          <span aria-hidden="true">.</span>
        </p>

        <hr className="settings-divider" />

        <p className="t-caption">Two-factor sign-in isn&rsquo;t available yet.</p>
      </div>

      <div className="card settings-section">
        <h2 className="t-h2">Passwords</h2>

        <div>
          <div className="field-head"><label htmlFor="min_password_length">Minimum length</label></div>
          <select
            id="min_password_length"
            className="select"
            style={{ maxWidth: 200 }}
            value={form.min_password_length}
            onChange={(e) => setField('min_password_length', parseInt(e.target.value, 10))}
          >
            {MIN_LENGTH_OPTIONS.map((n) => <option key={n} value={n}>{n} characters</option>)}
          </select>
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="settings-row-title" style={{ marginBottom: 'var(--space-3)' }}>Must include</legend>
          <div className="check-grid">
            <label className="check">
              <input
                type="checkbox"
                checked={form.require_uppercase}
                onChange={(e) => setField('require_uppercase', e.target.checked)}
              />
              An uppercase letter
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.require_lowercase}
                onChange={(e) => setField('require_lowercase', e.target.checked)}
              />
              A lowercase letter
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.require_numbers}
                onChange={(e) => setField('require_numbers', e.target.checked)}
              />
              A number
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.require_special_chars}
                onChange={(e) => setField('require_special_chars', e.target.checked)}
              />
              A symbol
            </label>
          </div>
        </fieldset>
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
