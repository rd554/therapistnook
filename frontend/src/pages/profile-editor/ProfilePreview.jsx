// Live preview of the public profile page, reading directly off the form's
// live (unsaved) state — not the last-saved `profile` — so edits show
// instantly. One component renders all three shapes the spec asks for:
//   inline (xl, >=1280px)  — plain panel, no dialog semantics, always mounted
//   sheet  (lg, 1024-1279) — right-side slide-over, opened on demand
//   dialog (mobile, <1024) — full-screen dialog, opened on demand
// Same markup/content in every variant; only the wrapper chrome changes,
// so there's exactly one implementation of "what the public page shows" to
// keep in sync with reality, not three.
import { useEffect, useRef } from 'react'
import { X, User } from 'lucide-react'

function truncateAtWord(text, max) {
  if (!text || text.length <= max) return text || ''
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`
}

function formatFeeINR(rupees) {
  if (!rupees) return null
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(rupees)
  } catch {
    return `₹${rupees}`
  }
}

function PreviewContent({ formData }) {
  const approaches = formData.therapy_approaches || []
  const shownApproaches = approaches.slice(0, 4)
  const moreApproaches = approaches.length - shownApproaches.length
  const faqs = formData.faq_content || []

  if (!formData.is_public) {
    return (
      <div className="tn-preview-hidden">
        <p className="t-h3" style={{ marginBottom: '4px' }}>Profile is hidden</p>
        <p className="t-body-s">Turn on "Public" to see how patients will find you.</p>
      </div>
    )
  }

  return (
    <div className="tn-preview-page">
      <div className="tn-preview-photo">
        {formData.profile_photo_url ? (
          <img src={formData.profile_photo_url} alt="" />
        ) : (
          <User size={28} strokeWidth={1.5} />
        )}
      </div>
      <p className="t-h3" style={{ margin: '10px 0 0' }}>
        {[formData.title, formData.display_name].filter(Boolean).join(' ') || 'Your name'}
      </p>
      {formData.tagline && <p className="t-body-s" style={{ margin: '2px 0 0' }}>{formData.tagline}</p>}
      <p className="t-caption" style={{ margin: '6px 0 0' }}>
        {[formData.profession || 'Clinical psychologist', formData.location_short].filter(Boolean).join(' · ')}
      </p>

      {formData.bio && (
        <p className="t-body-s tn-preview-bio">{truncateAtWord(formData.bio, 220)}</p>
      )}

      {shownApproaches.length > 0 && (
        <div className="tn-preview-block">
          <p className="t-caption tn-preview-label">Works with</p>
          <div className="tn-preview-chips">
            {shownApproaches.map((a) => <span key={a} className="chip chip-intake">{a.replace(/_/g, ' ')}</span>)}
            {moreApproaches > 0 && <span className="chip chip-intake">+{moreApproaches} more</span>}
          </div>
        </div>
      )}

      {formData.consultation_fee && (
        <div className="tn-preview-block">
          <p className="t-caption tn-preview-label">Fee</p>
          <p className="t-body-s">
            {formatFeeINR(formData.consultation_fee)}
            {formData.fee_notes ? ` · ${formData.fee_notes}` : ''}
          </p>
        </div>
      )}

      {faqs.length > 0 && (
        <div className="tn-preview-block">
          <p className="t-caption tn-preview-label">FAQ</p>
          {faqs.slice(0, 3).map((f, i) => (
            <div key={i} style={{ marginTop: i > 0 ? '8px' : 0 }}>
              <p className="t-body-s" style={{ fontWeight: 600, margin: 0 }}>{f.question}</p>
              <p className="t-caption" style={{ margin: '2px 0 0' }}>{f.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProfilePreview({ formData, variant, open, onClose, triggerRef }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (variant === 'inline' || !open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      triggerRef?.current?.focus()
    }
  }, [variant, open])

  if (variant === 'inline') {
    return (
      <aside className="tn-preview tn-preview--inline" aria-label="Live preview">
        <p className="t-caption tn-preview-heading">Live preview</p>
        <div className="tn-preview-phone">
          <PreviewContent formData={formData} />
        </div>
      </aside>
    )
  }

  if (!open) return null

  const isDialog = variant === 'dialog'

  return (
    <div className={`tn-preview-backdrop${isDialog ? ' tn-preview-backdrop--dialog' : ''}`} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Public profile preview"
        tabIndex={-1}
        className={`tn-preview tn-preview--${isDialog ? 'dialog' : 'sheet'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tn-preview-head">
          <p className="t-h3" style={{ margin: 0 }}>Preview</p>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close preview" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className={isDialog ? 'tn-preview-page-full' : 'tn-preview-phone'}>
          <PreviewContent formData={formData} />
        </div>
      </div>
    </div>
  )
}
