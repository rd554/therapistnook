import { Check, Clock, X, AlertCircle, FileText, Calendar, Loader2 } from 'lucide-react'

const STATUS_CONFIG = {
  active: {
    label: 'Active',
    bg: 'bg-success-bg',
    text: 'text-success-text',
    icon: Check,
  },
  archived: {
    label: 'Archived',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    icon: null,
  },
  completed: {
    label: 'Completed',
    bg: 'bg-success-bg',
    text: 'text-success-text',
    icon: Check,
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-warning-bg',
    text: 'text-warning-text',
    icon: Clock,
  },
  pending: {
    label: 'Pending',
    bg: 'bg-warning-bg',
    text: 'text-warning-text',
    icon: Clock,
  },
  new_intake: {
    label: 'New Intake',
    bg: 'bg-warning-bg',
    text: 'text-warning-text',
    icon: Clock,
  },
  not_started: {
    label: 'Not Started',
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    icon: FileText,
  },
  scheduled: {
    label: 'Scheduled',
    bg: 'bg-info-bg',
    text: 'text-info-text',
    icon: Calendar,
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-error-bg',
    text: 'text-error-text',
    icon: X,
  },
  failed: {
    label: 'Failed',
    bg: 'bg-error-bg',
    text: 'text-error-text',
    icon: AlertCircle,
  },
  paid: {
    label: 'Paid',
    bg: 'bg-success-bg',
    text: 'text-success-text',
    icon: Check,
  },
  unpaid: {
    label: 'Unpaid',
    bg: 'bg-warning-bg',
    text: 'text-warning-text',
    icon: Clock,
  },
  overdue: {
    label: 'Overdue',
    bg: 'bg-error-bg',
    text: 'text-error-text',
    icon: AlertCircle,
  },
  refunded: {
    label: 'Refunded',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    icon: null,
  },
  expired: {
    label: 'Expired',
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    icon: null,
  },
  no_show: {
    label: 'No Show',
    bg: 'bg-warning-bg',
    text: 'text-warning-text',
    icon: AlertCircle,
  },
  rescheduled: {
    label: 'Rescheduled',
    bg: 'bg-info-bg',
    text: 'text-info-text',
    icon: Calendar,
  },
  processing: {
    label: 'Processing',
    bg: 'bg-info-bg',
    text: 'text-info-text',
    icon: Loader2,
  },
  draft: {
    label: 'Draft',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    icon: null,
  },
}

export function StatusChip({
  status,
  label: customLabel,
  showIcon = true,
  size = 'md',
  className = '',
}) {
  const config = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG[status] || {
    label: status || 'Unknown',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    icon: null,
  }

  const displayLabel = customLabel || config.label
  const Icon = config.icon

  const sizeClasses = {
    sm: 'px-2.5 py-0.5 text-[13px] gap-1',
    md: 'px-3 py-1 text-[13px] gap-1.5',
    lg: 'px-3.5 py-1 text-sm gap-2',
  }

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  }

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full whitespace-nowrap
        ${config.bg} ${config.text}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {showIcon && Icon && (
        <Icon 
          className={`${iconSizes[size]} ${status === 'processing' ? 'animate-spin' : ''}`} 
          strokeWidth={2} 
        />
      )}
      {displayLabel}
    </span>
  )
}

export function IntakeStatusChip({ status, size = 'md', className = '' }) {
  const statusMap = {
    completed: 'completed',
    in_progress: 'in_progress',
    not_started: 'not_started',
  }

  const labelMap = {
    completed: 'Done',
    in_progress: 'In Progress',
    not_started: 'Not Started',
  }

  const mappedStatus = statusMap[status] || 'not_started'

  return (
    <StatusChip
      status={mappedStatus}
      label={labelMap[status] || labelMap.not_started}
      size={size}
      className={className}
    />
  )
}

export function PaymentStatusChip({ status, size = 'md', className = '' }) {
  return (
    <StatusChip
      status={status}
      size={size}
      className={className}
    />
  )
}

export function SessionStatusChip({ status, size = 'md', className = '' }) {
  return (
    <StatusChip
      status={status}
      size={size}
      className={className}
    />
  )
}

export default StatusChip
