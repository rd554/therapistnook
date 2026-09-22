// Section navigation for the Public Profile editor: a two-group rail on
// desktop/tablet (>=1024px, xl and lg), a custom dropdown switcher on
// mobile. The dropdown is a 1:1 reuse of the pattern already shipped on
// PatientProfile.jsx (button[aria-haspopup] + .menu-popover of .menu-item
// buttons, closed on outside click) — per spec, since that page's mobile
// section switcher is already a custom dropdown, not a native <select>.
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export const PROFILE_SECTIONS = [
  { id: 'basic', label: 'Basic info', group: 'public' },
  { id: 'professional', label: 'Professional', group: 'public' },
  { id: 'contact', label: 'Contact', group: 'public' },
  { id: 'onboarding', label: 'Onboarding', group: 'public' },
  { id: 'resources', label: 'Resources', group: 'public' },
  { id: 'account', label: 'Notifications & security', group: 'private' },
]

export default function SectionNav({ active, onChange, missingCount, variant, sections }) {
  const list = sections || PROFILE_SECTIONS
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const badge = (id) => (id === 'basic' && missingCount > 0 ? missingCount : null)
  const activeLabel = list.find((s) => s.id === active)?.label || ''

  if (variant === 'dropdown') {
    return (
      <div ref={ref} className="grow tn-section-switcher" style={{ position: 'relative' }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'space-between' }}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {activeLabel}
          {badge(active) != null && <span className="tn-rail-badge">{badge(active)}</span>}
          <ChevronDown size={16} strokeWidth={1.5} />
        </button>
        {open && (
          <div className="menu-popover" style={{ width: '100%' }}>
            {list.filter((s) => s.group === 'public').map((s) => (
              <button
                key={s.id}
                type="button"
                className="menu-item"
                aria-current={active === s.id ? 'page' : undefined}
                onClick={() => { onChange(s.id); setOpen(false) }}
              >
                {s.label}
                {badge(s.id) != null && <span className="tn-rail-badge">{badge(s.id)}</span>}
              </button>
            ))}
            <div className="tn-rail-divider" role="separator" />
            {list.filter((s) => s.group === 'private').map((s) => (
              <button
                key={s.id}
                type="button"
                className="menu-item"
                aria-current={active === s.id ? 'page' : undefined}
                onClick={() => { onChange(s.id); setOpen(false) }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderGroup = (group, heading) => (
    <div className="tn-rail-group">
      <p className="t-caption tn-rail-heading">{heading}</p>
      {list.filter((s) => s.group === group).map((s) => (
        <button
          key={s.id}
          type="button"
          className={`tn-rail-item${active === s.id ? ' is-active' : ''}`}
          aria-current={active === s.id ? 'page' : undefined}
          onClick={() => onChange(s.id)}
        >
          <span className="tn-rail-dot" aria-hidden="true" />
          {s.label}
          {badge(s.id) != null && <span className="tn-rail-badge">{badge(s.id)}</span>}
        </button>
      ))}
    </div>
  )

  return (
    <nav className="tn-rail" aria-label="Profile editor sections">
      {renderGroup('public', 'Shown on your page')}
      <div className="tn-rail-divider" role="separator" />
      {renderGroup('private', 'Private to you')}
    </nav>
  )
}
