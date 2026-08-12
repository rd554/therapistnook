import { forwardRef } from 'react'

const SEMANTIC_STYLES = {
  default: {
    iconBg: '#EEF2FF',
    iconColor: '#4F46E5',
  },
  success: {
    iconBg: '#DCFCE7',
    iconColor: '#15803D',
  },
  warning: {
    iconBg: '#FEF3C7',
    iconColor: '#B45309',
  },
  error: {
    iconBg: '#FEE2E2',
    iconColor: '#DC2626',
  },
  info: {
    iconBg: '#DBEAFE',
    iconColor: '#1D4ED8',
  },
  revenue: {
    iconBg: '#DCFCE7',
    iconColor: '#15803D',
  },
  sessions: {
    iconBg: '#EEF2FF',
    iconColor: '#4F46E5',
  },
  payments: {
    iconBg: '#FEF3C7',
    iconColor: '#B45309',
  },
  assessments: {
    iconBg: '#F3E8FF',
    iconColor: '#7C3AED',
  },
  analytics: {
    iconBg: '#DBEAFE',
    iconColor: '#1D4ED8',
  },
}

const CHANGE_STYLES = {
  positive: 'text-success-text',
  negative: 'text-error-text',
  neutral: 'text-content-muted',
}

export const MetricCard = forwardRef(function MetricCard({
  icon: Icon,
  label,
  value,
  change,
  changeType = 'neutral',
  semantic = 'default',
  variant = 'default',
  onClick,
  className = '',
}, ref) {
  const styles = SEMANTIC_STYLES[semantic] || SEMANTIC_STYLES.default

  const variantClasses = {
    default: 'summary-card',
    mini: 'summary-card-mini',
    analytics: 'summary-card-analytics',
  }

  const isClickable = !!onClick

  return (
    <div
      ref={ref}
      className={`
        ${variantClasses[variant] || variantClasses.default}
        ${isClickable ? 'summary-card-interactive cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="summary-card-header">
        <p className="summary-card-title">{label}</p>
        {Icon && (
          <div
            className="summary-card-icon"
            style={{ background: styles.iconBg }}
          >
            <Icon
              style={{ color: styles.iconColor }}
              strokeWidth={1.8}
            />
          </div>
        )}
      </div>

      <p className="summary-card-amount">{value}</p>

      {change && (
        <p className={`summary-card-supporting ${CHANGE_STYLES[changeType]}`}>
          {change}
        </p>
      )}
    </div>
  )
})

export function MetricCardGrid({
  children,
  cols = 4,
  className = '',
}) {
  const colClasses = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }

  return (
    <div className={`grid gap-4 ${colClasses[cols] || colClasses[4]} ${className}`}>
      {children}
    </div>
  )
}

export function MetricCardMini({
  icon: Icon,
  label,
  value,
  semantic = 'default',
  className = '',
}) {
  return (
    <MetricCard
      icon={Icon}
      label={label}
      value={value}
      semantic={semantic}
      variant="mini"
      className={className}
    />
  )
}

export default MetricCard
