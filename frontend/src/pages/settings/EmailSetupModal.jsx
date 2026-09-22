import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { updateEmailConfig, testEmailConfig } from '../../api/client'
import Modal from '../../components/ui/Modal'
import SecretField from './SecretField'

const PROVIDERS = [
  { value: 'smtp', label: 'SMTP' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'mailgun', label: 'Mailgun' },
]

// Setup lives in a modal, saves on its own button — never through the
// Messaging save bar (spec: "Setup modals ... save on their own button
// inside the modal, not through the bar."). `config` is the last-loaded
// EmailConfigResponse; is_enabled is NOT edited here (that's the row switch
// on the page, part of the bar) — only credentials and sender identity.
export default function EmailSetupModal({ open, onClose, config, onSaved }) {
  const [form, setForm] = useState(() => fromConfig(config))
  const [smtpPassword, setSmtpPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(fromConfig(config))
      setSmtpPassword('')
      setError('')
      setTestResult(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config])

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        provider: form.provider,
        sender_name: form.sender_name,
        sender_email: form.sender_email,
        reply_to_email: form.reply_to_email,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_use_tls: form.smtp_use_tls,
        // Omitted entirely unless typed — an empty string is not "no change"
        // to the backend (EmailConfigUpdate excludes only None), so sending
        // '' would overwrite a saved password with nothing.
        ...(smtpPassword ? { smtp_password: smtpPassword } : {}),
      }
      const saved = await updateEmailConfig(payload)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err.userMessage || 'Failed to save email setup.')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testEmail) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testEmailConfig(testEmail)
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, error: err.userMessage || 'Test failed.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set up email"
      subtitle="Used for booking confirmations, reminders and receipts."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="email-setup-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form id="email-setup-form" onSubmit={handleSave} className="form-grid">
        <div>
          <div className="field-head"><label htmlFor="email_provider">Provider</label></div>
          <select
            id="email_provider"
            name="email_provider"
            className="select"
            autoComplete="off"
            value={form.provider}
            onChange={(e) => setField('provider', e.target.value)}
          >
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <div className="field-head"><label htmlFor="email_sender_name">Sender name</label></div>
          <input
            id="email_sender_name"
            name="email_sender_name"
            type="text"
            className="input"
            autoComplete="off"
            placeholder="My Practice"
            value={form.sender_name}
            onChange={(e) => setField('sender_name', e.target.value)}
          />
        </div>
        <div>
          <div className="field-head"><label htmlFor="email_sender_email">Sender email</label></div>
          <input
            id="email_sender_email"
            name="email_sender_email"
            type="email"
            className="input"
            autoComplete="off"
            placeholder="noreply@example.com"
            value={form.sender_email}
            onChange={(e) => setField('sender_email', e.target.value)}
          />
        </div>
        <div>
          <div className="field-head">
            <label htmlFor="email_reply_to">Reply-to</label>
            <span className="field-optional">Optional</span>
          </div>
          <input
            id="email_reply_to"
            name="email_reply_to"
            type="email"
            className="input"
            autoComplete="off"
            placeholder="support@example.com"
            value={form.reply_to_email}
            onChange={(e) => setField('reply_to_email', e.target.value)}
          />
        </div>

        <div className="span-2"><hr className="settings-divider" /></div>

        <div>
          <div className="field-head"><label htmlFor="smtp_host">SMTP host</label></div>
          <input
            id="smtp_host"
            name="smtp_host"
            type="text"
            className="input"
            autoComplete="off"
            placeholder="smtp.example.com"
            value={form.smtp_host}
            onChange={(e) => setField('smtp_host', e.target.value)}
          />
        </div>
        <div>
          <div className="field-head"><label htmlFor="smtp_port">Port</label></div>
          <input
            id="smtp_port"
            name="smtp_port"
            type="number"
            className="input"
            autoComplete="off"
            value={form.smtp_port}
            onChange={(e) => setField('smtp_port', parseInt(e.target.value, 10) || '')}
          />
        </div>
        <div>
          <div className="field-head"><label htmlFor="smtp_user">Username</label></div>
          <input
            id="smtp_user"
            name="smtp_user"
            type="text"
            className="input"
            autoComplete="off"
            value={form.smtp_username}
            onChange={(e) => setField('smtp_username', e.target.value)}
          />
        </div>
        <SecretField
          id="smtp_secret"
          name="smtp_secret"
          label="Password"
          value={smtpPassword}
          onChange={setSmtpPassword}
          placeholder={config?.has_smtp_password ? 'Saved — type to replace' : ''}
        />

        <div className="span-2">
          <label className="check">
            <input
              type="checkbox"
              checked={form.smtp_use_tls}
              onChange={(e) => setField('smtp_use_tls', e.target.checked)}
            />
            Use TLS
          </label>
        </div>
      </form>

      <hr className="settings-divider" style={{ margin: 'var(--space-5) 0' }} />

      <div>
        <div className="field-head"><label htmlFor="email_test_recipient">Send test email</label></div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <input
            id="email_test_recipient"
            name="email_test_recipient"
            type="email"
            className="input"
            autoComplete="off"
            placeholder="you@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={!testEmail || testing}>
            {testing ? 'Sending…' : 'Send test email'}
          </button>
        </div>
        {testResult && (
          <p className="t-caption" style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6, color: testResult.success ? 'var(--text-secondary)' : 'var(--error)' }}>
            {testResult.success
              ? <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
              : <AlertCircle size={14} strokeWidth={1.5} aria-hidden="true" />}
            {testResult.success ? 'Test email sent.' : (testResult.error || testResult.message || 'Test failed.')}
          </p>
        )}
      </div>
    </Modal>
  )
}

function fromConfig(config) {
  return {
    provider: config?.provider || 'smtp',
    sender_name: config?.sender_name || '',
    sender_email: config?.sender_email || '',
    reply_to_email: config?.reply_to_email || '',
    smtp_host: config?.smtp_host || '',
    smtp_port: config?.smtp_port ?? 587,
    smtp_username: config?.smtp_username || '',
    smtp_use_tls: config?.smtp_use_tls !== false,
  }
}
