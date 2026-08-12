import { useState } from 'react'
import { Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import FormField from './FormField'

export default function ApiCredentialForm({
  fields,
  values,
  onChange,
  onTest,
  testStatus,
  testError,
  showTestButton = true,
  disabled = false,
}) {
  const [showSecrets, setShowSecrets] = useState({})

  const toggleSecret = (fieldId) => {
    setShowSecrets((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }))
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <FormField
          key={field.id}
          label={field.label}
          description={field.description}
          required={field.required}
        >
          <div className="relative">
            <input
              type={field.secret && !showSecrets[field.id] ? 'password' : 'text'}
              value={values[field.id] || ''}
              onChange={(e) => onChange(field.id, e.target.value)}
              placeholder={field.placeholder || (field.hasValue ? '••••••••' : '')}
              disabled={disabled}
              className="input-field pr-10"
            />
            {field.secret && (
              <button
                type="button"
                onClick={() => toggleSecret(field.id)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecrets[field.id] ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
          {field.hasValue && !values[field.id] && (
            <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Value is set
            </p>
          )}
        </FormField>
      ))}

      {showTestButton && onTest && (
        <div className="flex items-center gap-4 pt-2">
          <button
            type="button"
            onClick={onTest}
            disabled={disabled}
            className="btn-secondary"
          >
            Test Connection
          </button>
          
          {testStatus === 'success' && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Connection successful
            </span>
          )}
          
          {testStatus === 'failed' && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {testError || 'Connection failed'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
