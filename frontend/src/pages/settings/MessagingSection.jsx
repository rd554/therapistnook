import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import {
  getEmailConfig, getWhatsAppConfig, getMessagingPreferences, updateMessagingPreferences,
  updateEmailConfig, updateWhatsAppConfig,
} from '../../api/client'
import { useDirtyForm } from '../../hooks/useDirtyForm'
import { useRegisterSettingsGuard } from './SettingsGuardContext'
import EmailSetupModal from './EmailSetupModal'
import WhatsAppSetupModal from './WhatsAppSetupModal'

// Minutes, not hours — matches MessagingPreferences.reminder_offset_minutes.
const REMINDER_OPTIONS = [
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '24 hours before' },
  { value: 2880, label: '48 hours before' },
]

// Rows of the channel matrix. `edit` is omitted deliberately — see the
// "Edit wording" note at the bottom of this file.
const EVENTS = [
  { key: 'session_booked', name: 'Session booked', desc: 'When a booking is confirmed' },
  { key: 'reminder', name: 'Reminder', desc: null },
  { key: 'session_rescheduled', name: 'Session rescheduled', desc: 'When you or the patient move a session' },
  { key: 'session_cancelled', name: 'Session cancelled', desc: 'When a session is cancelled by either side' },
  { key: 'payment_request', name: 'Payment request', desc: 'When you send an invoice' },
  { key: 'payment_received', name: 'Payment received', desc: 'After a payment is recorded, with the receipt' },
]

const FIELD_LABELS = {
  email_enabled: 'email on/off',
  whatsapp_enabled: 'WhatsApp on/off',
  reminder_offset_minutes: 'reminder timing',
  session_booked_email: 'session booked · email',
  session_booked_whatsapp: 'session booked · WhatsApp',
  reminder_email: 'reminder · email',
  reminder_whatsapp: 'reminder · WhatsApp',
  session_rescheduled_email: 'rescheduled · email',
  session_rescheduled_whatsapp: 'rescheduled · WhatsApp',
  session_cancelled_email: 'cancelled · email',
  session_cancelled_whatsapp: 'cancelled · WhatsApp',
  payment_request_email: 'payment request · email',
  payment_request_whatsapp: 'payment request · WhatsApp',
  payment_received_email: 'payment received · email',
  payment_received_whatsapp: 'payment received · WhatsApp',
}

function toFormShape({ email, whatsapp, prefs }) {
  const form = {
    email_enabled: Boolean(email?.is_enabled),
    whatsapp_enabled: Boolean(whatsapp?.is_enabled),
    reminder_offset_minutes: prefs?.reminder_offset_minutes ?? 1440,
  }
  for (const evt of EVENTS) {
    form[`${evt.key}_email`] = Boolean(prefs?.[`${evt.key}_email`])
    form[`${evt.key}_whatsapp`] = Boolean(prefs?.[`${evt.key}_whatsapp`])
  }
  return form
}

export default function MessagingSection() {
  const { refreshNavStatus } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [emailConfig, setEmailConfig] = useState(null)
  const [whatsappConfig, setWhatsappConfig] = useState(null)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)

  const { form, setField, isDirty, changedKeys, changedLabels, discard, commit } = useDirtyForm({}, FIELD_LABELS)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [email, whatsapp, prefs] = await Promise.all([
          getEmailConfig(), getWhatsAppConfig(), getMessagingPreferences(),
        ])
        if (cancelled) return
        setEmailConfig(email)
        setWhatsappConfig(whatsapp)
        commit(toFormShape({ email, whatsapp, prefs }))
      } catch (err) {
        if (!cancelled) setServerError(err.userMessage || 'Failed to load messaging settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useRegisterSettingsGuard(isDirty, changedLabels)

  const isEmailConfigured = Boolean(emailConfig?.smtp_host && emailConfig?.sender_email)
  const isWhatsAppConfigured = Boolean(whatsappConfig?.phone_number_id && whatsappConfig?.has_access_token)
  const emailAvailable = isEmailConfigured && form.email_enabled
  const whatsappAvailable = isWhatsAppConfigured && form.whatsapp_enabled
  const bothOff = !form.email_enabled && !form.whatsapp_enabled

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setServerError('')
    try {
      const changed = new Set(changedKeys)
      const [emailUpdated, whatsappUpdated, prefsUpdated] = await Promise.all([
        changed.has('email_enabled')
          ? updateEmailConfig({ is_enabled: form.email_enabled })
          : Promise.resolve(emailConfig),
        changed.has('whatsapp_enabled')
          ? updateWhatsAppConfig({ is_enabled: form.whatsapp_enabled })
          : Promise.resolve(whatsappConfig),
        (() => {
          const prefKeys = [...changed].filter((k) => k !== 'email_enabled' && k !== 'whatsapp_enabled')
          if (prefKeys.length === 0) return Promise.resolve(null)
          const payload = {}
          for (const k of prefKeys) payload[k] = form[k]
          return updateMessagingPreferences(payload)
        })(),
      ])
      setEmailConfig(emailUpdated)
      setWhatsappConfig(whatsappUpdated)
      commit(toFormShape({ email: emailUpdated, whatsapp: whatsappUpdated, prefs: prefsUpdated || pick(form) }))
      await refreshNavStatus()
    } catch (err) {
      setServerError(err.userMessage || 'Failed to save messaging settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card settings-section"><p className="t-caption">Loading…</p></div>
  }

  // "Edit wording" (spec: `.link` in `.matrix-edit`, opening the existing
  // template editor for that event) has nothing to open: main.py defines no
  // notification-template routes, and the old NotificationTemplatesSection's
  // "Edit Template" button has no onClick handler — it never worked. Adding
  // a link with no destination would be a new, visible dead control, so
  // `.matrix-edit` is left empty below instead. Flagged in the check-in report.
  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="card settings-section" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="t-h2">Channels</h2>

          <div className="settings-row">
            <div>
              <p className="settings-row-title">Email</p>
              <p className="settings-row-desc">
                {isEmailConfigured
                  ? `Sending as ${emailConfig.sender_name || emailConfig.sender_email} from ${emailConfig.sender_email} over SMTP`
                  : 'Not set up.'}
              </p>
            </div>
            <div className="settings-row-control">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEmailModal(true)}>
                {isEmailConfigured ? 'Edit setup' : 'Set up email'}
              </button>
              {isEmailConfigured && (
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={form.email_enabled}
                  aria-label="Email"
                  onClick={() => setField('email_enabled', !form.email_enabled)}
                />
              )}
            </div>
          </div>

          <hr className="settings-divider" />

          <div className="settings-row">
            <div>
              <p className="settings-row-title">WhatsApp</p>
              <p className="settings-row-desc">
                {isWhatsAppConfigured
                  ? `Sending from phone number ID ${whatsappConfig.phone_number_id}`
                  : 'Not set up. Needs a WhatsApp Business account from Meta.'}
              </p>
            </div>
            <div className="settings-row-control">
              <button type="button" className="btn btn-secondary" onClick={() => setShowWhatsAppModal(true)}>
                {isWhatsAppConfigured ? 'Edit setup' : 'Set up WhatsApp'}
              </button>
              {isWhatsAppConfigured && (
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={form.whatsapp_enabled}
                  aria-label="WhatsApp"
                  onClick={() => setField('whatsapp_enabled', !form.whatsapp_enabled)}
                />
              )}
            </div>
          </div>
        </div>

        <div className="card settings-section">
          <h2 className="t-h2">What patients receive</h2>
          <p className="t-caption settings-section-desc">
            Tick a channel to send that message on it. Untick both to stop sending it.
          </p>

          {bothOff && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
              <span>Patients aren&rsquo;t receiving any messages. Set up a channel above.</span>
            </div>
          )}

          <table className="channel-matrix">
            <thead>
              <tr>
                <th scope="col">Message</th>
                <th scope="col" className="matrix-channel">Email</th>
                <th scope="col" className="matrix-channel">WhatsApp</th>
                <th scope="col" className="matrix-edit"><span className="sr-only">Wording</span></th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((evt) => (
                <tr key={evt.key}>
                  <td>
                    <div className="matrix-name">
                      {evt.name}
                      {evt.key === 'reminder' && (
                        <select
                          className="select"
                          aria-label="Reminder timing"
                          value={form.reminder_offset_minutes}
                          onChange={(e) => setField('reminder_offset_minutes', parseInt(e.target.value, 10))}
                        >
                          {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </div>
                    {evt.desc && <p className="matrix-desc">{evt.desc}</p>}
                  </td>
                  <td className={`matrix-channel${emailAvailable ? '' : ' is-unavailable'}`} data-label="Email">
                    <input
                      type="checkbox"
                      aria-label={`${evt.name} by email`}
                      checked={form[`${evt.key}_email`]}
                      disabled={!emailAvailable}
                      onChange={(e) => setField(`${evt.key}_email`, e.target.checked)}
                    />
                  </td>
                  <td className={`matrix-channel${whatsappAvailable ? '' : ' is-unavailable'}`} data-label="WhatsApp">
                    <input
                      type="checkbox"
                      aria-label={`${evt.name} by WhatsApp`}
                      checked={form[`${evt.key}_whatsapp`]}
                      disabled={!whatsappAvailable}
                      onChange={(e) => setField(`${evt.key}_whatsapp`, e.target.checked)}
                    />
                  </td>
                  <td className="matrix-edit" />
                </tr>
              ))}
            </tbody>
          </table>

          {!emailAvailable && (
            <p className="t-caption">
              Email boxes unlock once email is {isEmailConfigured ? 'turned on' : 'set up'}.
            </p>
          )}
          {!whatsappAvailable && (
            <p className="t-caption">
              WhatsApp boxes unlock once WhatsApp is {isWhatsAppConfigured ? 'turned on' : 'set up'}.
            </p>
          )}
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

      <EmailSetupModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        config={emailConfig}
        onSaved={setEmailConfig}
      />
      <WhatsAppSetupModal
        open={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        config={whatsappConfig}
        onSaved={setWhatsappConfig}
      />
    </>
  )
}

function pick(form) {
  const prefs = {}
  for (const evt of EVENTS) {
    prefs[`${evt.key}_email`] = form[`${evt.key}_email`]
    prefs[`${evt.key}_whatsapp`] = form[`${evt.key}_whatsapp`]
  }
  prefs.reminder_offset_minutes = form.reminder_offset_minutes
  return prefs
}
