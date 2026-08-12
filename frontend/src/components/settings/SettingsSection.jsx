import { Loader2 } from 'lucide-react'

export default function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  actions,
  actionLabel,
  onAction,
  loading = false,
  className = '',
}) {
  return (
    <div className={`card ${className}`}>
      <div className="card-header">
        <div className="card-header-left">
          {Icon && (
            <div className="card-header-icon">
              <Icon strokeWidth={1.5} />
            </div>
          )}
          <div className="card-header-content">
            <h2 className="card-header-title">{title}</h2>
            {description && (
              <p className="card-header-subtitle">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
        {onAction && actionLabel && (
          <button onClick={onAction} className="card-header-action">
            {actionLabel}
          </button>
        )}
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2} style={{ color: 'var(--color-primary)' }} />
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  )
}
