import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const variants = {
  success: {
    className: 'alert-success',
    icon: CheckCircle,
  },
  error: {
    className: 'alert-error',
    icon: XCircle,
  },
  warning: {
    className: 'alert-warning',
    icon: AlertTriangle,
  },
  info: {
    className: 'alert-info',
    icon: Info,
  },
}

export function Alert({
  variant = 'info',
  title,
  children,
  onDismiss,
  className = '',
}) {
  const styles = variants[variant] || variants.info
  const IconComponent = styles.icon

  return (
    <div
      className={`${styles.className} ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-shrink-0">
        <IconComponent className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <h3 className="text-sm font-medium">
            {title}
          </h3>
        )}
        {children && (
          <div className={`${title ? 'mt-1' : ''} text-sm opacity-90`}>
            {children}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity duration-150 touch-target flex items-center justify-center -mr-1"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

export function FormError({ message }) {
  if (!message) return null

  return (
    <p className="error-text" role="alert">
      {message}
    </p>
  )
}

export function FieldError({ error }) {
  if (!error) return null

  return (
    <span className="error-text" role="alert">
      {error}
    </span>
  )
}

export function SuccessMessage({ message, onDismiss }) {
  if (!message) return null

  return (
    <Alert variant="success" onDismiss={onDismiss}>
      {message}
    </Alert>
  )
}

export function ErrorMessage({ message, onDismiss, onRetry }) {
  if (!message) return null

  return (
    <Alert variant="error" onDismiss={onDismiss}>
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="font-medium underline underline-offset-2 hover:no-underline transition-all duration-150"
          >
            Try again
          </button>
        )}
      </div>
    </Alert>
  )
}

export default Alert
