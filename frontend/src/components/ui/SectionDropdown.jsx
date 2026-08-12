import { ChevronDown, Check } from 'lucide-react'

export function SectionDropdown({ 
  value, 
  onChange, 
  options, 
  className = '',
  maxWidth = '220px',
  variant = 'default'
}) {
  const selectedOption = options.find(opt => opt.value === value)
  
  const variantClasses = {
    default: 'input-field-sm',
    sage: 'input-field-sm section-dropdown-sage',
  }
  
  return (
    <div className={`relative ${className}`} style={{ maxWidth }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${variantClasses[variant]} w-full pr-8 font-medium text-content-primary appearance-none cursor-pointer truncate`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.completed ? '✓ ' : ''}{opt.label}{opt.badge ? ` (${opt.badge})` : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted pointer-events-none" />
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
