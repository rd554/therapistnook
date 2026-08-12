import { forwardRef } from 'react'
import { ChevronRight } from 'lucide-react'

export const Card = forwardRef(function Card({
  children,
  hover = false,
  size = 'default',
  className = '',
  as: Component = 'div',
  ...props
}, ref) {
  const sizeClasses = {
    default: 'card',
    medium: 'card-medium',
    compact: 'card-compact',
  }

  const baseClass = sizeClasses[size] || sizeClasses.default
  const hoverClass = hover ? 'card-hover' : ''

  return (
    <Component
      ref={ref}
      className={`${baseClass} ${hoverClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  )
})

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  actionLabel,
  actionHref,
  children,
  simple = false,
  className = '',
}) {
  if (children) {
    return (
      <div className={`${simple ? 'card-header-simple' : 'card-header'} ${className}`}>
        {children}
      </div>
    )
  }

  const ActionComponent = actionHref ? 'a' : 'button'
  const actionProps = actionHref ? { href: actionHref } : { onClick: action }

  return (
    <div className={`${simple ? 'card-header-simple' : 'card-header'} ${className}`}>
      <div className="card-header-left">
        {Icon && (
          <div className="card-header-icon">
            <Icon strokeWidth={1.8} />
          </div>
        )}
        <div className="card-header-content">
          <h3 className="card-header-title">{title}</h3>
          {subtitle && <p className="card-header-subtitle">{subtitle}</p>}
        </div>
      </div>
      {(action || actionHref) && actionLabel && (
        <ActionComponent {...actionProps} className="card-header-action">
          {actionLabel}
        </ActionComponent>
      )}
    </div>
  )
}

export function CardContent({ children, className = '' }) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '' }) {
  return (
    <div className={`card-footer ${className}`}>
      {children}
    </div>
  )
}

export function CardGrid({ children, cols = 2, gap = 'default', className = '' }) {
  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  }

  const gapClass = {
    default: 'gap-6',
    tight: 'gap-4',
    loose: 'gap-8',
  }

  return (
    <div className={`grid ${colsClass[cols] || colsClass[2]} ${gapClass[gap] || gapClass.default} ${className}`}>
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  semantic = 'default',
  variant = 'summary',
  className = '',
}) {
  const ICON_BG_COLORS = {
    revenue: '#DCFCE7',
    mint: '#DCFCE7',
    sessions: '#EEF2FF',
    indigo: '#EEF2FF',
    payments: '#FEF3C7',
    amber: '#FEF3C7',
    assessments: '#F3E8FF',
    lavender: '#F3E8FF',
    analytics: '#DBEAFE',
    sky: '#DBEAFE',
    default: '#EEF2FF',
  }

  const ICON_COLORS = {
    revenue: '#15803D',
    mint: '#15803D',
    sessions: '#4F46E5',
    indigo: '#4F46E5',
    payments: '#B45309',
    amber: '#B45309',
    assessments: '#7C3AED',
    lavender: '#7C3AED',
    analytics: '#1D4ED8',
    sky: '#1D4ED8',
    default: '#4F46E5',
  }

  const VARIANT_CLASSES = {
    summary: 'summary-card',
    analytics: 'summary-card-analytics',
    mini: 'summary-card-mini',
  }

  const changeColors = {
    positive: 'text-success-text',
    negative: 'text-error-text',
    neutral: 'text-content-muted',
  }

  const iconBgColor = ICON_BG_COLORS[semantic] || ICON_BG_COLORS.default
  const iconColor = ICON_COLORS[semantic] || ICON_COLORS.default
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.summary

  return (
    <div className={`${variantClass} ${className}`}>
      {/* Header row: Title + Icon aligned */}
      <div className="summary-card-header">
        <p className="summary-card-title">{label}</p>
        {Icon && (
          <div
            className="summary-card-icon"
            style={{ background: iconBgColor }}
          >
            <Icon
              style={{ color: iconColor }}
              strokeWidth={1.8}
            />
          </div>
        )}
      </div>

      {/* Value */}
      <p className="summary-card-amount">{value}</p>

      {/* Supporting text */}
      {change && (
        <p className={`summary-card-supporting ${changeColors[changeType]}`}>
          {change}
        </p>
      )}
    </div>
  )
}

export function LinkCard({
  icon: Icon,
  title,
  subtitle,
  href,
  onClick,
  className = '',
}) {
  const Component = href ? 'a' : 'button'
  const props = href ? { href } : { onClick }

  return (
    <Component
      {...props}
      className={`card card-hover text-left w-full ${className}`}
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
        <ChevronRight style={{ width: '20px', height: '20px' }} className="text-content-muted" strokeWidth={1.8} />
      </div>
    </Component>
  )
}

export default Card
