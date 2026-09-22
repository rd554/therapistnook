import { Instagram } from 'lucide-react'

export default function ContactSection({ formData, setFormData }) {
  const set = (key) => (e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="tn-field-group">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="field-email">Public email</label>
          <input id="field-email" type="email" className="input" placeholder="contact@example.com" value={formData.public_email || ''} onChange={set('public_email')} />
        </div>
        <div className="field">
          <label htmlFor="field-phone">Public phone</label>
          <input id="field-phone" type="tel" className="input" placeholder="+91 98765 43210" value={formData.public_phone || ''} onChange={set('public_phone')} />
        </div>
        <div className="field span-2">
          <label htmlFor="field-instagram">Instagram handle</label>
          <div className="input-group">
            <span className="select" style={{ display: 'flex', alignItems: 'center', cursor: 'default', color: 'var(--text-muted)', width: 44, justifyContent: 'center', paddingRight: 0, backgroundImage: 'none' }}>
              <Instagram size={16} strokeWidth={1.5} />
            </span>
            <input id="field-instagram" type="text" className="input" placeholder="yourhandle" value={formData.instagram_handle || ''} onChange={set('instagram_handle')} />
          </div>
        </div>
      </div>

      <div className="field" style={{ marginTop: 'var(--space-4)' }}>
        <label htmlFor="field-clinic-address">Clinic address</label>
        <textarea
          id="field-clinic-address" className="textarea" rows={3}
          placeholder="Full clinic address"
          value={formData.clinic_address || ''} onChange={set('clinic_address')}
        />
        <p className="field-hint">
          Shown on your public page as a "Get directions" link (opens Google Maps), and on booking
          confirmations for in-person sessions.
        </p>
      </div>
    </div>
  )
}
