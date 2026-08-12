/**
 * KPICard Component - Mini Variant
 * Patch 1.2.2 — Summary Cards Refinement
 *
 * This component uses the mini card style (128px, with-support
 * modifier) to match the elegant, narrower KPI cards introduced
 * on the Payments page, rather than the larger 136px analytics
 * variant previously used here.
 */

const ICON_SEMANTIC_MAP = {
  primary: 'indigo',
  green: 'revenue',
  blue: 'analytics',
  amber: 'payments',
  red: 'payments',
  purple: 'assessments',
  gray: 'default',
}

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

export default function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'primary',
  onClick,
  className = '',
}) {
  const semantic = ICON_SEMANTIC_MAP[color] || 'default'
  const iconBgColor = ICON_BG_COLORS[semantic]
  const iconColor = ICON_COLORS[semantic]

  return (
    <div
      onClick={onClick}
      className={`summary-card-mini ${subtitle ? 'summary-card-mini--with-support' : ''} ${onClick ? 'summary-card-interactive' : ''} ${className}`}
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
              strokeWidth={1.5}
            />
          </div>
        )}
      </div>

      {/* Value - the primary metric */}
      <p className="summary-card-amount">{value}</p>

      {/* Supporting text - single line context */}
      {subtitle && (
        <p className="summary-card-supporting">{subtitle}</p>
      )}
    </div>
  )
}
