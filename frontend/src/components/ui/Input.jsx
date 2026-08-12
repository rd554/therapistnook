import { forwardRef } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

export const Input = forwardRef(function Input({
  label,
  error,
  helperText,
  required = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className = '',
  wrapperClassName = '',
  type = 'text',
  ...props
}, ref) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className={wrapperClassName}>
      {label && (
        <label className={`label ${required ? 'label-required' : ''}`}>
          {label}
        </label>
      )}
      <div className="relative">
        {LeftIcon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted">
            <LeftIcon className="w-5 h-5" strokeWidth={1.5} />
          </div>
        )}
        <input
          ref={ref}
          type={isPassword && showPassword ? 'text' : type}
          className={`input-field ${LeftIcon ? 'pl-12' : ''} ${RightIcon || isPassword || error ? 'pr-12' : ''} ${error ? 'border-error-text focus:border-error-text focus:ring-error-bg' : ''} ${className}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${props.id}-error` : helperText ? `${props.id}-helper` : undefined}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-5 h-5" strokeWidth={1.5} />
            ) : (
              <Eye className="w-5 h-5" strokeWidth={1.5} />
            )}
          </button>
        )}
        {!isPassword && RightIcon && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted">
            <RightIcon className="w-5 h-5" strokeWidth={1.5} />
          </div>
        )}
        {error && !isPassword && !RightIcon && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-error-text">
            <AlertCircle className="w-5 h-5" strokeWidth={1.5} />
          </div>
        )}
      </div>
      {error && (
        <p id={`${props.id}-error`} className="error-text" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={`${props.id}-helper`} className="helper-text">
          {helperText}
        </p>
      )}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({
  label,
  error,
  helperText,
  required = false,
  className = '',
  wrapperClassName = '',
  rows = 4,
  ...props
}, ref) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label className={`label ${required ? 'label-required' : ''}`}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        rows={rows}
        className={`textarea-field ${error ? 'border-error-text focus:border-error-text focus:ring-error-bg' : ''} ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${props.id}-error` : helperText ? `${props.id}-helper` : undefined}
        {...props}
      />
      {error && (
        <p id={`${props.id}-error`} className="error-text" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={`${props.id}-helper`} className="helper-text">
          {helperText}
        </p>
      )}
    </div>
  )
})

export const Select = forwardRef(function Select({
  label,
  error,
  helperText,
  required = false,
  options = [],
  placeholder = 'Select an option',
  className = '',
  wrapperClassName = '',
  ...props
}, ref) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label className={`label ${required ? 'label-required' : ''}`}>
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={`select-field ${error ? 'border-error-text focus:border-error-text focus:ring-error-bg' : ''} ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${props.id}-error` : helperText ? `${props.id}-helper` : undefined}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option 
            key={option.value} 
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${props.id}-error`} className="error-text" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={`${props.id}-helper`} className="helper-text">
          {helperText}
        </p>
      )}
    </div>
  )
})

export function FormGroup({ children, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {children}
    </div>
  )
}

export function FormSection({ title, description, children, className = '' }) {
  return (
    <div className={className}>
      {(title || description) && (
        <div className="mb-6">
          {title && <h3 className="section-title">{title}</h3>}
          {description && <p className="section-subtitle">{description}</p>}
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

export default Input
