import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export function SectionDropdown({
  value,
  onChange,
  options,
  className = '',
  maxWidth = '220px',
  variant = 'default',
  align = 'left',
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selectedOption = options.find(opt => opt.value === value)

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const variantClasses = {
    default: 'input-field-sm',
    grey: 'input-field-sm section-dropdown-grey',
    sage: 'input-field-sm section-dropdown-sage',
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} style={{ maxWidth }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${variantClasses[variant]} w-full !pr-8 font-medium text-content-primary !text-left cursor-pointer truncate`}
      >
        {selectedOption?.completed ? '✓ ' : ''}{selectedOption?.label}{selectedOption?.badge ? ` (${selectedOption.badge})` : ''}
      </button>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted pointer-events-none" />

      {open && (
        <div
          role="listbox"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-30 mt-1 w-max min-w-full max-w-[240px] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg`}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                opt.value === value ? 'font-medium text-content-primary' : 'text-content-secondary'
              }`}
            >
              <Check className={`h-3.5 w-3.5 shrink-0 text-primary ${opt.value === value ? 'opacity-100' : 'opacity-0'}`} />
              <span className="truncate">{opt.label}{opt.badge ? ` (${opt.badge})` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RowCard({ children, onClick, className = '', hoverable = true }) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm 
        ${hoverable ? 'hover:shadow-card-hover' : ''} 
        transition-all
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

export function RowCardHeader({ children, className = '' }) {
  return (
    <div className={`bg-slate-100 rounded-2xl px-4 py-3 text-sm font-medium text-content-secondary ${className}`}>
      {children}
    </div>
  )
}
