import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'inline-flex items-center justify-center gap-2 px-5 text-[15px] font-medium text-white bg-error-text hover:bg-red-700 rounded-btn shadow-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
  success: 'inline-flex items-center justify-center gap-2 px-5 text-[15px] font-medium text-white bg-success-text hover:bg-green-800 rounded-btn shadow-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
}

const sizes = {
  sm: 'px-4 text-[14px]',
  md: '',
  lg: 'px-8 text-[16px]',
}

const heights = {
  sm: '36px',
  md: '42px',
  lg: '48px',
}

export const Button = forwardRef(function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className = '',
  type = 'button',
  ...props
}, ref) {
  const variantClass = variants[variant] || variants.primary
  const sizeClass = size !== 'md' ? sizes[size] : ''

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={`${variantClass} ${sizeClass} ${className}`}
      style={{ height: heights[size] || heights.md }}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 style={{ width: '16px', height: '16px' }} className="animate-spin" strokeWidth={2} />
          <span>{typeof children === 'string' ? children : 'Loading...'}</span>
        </>
      ) : (
        <>
          {LeftIcon && <LeftIcon style={{ width: '16px', height: '16px' }} strokeWidth={1.8} />}
          {children}
          {RightIcon && <RightIcon style={{ width: '16px', height: '16px' }} strokeWidth={1.8} />}
        </>
      )}
    </button>
  )
})

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}) {
  const sizeStyles = {
    sm: { width: '32px', height: '32px' },
    md: { width: '40px', height: '40px' },
    lg: { width: '48px', height: '48px' },
  }

  const iconSizes = {
    sm: { width: '16px', height: '16px' },
    md: { width: '20px', height: '20px' },
    lg: { width: '22px', height: '22px' },
  }

  return (
    <button
      className={`btn-icon ${className}`}
      aria-label={label}
      title={label}
      style={sizeStyles[size] || sizeStyles.md}
      {...props}
    >
      <Icon style={iconSizes[size] || iconSizes.md} strokeWidth={1.8} />
    </button>
  )
}

export function ButtonGroup({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {children}
    </div>
  )
}

export default Button
