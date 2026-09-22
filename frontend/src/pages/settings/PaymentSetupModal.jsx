import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { updatePaymentGatewayConfig, testPaymentGateway } from '../../api/client'
import Modal from '../../components/ui/Modal'
import SecretField from './SecretField'

const PROVIDERS = [
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'stripe', label: 'Stripe' },
]

// is_enabled and is_test_mode both live here: is_enabled is really "online
// payments on/off" (the row switch pattern shared with Email/WhatsApp would
// suggest it belongs on the page), but the spec is explicit for Payments —
// "modal with provider, API key, API secret, Test connection, and the
// test-mode switch" — so is_test_mode is modal-only. is_enabled still
// belongs to the page's own switch, set by PaymentsSection's save bar.
export default function PaymentSetupModal({ open, onClose, config, onSaved }) {
  const [form, setForm] = useState(() => fromConfig(config))
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(fromConfig(config))
      setApiKey('')
      setApiSecret('')
      setError('')
      setTestResult(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        provider: form.provider,
        is_test_mode: form.is_test_mode,
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(apiSecret ? { api_secret: apiSecret } : {}),
      }
      const saved = await updatePaymentGatewayConfig(payload)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err.userMessage || 'Failed to save payment setup.')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testPaymentGateway()
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
      title="Set up online payments"
      subtitle="Let patients pay by card or UPI through your payment gateway."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="payment-setup-form" className="btn btn-primary" disabled={saving}>
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

      <form id="payment-setup-form" onSubmit={handleSave} className="form-grid">
        <div>
          <div className="field-head"><label htmlFor="rzp_provider">Provider</label></div>
          <select
            id="rzp_provider"
            name="rzp_provider"
            className="select"
            autoComplete="off"
            value={form.provider}
            onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
          >
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div />
        <div>
          <div className="field-head"><label htmlFor="rzp_key">API key</label></div>
          <input
            id="rzp_key"
            name="rzp_key"
            type="text"
            className="input"
            autoComplete="off"
            placeholder={config?.has_api_key ? 'Saved — type to replace' : ''}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <SecretField
          id="rzp_secret"
          name="rzp_secret"
          label="API secret"
          value={apiSecret}
          onChange={setApiSecret}
          placeholder={config?.has_api_secret ? 'Saved — type to replace' : ''}
        />

        <div className="span-2">
          <div className="settings-row">
            <p className="settings-row-title">Test mode</p>
            <div className="settings-row-control">
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={form.is_test_mode}
                aria-label="Test mode"
                onClick={() => setForm((prev) => ({ ...prev, is_test_mode: !prev.is_test_mode }))}
              />
            </div>
          </div>
        </div>
      </form>

      <hr className="settings-divider" style={{ margin: 'var(--space-5) 0' }} />

      <div>
        <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {testResult && (
          <p className="t-caption" style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6, color: testResult.success ? 'var(--text-secondary)' : 'var(--error)' }}>
            {testResult.success
              ? <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
              : <AlertCircle size={14} strokeWidth={1.5} aria-hidden="true" />}
            {testResult.success ? 'Connection succeeded.' : (testResult.error || testResult.message || 'Test failed.')}
          </p>
        )}
      </div>
    </Modal>
  )
}

function fromConfig(config) {
  return {
    provider: config?.provider || 'razorpay',
    is_test_mode: Boolean(config?.is_test_mode),
  }
}
