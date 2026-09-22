import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { getPaymentGatewayConfig, updatePaymentGatewayConfig } from '../../api/client'
import { useDirtyForm } from '../../hooks/useDirtyForm'
import { useRegisterSettingsGuard } from './SettingsGuardContext'
import PaymentSetupModal from './PaymentSetupModal'

const PROVIDER_LABELS = { razorpay: 'Razorpay', stripe: 'Stripe' }

const FIELD_LABELS = {
  is_enabled: 'online payments on/off',
  invoice_prefix: 'invoice number prefix',
  receipt_prefix: 'receipt number prefix',
  tax_enabled: 'tax on invoices',
  default_tax_percentage: 'tax rate',
}

function toFormShape(config) {
  return {
    is_enabled: Boolean(config.is_enabled),
    invoice_prefix: config.invoice_prefix || 'INV-',
    receipt_prefix: config.receipt_prefix || 'RCPT-',
    tax_enabled: Boolean(config.tax_enabled),
    default_tax_percentage: config.default_tax_percentage ?? 18,
  }
}

export default function PaymentsSection() {
  const { refreshNavStatus } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [config, setConfig] = useState(null)
  const [showSetup, setShowSetup] = useState(false)

  const { form, setField, isDirty, changedKeys, changedLabels, discard, commit } = useDirtyForm({}, FIELD_LABELS)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getPaymentGatewayConfig()
        if (cancelled) return
        setConfig(data)
        commit(toFormShape(data))
      } catch (err) {
        if (!cancelled) setServerError(err.userMessage || 'Failed to load payment settings.')
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
      if (!form.tax_enabled) delete payload.default_tax_percentage
      const saved = await updatePaymentGatewayConfig(payload)
      setConfig(saved)
      commit(toFormShape(saved))
      await refreshNavStatus()
    } catch (err) {
      setServerError(err.userMessage || 'Failed to save payment settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card settings-section"><p className="t-caption">Loading…</p></div>
  }

  const providerLabel = PROVIDER_LABELS[config.provider] || config.provider
  const onlineDesc = !form.is_enabled
    ? 'Off. Patients pay you directly and you mark invoices as paid. Turn on to let patients pay by card or UPI through Razorpay.'
    : config.is_test_mode
      ? `${providerLabel} · test mode`
      : `${providerLabel} · live`

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
          <div className="settings-row">
            <div>
              <p className="settings-section-title settings-row-title">Online payments</p>
              <p className="settings-row-desc" style={config.is_test_mode && form.is_enabled ? { color: 'var(--warning)' } : undefined}>
                {onlineDesc}
                {config.is_test_mode && form.is_enabled ? ' — patients can’t pay real money' : ''}
              </p>
            </div>
            <div className="settings-row-control">
              <button type="button" className="btn btn-secondary" onClick={() => setShowSetup(true)}>
                {form.is_enabled ? 'Edit setup' : 'Set up online payments'}
              </button>
              {form.is_enabled && (
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={form.is_enabled}
                  aria-label="Online payments"
                  onClick={() => setField('is_enabled', !form.is_enabled)}
                />
              )}
            </div>
          </div>
        </div>

        <div className="card settings-section" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="t-h2">Invoices and receipts</h2>
          <p className="t-caption settings-section-desc">All amounts in Indian Rupees (₹).</p>

          <div className="form-grid">
            <div>
              <div className="field-head"><label htmlFor="invoice_prefix">Invoice number prefix</label></div>
              <input
                id="invoice_prefix"
                type="text"
                className="input"
                value={form.invoice_prefix}
                onChange={(e) => setField('invoice_prefix', e.target.value)}
              />
              <p className="field-hint">Invoices read {form.invoice_prefix || 'INV-'}0001, {form.invoice_prefix || 'INV-'}0002…</p>
            </div>
            <div>
              <div className="field-head"><label htmlFor="receipt_prefix">Receipt number prefix</label></div>
              <input
                id="receipt_prefix"
                type="text"
                className="input"
                value={form.receipt_prefix}
                onChange={(e) => setField('receipt_prefix', e.target.value)}
              />
              <p className="field-hint">Receipts read {form.receipt_prefix || 'RCPT-'}0001, {form.receipt_prefix || 'RCPT-'}0002…</p>
            </div>
          </div>
        </div>

        <div className="card settings-section">
          <div className="settings-row has-switch">
            <div>
              <p className="settings-section-title settings-row-title">Tax on invoices</p>
              <p className="settings-row-desc">
                {form.tax_enabled ? 'On. Every invoice and receipt shows a tax line.' : 'Off. Turn on to add a tax line to every invoice and receipt.'}
              </p>
            </div>
            <div className="settings-row-control">
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={form.tax_enabled}
                aria-label="Tax on invoices"
                onClick={() => setField('tax_enabled', !form.tax_enabled)}
              />
            </div>
          </div>

          {form.tax_enabled && (
            <div className="form-grid">
              <div>
                <div className="field-head"><label htmlFor="default_tax_percentage">Tax rate</label></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    id="default_tax_percentage"
                    type="number"
                    min="0"
                    max="100"
                    className="input"
                    style={{ maxWidth: 120 }}
                    value={form.default_tax_percentage}
                    onChange={(e) => setField('default_tax_percentage', parseInt(e.target.value, 10) || 0)}
                  />
                  <span className="t-caption">%</span>
                </div>
              </div>
            </div>
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

      <PaymentSetupModal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        config={config}
        // Only refresh the raw config (provider/test-mode/key display) — never
        // commit() here. The modal's PUT doesn't touch is_enabled/prefixes/tax,
        // so its response reflects only what's persisted; running it through
        // commit() would silently discard any unsaved bar-level edits the
        // practitioner made before opening the modal.
        onSaved={setConfig}
      />
    </>
  )
}
