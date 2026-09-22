import FaqEditor from './FaqEditor'

export default function OnboardingSection({ formData, setFormData }) {
  const set = (key) => (e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="tn-field-group">
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor="field-welcome">Welcome message</label>
          <textarea id="field-welcome" className="textarea" rows={4} placeholder="Welcome new patients to your practice…" value={formData.welcome_message || ''} onChange={set('welcome_message')} />
        </div>
        <div className="field span-2">
          <label htmlFor="field-expect">What to expect</label>
          <textarea id="field-expect" className="textarea" rows={4} placeholder="Describe what patients can expect from therapy…" value={formData.what_to_expect || ''} onChange={set('what_to_expect')} />
        </div>
        {/* two side-by-side pairs, as on desktop — .form-grid collapses to
            one column below 720px on its own, so this stays readable on a
            narrow phone without needing a separate mobile-only layout. */}
        <div className="field">
          <label htmlFor="field-how-works">How therapy works</label>
          <textarea id="field-how-works" className="textarea" rows={4} placeholder="Explain your therapeutic process…" value={formData.how_therapy_works || ''} onChange={set('how_therapy_works')} />
        </div>
        <div className="field">
          <label htmlFor="field-prep">Preparation guidelines</label>
          <textarea id="field-prep" className="textarea" rows={4} placeholder="How patients should prepare for their first session…" value={formData.preparation_guidelines || ''} onChange={set('preparation_guidelines')} />
        </div>
        <div className="field">
          <label htmlFor="field-emergency">Emergency disclaimer</label>
          <textarea id="field-emergency" className="textarea" rows={3} placeholder="Important disclaimer about emergency situations…" value={formData.emergency_disclaimer || ''} onChange={set('emergency_disclaimer')} />
        </div>
        <div className="field">
          <label htmlFor="field-consent">Consent information</label>
          <textarea id="field-consent" className="textarea" rows={3} placeholder="Information about consent and privacy…" value={formData.consent_info || ''} onChange={set('consent_info')} />
        </div>
      </div>

      <div className="tn-field-group">
        <p className="t-h4" style={{ marginBottom: 'var(--space-3)' }}>Frequently asked questions</p>
        <FaqEditor value={formData.faq_content} onChange={(next) => setFormData((prev) => ({ ...prev, faq_content: next }))} />
      </div>
    </div>
  )
}
