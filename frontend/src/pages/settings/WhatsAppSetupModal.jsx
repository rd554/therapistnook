import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { updateWhatsAppConfig, testWhatsAppConfig } from '../../api/client'
import Modal from '../../components/ui/Modal'
import SecretField from './SecretField'

// Same pattern as EmailSetupModal: saves on its own button, is_enabled lives
// on the page row instead. India-first placeholder per spec item 12 (the old
// screen's +1 415 number was a bug, not a default worth keeping).
export default function WhatsAppSetupModal({ open, onClose, config, onSaved }) {
  const [form, setForm] = useState(() => fromConfig(config))
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(fromConfig(config))
      setAccessToken('')
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
        phone_number_id: form.phone_number_id,
        business_account_id: form.business_account_id,
        ...(accessToken ? { access_token: accessToken } : {}),
      }
      const saved = await updateWhatsAppConfig(payload)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err.userMessage || 'Failed to save WhatsApp setup.')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testPhone) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testWhatsAppConfig(testPhone)
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
      title="Set up WhatsApp"
      subtitle="Needs a WhatsApp Business account from Meta."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="whatsapp-setup-form" className="btn btn-primary" disabled={saving}>
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

      <form id="whatsapp-setup-form" onSubmit={handleSave} className="form-grid">
        <div>
          <div className="field-head"><label htmlFor="wa_phone_id">Phone number ID</label></div>
          <input
            id="wa_phone_id"
            name="wa_phone_id"
            type="text"
            className="input"
            autoComplete="off"
            inputMode="numeric"
            placeholder="109876543212345"
            value={form.phone_number_id}
            onChange={(e) => setField('phone_number_id', e.target.value)}
          />
          <p className="field-hint">From WhatsApp &gt; API setup in your Meta Business app.</p>
        </div>
        <div>
          <div className="field-head">
            <label htmlFor="wa_waba_id">Business account ID</label>
            <span className="field-optional">Optional</span>
          </div>
          <input
            id="wa_waba_id"
            name="wa_waba_id"
            type="text"
            className="input"
            autoComplete="off"
            inputMode="numeric"
            placeholder="108765432198765"
            value={form.business_account_id}
            onChange={(e) => setField('business_account_id', e.target.value)}
          />
        </div>
        <div className="span-2">
          <SecretField
            id="wa_token"
            name="wa_token"
            label="Access token"
            value={accessToken}
            onChange={setAccessToken}
            placeholder={config?.has_access_token ? 'Saved — type to replace' : ''}
            hint="Temporary tokens expire in 24 hours — generate a permanent one via a System User for production use."
          />
        </div>
      </form>

      <hr className="settings-divider" style={{ margin: 'var(--space-5) 0' }} />

      <div>
        <div className="field-head"><label htmlFor="wa_test_recipient">Send test message</label></div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <input
            id="wa_test_recipient"
            name="wa_test_recipient"
            type="tel"
            className="input"
            autoComplete="off"
            placeholder="+91 98765 43210"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={!testPhone || testing}>
            {testing ? 'Sending…' : 'Send test message'}
          </button>
        </div>
        <p className="field-hint">
          Sends Meta&rsquo;s pre-approved &ldquo;hello_world&rdquo; template, so it may take a few seconds to
          arrive. The recipient must be added as a test number in your Meta app unless you&rsquo;ve completed
          Business Verification.
        </p>
        {testResult && (
          <p className="t-caption" style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6, color: testResult.success ? 'var(--text-secondary)' : 'var(--error)' }}>
            {testResult.success
              ? <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
              : <AlertCircle size={14} strokeWidth={1.5} aria-hidden="true" />}
            {testResult.success ? 'Test message sent.' : (testResult.error || testResult.message || 'Test failed.')}
          </p>
        )}
      </div>
    </Modal>
  )
}

function fromConfig(config) {
  return {
    phone_number_id: config?.phone_number_id || '',
    business_account_id: config?.business_account_id || '',
  }
}
