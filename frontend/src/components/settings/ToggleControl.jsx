export default function ToggleControl({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 group">
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div
          className={`h-6 w-11 rounded-full transition-all duration-150 ${
            checked ? 'bg-primary' : 'bg-slate-200 group-hover:bg-slate-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-150 ${
              checked ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-body font-medium ${disabled ? 'text-content-muted' : 'text-content-primary'}`}>
          {label}
        </div>
        {description && (
          <p className={`mt-1 text-caption ${disabled ? 'text-content-muted' : 'text-content-secondary'}`}>
            {description}
          </p>
        )}
      </div>
    </label>
  )
}
