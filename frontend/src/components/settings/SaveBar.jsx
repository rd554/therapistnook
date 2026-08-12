import { Loader2, Check, AlertCircle } from 'lucide-react'

export default function SaveBar({
  show,
  saving,
  saved,
  error,
  onSave,
  onCancel,
  saveLabel = 'Save Changes',
  cancelLabel = 'Cancel',
}) {
  if (!show && !saving && !saved && !error) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 backdrop-blur-md p-4 shadow-lg lg:left-60">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          {saving && (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" strokeWidth={2} />
              <span className="text-body text-content-secondary">Saving changes...</span>
            </>
          )}
          {saved && !saving && (
            <>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success-bg">
                <Check className="h-4 w-4 text-success-text" strokeWidth={2} />
              </div>
              <span className="text-body text-success-text">Changes saved</span>
            </>
          )}
          {error && !saving && (
            <>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-error-bg">
                <AlertCircle className="h-4 w-4 text-error-text" strokeWidth={2} />
              </div>
              <span className="text-body text-error-text">{error}</span>
            </>
          )}
          {!saving && !saved && !error && (
            <span className="text-body text-content-secondary">You have unsaved changes</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="btn-secondary"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                Saving...
              </>
            ) : (
              saveLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
