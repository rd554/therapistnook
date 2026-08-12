import { useId } from 'react'

export default function FormField({
  label,
  description,
  error,
  required = false,
  children,
  className = '',
  id: providedId,
}) {
  const generatedId = useId()
  const fieldId = providedId || generatedId
  const descriptionId = description ? `${fieldId}-description` : undefined
  const errorId = error ? `${fieldId}-error` : undefined

  return (
    <div className={className}>
      <label 
        htmlFor={fieldId}
        className={`label ${required ? 'label-required' : ''}`}
      >
        {label}
        {required && <span className="sr-only">(required)</span>}
      </label>
      {description && (
        <p id={descriptionId} className="helper-text -mt-1 mb-2">
          {description}
        </p>
      )}
      <div>
        {typeof children === 'function' 
          ? children({ id: fieldId, 'aria-describedby': [descriptionId, errorId].filter(Boolean).join(' ') || undefined })
          : children
        }
      </div>
      {error && (
        <p id={errorId} className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
