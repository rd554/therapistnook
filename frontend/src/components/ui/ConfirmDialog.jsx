import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Trash2, X, Info } from 'lucide-react'

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) {
  const dialogRef = useRef(null)
  const confirmButtonRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      confirmButtonRef.current?.focus()
      
      const handleEscape = (e) => {
        if (e.key === 'Escape' && !isLoading) {
          onClose()
        }
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isLoading, onClose])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const variants = {
    danger: {
      icon: Trash2,
      iconBg: 'bg-error-bg',
      iconColor: 'text-error-text',
      buttonClass: 'bg-error-text hover:bg-red-700 text-white',
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-warning-bg',
      iconColor: 'text-warning-text',
      buttonClass: 'bg-warning-text hover:bg-amber-700 text-white',
    },
    info: {
      icon: Info,
      iconBg: 'bg-info-bg',
      iconColor: 'text-info-text',
      buttonClass: 'btn-primary',
    },
  }

  const styles = variants[variant] || variants.danger
  const IconComponent = styles.icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div 
        className="modal-overlay"
        onClick={!isLoading ? onClose : undefined}
        aria-hidden="true"
      />
      
      <div
        ref={dialogRef}
        className="modal-content relative max-w-md w-full"
      >
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-6 right-6 btn-icon disabled:opacity-50"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 ${styles.iconBg} rounded-full flex items-center justify-center`}>
            <IconComponent className={`w-6 h-6 ${styles.iconColor}`} strokeWidth={1.5} aria-hidden="true" />
          </div>
          
          <div className="flex-1 min-w-0 pt-1">
            <h3 id="confirm-dialog-title" className="text-h3 text-content-primary">
              {title}
            </h3>
            <p className="mt-2 text-body text-content-secondary">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-8 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn-secondary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-btn transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] ${
              variant === 'info' ? '' : styles.buttonClass
            }`}
            style={variant === 'info' ? { background: 'linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)' } : undefined}
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function useConfirmDialog() {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    variant: 'danger',
  })

  const confirm = ({ title, message, onConfirm, variant = 'danger' }) => {
    setState({
      isOpen: true,
      title,
      message,
      onConfirm,
      variant,
    })
  }

  const close = () => {
    setState(prev => ({ ...prev, isOpen: false }))
  }

  return {
    ...state,
    confirm,
    close,
  }
}

export default ConfirmDialog
