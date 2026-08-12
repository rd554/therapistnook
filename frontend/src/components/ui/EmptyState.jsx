import { 
  Inbox, Search, FileX, Users, Calendar, CreditCard, FolderOpen, 
  ClipboardList, BarChart3, Activity, Brain, Mic, FileText, Upload,
  Plus, MessageSquare
} from 'lucide-react'

const icons = {
  inbox: Inbox,
  search: Search,
  file: FileX,
  users: Users,
  calendar: Calendar,
  payment: CreditCard,
  folder: FolderOpen,
  clipboard: ClipboardList,
  chart: BarChart3,
  activity: Activity,
  brain: Brain,
  mic: Mic,
  document: FileText,
  upload: Upload,
  plus: Plus,
  message: MessageSquare,
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  actionLabel,
  actionIcon: ActionIcon,
  secondaryAction,
  secondaryActionLabel,
  compact = false,
  className = '',
}) {
  const IconComponent = typeof icon === 'string' ? (icons[icon] || Inbox) : icon

  return (
    <div className={`empty-state ${compact ? 'py-10' : ''} ${className}`}>
      <div className="empty-state-icon">
        <IconComponent strokeWidth={1.5} aria-hidden="true" />
      </div>
      
      {title && (
        <h3 className="empty-state-title">
          {title}
        </h3>
      )}
      
      {description && (
        <p className="empty-state-description">
          {description}
        </p>
      )}
      
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {action && actionLabel && (
            <button
              onClick={action}
              className="btn-primary"
            >
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {actionLabel}
            </button>
          )}
          {secondaryAction && secondaryActionLabel && (
            <button
              onClick={secondaryAction}
              className="btn-secondary"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function NoResults({ searchTerm, onClear }) {
  return (
    <EmptyState
      icon="search"
      title="No results found"
      description={
        searchTerm
          ? `No results found for "${searchTerm}". Try adjusting your search or filters.`
          : 'No results match your current filters.'
      }
      action={onClear}
      actionLabel="Clear filters"
    />
  )
}

export function NoPatients({ onAdd }) {
  return (
    <EmptyState
      icon="users"
      title="No patients yet"
      description="Add your first patient to get started with clinical management."
      action={onAdd}
      actionLabel="Add Patient"
    />
  )
}

export function NoAppointments({ onSchedule }) {
  return (
    <EmptyState
      icon="calendar"
      title="No appointments"
      description="You don't have any appointments scheduled. Create one to get started."
      action={onSchedule}
      actionLabel="Schedule Appointment"
    />
  )
}

export function NoDocuments({ onUpload }) {
  return (
    <EmptyState
      icon="folder"
      title="No documents"
      description="No documents have been uploaded yet. Upload clinical documents to keep records organized."
      action={onUpload}
      actionLabel="Upload Document"
    />
  )
}

export function NoPayments() {
  return (
    <EmptyState
      icon="payment"
      title="No payments"
      description="No payment records found. Payments will appear here once appointments are scheduled."
    />
  )
}

export function NoAssessments({ onStart }) {
  return (
    <EmptyState
      icon="clipboard"
      title="No assessments"
      description="Start a new assessment to evaluate your patient using standardized psychological measures."
      action={onStart}
      actionLabel="Start Assessment"
    />
  )
}

export function NoAnalytics() {
  return (
    <EmptyState
      icon="chart"
      title="No data yet"
      description="Analytics will appear here once you have patient sessions and assessments recorded."
    />
  )
}

export function NoSessions({ onSchedule }) {
  return (
    <EmptyState
      icon="calendar"
      title="No sessions found"
      description="Schedule a therapy session to get started."
      action={onSchedule}
      actionLabel="Schedule Session"
      actionIcon={Plus}
    />
  )
}

export function NoSessionRecordings({ onUpload }) {
  return (
    <EmptyState
      icon="mic"
      title="No session recordings"
      description="Upload therapy session recordings for transcription and analysis."
      action={onUpload}
      actionLabel="Upload Session"
      actionIcon={Upload}
    />
  )
}

export function NoClinicalIntelligence({ onProcess }) {
  return (
    <EmptyState
      icon="brain"
      title="No intelligence data yet"
      description="Clinical Intelligence will automatically build as you add clinical history, documents, and session recordings."
      action={onProcess}
      actionLabel="Process Available Data"
    />
  )
}

export function NoActivity() {
  return (
    <EmptyState
      icon="activity"
      title="No activity yet"
      description="Activity will appear here as you work with this patient."
      compact
    />
  )
}

export function NoMessages() {
  return (
    <EmptyState
      icon="message"
      title="No messages"
      description="Messages and notifications will appear here."
      compact
    />
  )
}

export default EmptyState
