const variants = {
  scheduled: 'badge-scheduled',
  completed: 'badge-completed',
  pending: 'badge-pending',
  cancelled: 'badge-cancelled',
  draft: 'badge-draft',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
  neutral: 'badge-neutral',
  primary: 'badge-primary',
}

export function Badge({ 
  children, 
  variant = 'neutral',
  size = 'md',
  className = '',
  dot = false,
}) {
  const variantClass = variants[variant] || variants.neutral
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  }

  return (
    <span className={`badge ${variantClass} ${sizeClasses[size]} ${className}`}>
      {dot && (
        <span 
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
            variant === 'success' ? 'bg-success-text' :
            variant === 'completed' ? 'bg-success-text' :
            variant === 'warning' ? 'bg-warning-text' :
            variant === 'pending' ? 'bg-warning-text' :
            variant === 'error' ? 'bg-error-text' :
            variant === 'cancelled' ? 'bg-error-text' :
            variant === 'info' ? 'bg-info-text' :
            variant === 'scheduled' ? 'bg-info-text' :
            variant === 'primary' ? 'bg-primary' :
            'bg-content-muted'
          }`}
        />
      )}
      {children}
    </span>
  )
}

export function StatusBadge({ status, className = '' }) {
  const statusConfig = {
    scheduled: { label: 'Scheduled', variant: 'scheduled' },
    confirmed: { label: 'Confirmed', variant: 'info' },
    completed: { label: 'Completed', variant: 'completed' },
    pending: { label: 'Pending', variant: 'pending' },
    cancelled: { label: 'Cancelled', variant: 'cancelled' },
    draft: { label: 'Draft', variant: 'draft' },
    active: { label: 'Active', variant: 'success' },
    inactive: { label: 'Inactive', variant: 'neutral' },
    paid: { label: 'Paid', variant: 'success' },
    unpaid: { label: 'Unpaid', variant: 'warning' },
    overdue: { label: 'Overdue', variant: 'error' },
    refunded: { label: 'Refunded', variant: 'neutral' },
  }

  const config = statusConfig[status?.toLowerCase()] || { label: status, variant: 'neutral' }

  return (
    <Badge variant={config.variant} dot className={className}>
      {config.label}
    </Badge>
  )
}

export function RoleBadge({ role, className = '' }) {
  const roleConfig = {
    owner: { label: 'Owner', variant: 'primary' },
    admin: { label: 'Admin', variant: 'primary' },
    practitioner: { label: 'Practitioner', variant: 'info' },
    patient: { label: 'Patient', variant: 'neutral' },
  }

  const config = roleConfig[role?.toLowerCase()] || { label: role, variant: 'neutral' }

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}

export function CountBadge({ count, className = '' }) {
  if (!count && count !== 0) return null

  return (
    <Badge variant="primary" size="sm" className={className}>
      {count > 99 ? '99+' : count}
    </Badge>
  )
}

export default Badge
