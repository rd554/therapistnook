// Page-local on/off switch. Not a reuse of components/settings/ToggleControl
// — that component is shared (rule: don't edit shared components for a new
// variant, ask first) and is hard-wired to `bg-primary` (the old purple),
// which this page must not use (accent-only, no green). Same sr-only-input +
// styled-track pattern, restyled onto .tn-profile's own switch tokens so it
// reads as one accent object, not a second color system.
export default function Switch({ id, checked, onChange, label, disabled = false }) {
  return (
    <label className="tn-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="tn-switch-input"
      />
      <span className="tn-switch-track" aria-hidden="true">
        <span className="tn-switch-thumb" />
      </span>
      {label && <span className="t-body-s tn-switch-label">{label}</span>}
    </label>
  )
}
