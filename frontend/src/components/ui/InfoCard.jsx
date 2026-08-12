import { ChevronRight } from 'lucide-react'

const VARIANT_STYLES = {
  default: {
    bg: 'bg-white',
    border: '',
    iconBg: 'bg-primary-light',
    iconColor: 'text-primary',
  },
  highlight: {
    bg: 'bg-primary-light',
    border: '',
    iconBg: 'bg-white',
    iconColor: 'text-primary',
  },
  warning: {
    bg: 'bg-warning-bg',
    border: 'border-l-4 border-l-warning',
    iconBg: 'bg-white',
    iconColor: 'text-warning-text',
  },
  info: {
    bg: 'bg-info-bg',
    border: 'border-l-4 border-l-info',
    iconBg: 'bg-white',
    iconColor: 'text-info-text',
  },
  success: {
    bg: 'bg-success-bg',
    border: 'border-l-4 border-l-success',
    iconBg: 'bg-white',
    iconColor: 'text-success-text',
  },
  error: {
    bg: 'bg-error-bg',
    border: 'border-l-4 border-l-error',
    iconBg: 'bg-white',
    iconColor: 'text-error-text',
  },
}

export function InfoCard({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className = '',
}) {
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.default

  return (
    <div className={`card ${styles.bg} ${styles.border} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {Icon && (
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.iconBg}`}>
              <Icon className={`h-5 w-5 ${styles.iconColor}`} strokeWidth={1.8} />
            </div>
          )}
          <div>
            {title && <h3 className="font-medium text-content-primary">{title}</h3>}
            {description && <p className="mt-1 text-secondary">{description}</p>}
          </div>
        </div>
        {action && (
          <div className="shrink-0">
            {action}
          </div>
        )}
      </div>
    </div>
  )
}

export function LinkCard({
  icon: Icon,
  title,
  subtitle,
  href,
  onClick,
  disabled = false,
  className = '',
}) {
  const Component = href ? 'a' : 'button'
  const props = href ? { href } : { onClick, type: 'button' }

  return (
    <Component
      {...props}
      disabled={disabled}
      className={`
        card card-hover text-left w-full
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="card-header-icon">
              <Icon strokeWidth={1.8} />
            </div>
          )}
          <div>
            <h3 className="card-header-title">{title}</h3>
            {subtitle && <p className="card-header-subtitle">{subtitle}</p>}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-content-muted" strokeWidth={1.8} />
      </div>
    </Component>
  )
}

export function ContactCard({
  icon: Icon,
  value,
  href,
  placeholder = 'Not provided',
  className = '',
}) {
  const hasValue = !!value

  if (!hasValue) {
    return (
      <div className={`flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-content-muted ${className}`}>
        {Icon && <Icon className="h-4 w-4" strokeWidth={1.8} />}
        {placeholder}
      </div>
    )
  }

  return (
    <a
      href={href}
      className={`
        flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-content-secondary
        transition-colors hover:border-primary-200 hover:bg-primary-light hover:text-primary
        ${className}
      `}
    >
      {Icon && <Icon className="h-4 w-4" strokeWidth={1.8} />}
      {value}
    </a>
  )
}

export function StatInfoCard({
  label,
  value,
  icon: Icon,
  action,
  className = '',
}) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-caption">{label}</p>
          <p className="mt-1 text-xl font-bold text-content-primary">{value}</p>
        </div>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
            <Icon className="h-5 w-5 text-primary" strokeWidth={1.8} />
          </div>
        )}
      </div>
      {action && (
        <div className="mt-4 pt-4 border-t border-border-light">
          {action}
        </div>
      )}
    </div>
  )
}

export default InfoCard
