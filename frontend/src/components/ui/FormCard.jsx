import { ArrowLeft } from 'lucide-react'

export function FormCard({
  title,
  subtitle,
  onBack,
  children,
  className = '',
}) {
  return (
    <div className={`card ${className}`}>
      {(title || onBack) && (
        <div className="flex items-center gap-4 mb-6">
          {onBack && (
            <button
              onClick={onBack}
              className="rounded-lg p-1 text-content-secondary hover:bg-slate-100 hover:text-content-primary transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            {title && <h2 className="text-section-title">{title}</h2>}
            {subtitle && <p className="mt-1 text-secondary">{subtitle}</p>}
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

export function FormField({
  label,
  hint,
  error,
  required,
  children,
  className = '',
}) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-error-text ml-0.5">*</span>}
        </label>
      )}
      {hint && <p className="helper-text mb-1.5">{hint}</p>}
      {children}
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

export function FormSection({
  title,
  description,
  children,
  className = '',
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-card-title">{title}</h3>}
          {description && <p className="mt-1 text-secondary">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

export function FormActions({
  children,
  className = '',
  align = 'left',
}) {
  const alignClasses = {
    left: 'justify-start',
    right: 'justify-end',
    center: 'justify-center',
    between: 'justify-between',
  }

  return (
    <div className={`flex flex-wrap gap-3 pt-6 border-t border-border-light mt-6 ${alignClasses[align]} ${className}`}>
      {children}
    </div>
  )
}

export function FormGrid({
  children,
  cols = 2,
  className = '',
}) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }

  return (
    <div className={`grid gap-4 ${colClasses[cols] || colClasses[2]} ${className}`}>
      {children}
    </div>
  )
}

export function FormRow({
  children,
  className = '',
}) {
  return (
    <div className={`flex flex-wrap gap-4 ${className}`}>
      {children}
    </div>
  )
}

export default FormCard
