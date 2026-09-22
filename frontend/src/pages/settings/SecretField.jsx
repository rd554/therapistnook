import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Shared secret-credential input for the Email / WhatsApp / Payments setup
// modals (spec: "Secret fields: type=password, autocomplete=new-password" +
// "Show/hide toggle on secret fields: .btn-ghost.btn-icon.btn-icon-sm,
// aria-label, aria-pressed"). Saved secrets never reach the client (backend
// returns has_smtp_password etc., not the value) — the caller passes
// placeholder="Saved — type to replace" and an empty `value` for those, and
// must omit the key entirely on save when it's left blank. See
// MessagingSection/PaymentsSection: never send `''` for a secret field.
export default function SecretField({ id, name, label, value, onChange, placeholder, hint, optional }) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        {optional && <span className="field-optional">Optional</span>}
      </div>
      <div className="field-with-toggle">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          className="input"
          autoComplete="new-password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-icon-sm field-toggle-btn"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
        </button>
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
