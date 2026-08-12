import { ArrowLeft } from 'lucide-react'

export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  onBack,
  badge,
  className = '',
}) {
  return (
    <div className={`card ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="mt-1 rounded-lg p-1 text-content-secondary hover:bg-slate-100 hover:text-content-primary transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex items-start gap-3">
            {Icon && (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light shrink-0">
                <Icon className="h-5 w-5 text-primary" strokeWidth={1.8} />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-section-title">{title}</h1>
                {badge}
              </div>
              {subtitle && (
                <p className="mt-1 text-secondary">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
        {action && (
          <div className="flex items-center gap-2 shrink-0">
            {action}
          </div>
        )}
      </div>
    </div>
  )
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  onBack,
  badge,
  className = '',
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-6 ${className}`}>
      <div className="flex items-start gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="mt-2 rounded-lg p-1 text-content-secondary hover:bg-slate-100 hover:text-content-primary transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light shrink-0">
              <Icon className="h-6 w-6 text-primary" strokeWidth={1.8} />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-page-title">{title}</h1>
              {badge}
            </div>
            {subtitle && (
              <p className="mt-2 text-secondary">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      {action && (
        <div className="flex items-center gap-3 shrink-0">
          {action}
        </div>
      )}
    </div>
  )
}

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  actionLabel,
  simple = false,
  className = '',
}) {
  return (
    <div className={`${simple ? 'flex items-center justify-between gap-4 mb-4' : 'card-header'} ${className}`}>
      <div className="flex items-start gap-3">
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
      {action && (
        typeof action === 'function' ? (
          <button onClick={action} className="card-header-action">
            {actionLabel || 'View all'}
          </button>
        ) : (
          action
        )
      )}
    </div>
  )
}

export default SectionHeader
