/**
 * Universal Summary Card Component
 * Premium Healthcare Design System
 * 
 * Design Philosophy:
 * - Calm, elegant, spacious, easily scannable
 * - Whitespace creates hierarchy
 * - Number: 36px SemiBold (not bold, not dominating)
 * - Subtitle: 14px Muted
 * 
 * Design Direction: Apple Health + Linear + Stripe
 */

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

export default function SummaryCard({
  title,
  amount,
  supportingText,
  icon: Icon,
  semantic = 'default',
  variant = 'summary',
  onClick,
  className = '',
}) {
  const iconBgColor = ICON_BG_COLORS[semantic] || ICON_BG_COLORS.default
  const iconColor = ICON_COLORS[semantic] || ICON_COLORS.default
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.summary

  return (
    <div
      onClick={onClick}
      className={`${variantClass} ${onClick ? 'summary-card-interactive' : ''} ${className}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Header row: Title + Icon aligned */}
      <div className="summary-card-header">
        <p className="summary-card-title">{title}</p>
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

      {/* Value - 36px SemiBold, not dominating */}
      <p className="summary-card-amount">{amount}</p>

      {/* Supporting text - 14px muted */}
      {supportingText && (
        <p className="summary-card-supporting">{supportingText}</p>
      )}
    </div>
  )
}
