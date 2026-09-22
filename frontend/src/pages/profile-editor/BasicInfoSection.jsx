import { Camera, Trash2, Upload, User, AlertCircle } from 'lucide-react'

const TITLE_OPTIONS = ['Dr.', 'Mr.', 'Ms.', 'Mrs.', 'Prof.']

export default function BasicInfoSection({
  formData, setFormData, isMissing,
  photoInputRef, onPhotoUpload,
  signatureInputRef, onSignatureUpload, onRemoveSignature,
  stampInputRef, onStampUpload, onRemoveStamp,
}) {
  const set = (key) => (e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))
  const titleIsCustom = formData.title && !TITLE_OPTIONS.includes(formData.title)
  const titleDuplicatesName =
    formData.title && formData.display_name &&
    formData.display_name.trim().toLowerCase().startsWith(formData.title.trim().toLowerCase())

  return (
    <div className="tn-field-group">
      <div className="field">
        <label>Profile photo</label>
        <div className="relative" style={{ width: 88, height: 88, position: 'relative' }}>
          {formData.profile_photo_url ? (
            <img
              src={formData.profile_photo_url} alt=""
              style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--canvas)', boxShadow: 'var(--ci-shadow-sm)' }}
            />
          ) : (
            <div style={{
              width: 88, height: 88, borderRadius: '50%', background: 'var(--surface)',
              border: '3px solid var(--canvas)', boxShadow: 'var(--ci-shadow-sm)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
              <User size={28} strokeWidth={1.5} color="var(--icon-muted)" />
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-icon-sm"
            aria-label="Upload profile photo"
            title="Upload profile photo"
            onClick={() => photoInputRef.current?.click()}
            style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--canvas)' }}
          >
            <Camera size={14} strokeWidth={1.5} />
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" onChange={onPhotoUpload} className="hidden" />
        </div>
      </div>

      <div className="field" style={{ marginTop: 'var(--space-5)' }}>
        <label htmlFor="field-slug">Public link</label>
        <div className="input-group">
          <span className="select" style={{ display: 'flex', alignItems: 'center', cursor: 'default', color: 'var(--text-muted)', paddingRight: 8, backgroundImage: 'none', whiteSpace: 'nowrap' }}>
            therapistnook.com/p/
          </span>
          <input
            id="field-slug" type="text" className="input"
            aria-invalid={isMissing('slug') ? 'true' : undefined}
            placeholder="your-name"
            value={formData.slug || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
          />
        </div>
        <p className="field-hint">Lowercase letters, numbers, and hyphens only. This is your public profile's web address.</p>
      </div>

      <div className="tn-pair" style={{ marginTop: 'var(--space-4)' }}>
        <div className="field">
          <div className="field-head">
            <label htmlFor="field-title">Title</label>
          </div>
          <select
            id="field-title"
            className="select"
            aria-invalid={isMissing('title') ? 'true' : undefined}
            value={titleIsCustom ? '__other__' : (formData.title || '')}
            onChange={(e) => {
              const v = e.target.value
              setFormData((prev) => ({ ...prev, title: v === '__other__' ? (prev.title && !TITLE_OPTIONS.includes(prev.title) ? prev.title : '') : v }))
            }}
          >
            <option value="">Select title</option>
            {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="__other__">Other…</option>
          </select>
          {titleIsCustom && (
            <input
              type="text" className="input" style={{ marginTop: 'var(--space-2)' }}
              placeholder="Custom title" value={formData.title || ''} onChange={set('title')}
            />
          )}
          {titleDuplicatesName && (
            <p className="field-hint" style={{ color: 'var(--warning)' }}>
              <AlertCircle size={12} strokeWidth={1.5} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              Your display name already starts with this title — it may repeat on your public page.
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="field-display_name">Display name</label>
          <input
            id="field-display_name" type="text" className="input"
            aria-invalid={isMissing('display_name') ? 'true' : undefined}
            value={formData.display_name || ''} onChange={set('display_name')}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 'var(--space-4)' }}>
        <label htmlFor="field-tagline">Tagline</label>
        <input
          id="field-tagline" type="text" className="input"
          aria-invalid={isMissing('tagline') ? 'true' : undefined}
          placeholder="Brief professional tagline"
          value={formData.tagline || ''} onChange={set('tagline')}
        />
      </div>

      <div className="tn-pair" style={{ marginTop: 'var(--space-4)' }}>
        <div className="field">
          <label htmlFor="field-profession">Profession</label>
          <input id="field-profession" type="text" className="input" placeholder="Clinical psychologist" value={formData.profession || ''} onChange={set('profession')} />
          <p className="field-hint">Shown under your name. Defaults to "Clinical psychologist" if left blank.</p>
        </div>
        <div className="field">
          <label htmlFor="field-location">Location (short)</label>
          <input id="field-location" type="text" className="input" placeholder="Andheri West, Mumbai" value={formData.location_short || ''} onChange={set('location_short')} />
          <p className="field-hint">Your full clinic address (under Contact) isn't shown here.</p>
        </div>
      </div>

      <div className="field" style={{ marginTop: 'var(--space-4)' }}>
        <div className="field-head">
          <label htmlFor="field-bio">Bio</label>
          <span className="field-optional">{(formData.bio || '').length} characters</span>
        </div>
        <textarea
          id="field-bio" className="textarea" rows={5}
          aria-invalid={isMissing('bio') ? 'true' : undefined}
          placeholder="Tell patients about yourself, your approach, and what makes your practice unique…"
          value={formData.bio || ''} onChange={set('bio')}
        />
      </div>

      <div className="tn-pair" style={{ marginTop: 'var(--space-4)' }}>
        <div className="field">
          <label htmlFor="field-years">Years of experience</label>
          <input id="field-years" type="number" min="0" className="input" value={formData.years_of_experience || ''} onChange={set('years_of_experience')} />
        </div>
        <div className="field">
          <label htmlFor="field-license">License number</label>
          <input id="field-license" type="text" className="input" placeholder="Optional" value={formData.license_number || ''} onChange={set('license_number')} />
        </div>
      </div>

      <div className="tn-field-group">
        <p className="t-h4" style={{ marginBottom: '4px' }}>Digital signature & stamp</p>
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>
          Shown above your name on invoice PDFs. Optional — leave blank to sign printed invoices by hand.
        </p>
        <div className="tn-pair">
          <div>
            <span className="t-caption" style={{ display: 'block', marginBottom: 6 }}>Signature</span>
            {formData.signature_image_url ? (
              <div className="card-flush list-row" style={{ padding: 'var(--space-3)' }}>
                <img src={formData.signature_image_url} alt="Signature" style={{ height: 32, objectFit: 'contain' }} />
                <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Remove signature" onClick={onRemoveSignature} style={{ marginLeft: 'auto' }}>
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => signatureInputRef.current?.click()}>
                <Upload size={16} strokeWidth={1.5} /> Upload signature
              </button>
            )}
            <input ref={signatureInputRef} type="file" accept="image/*" onChange={onSignatureUpload} className="hidden" />
          </div>
          <div>
            <span className="t-caption" style={{ display: 'block', marginBottom: 6 }}>Stamp</span>
            {formData.stamp_image_url ? (
              <div className="card-flush list-row" style={{ padding: 'var(--space-3)' }}>
                <img src={formData.stamp_image_url} alt="Stamp" style={{ height: 32, objectFit: 'contain' }} />
                <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Remove stamp" onClick={onRemoveStamp} style={{ marginLeft: 'auto' }}>
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => stampInputRef.current?.click()}>
                <Upload size={16} strokeWidth={1.5} /> Upload stamp
              </button>
            )}
            <input ref={stampInputRef} type="file" accept="image/*" onChange={onStampUpload} className="hidden" />
          </div>
        </div>
      </div>

      <div className="tn-field-group">
        <p className="t-h4" style={{ marginBottom: 'var(--space-3)' }}>Fees</p>
        <div className="tn-pair">
          <div className="field">
            <label htmlFor="field-fee">Consultation fee (₹)</label>
            <input id="field-fee" type="number" className="input" placeholder="e.g. 2000" value={formData.consultation_fee || ''} onChange={set('consultation_fee')} />
          </div>
          <div className="field">
            <label htmlFor="field-fee-note">Fee note</label>
            <input id="field-fee-note" type="text" className="input" placeholder="e.g. Sliding scale for students" value={formData.fee_notes || ''} onChange={set('fee_notes')} />
            <p className="field-hint">Shown under the fee, only if filled in.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
