import { Loader2 } from 'lucide-react'

export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  }

  return (
    <Loader2 
      className={`animate-spin text-primary ${sizes[size]} ${className}`}
      strokeWidth={2}
      aria-label="Loading"
    />
  )
}

export function LoadingOverlay({ message = 'Loading...' }) {
  return (
    <div 
      className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <LoadingSpinner size="lg" />
        <p className="text-body text-content-secondary font-medium">{message}</p>
      </div>
    </div>
  )
}

export function LoadingCard({ rows = 3 }) {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="skeleton-title mb-6" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-text mb-3 last:mb-0" style={{ width: `${85 - i * 10}%` }} />
      ))}
    </div>
  )
}

export function LoadingTable({ rows = 5, cols = 4 }) {
  return (
    <div className="table-container" aria-hidden="true">
      <div className="border-b border-border p-6">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="skeleton h-4 flex-1" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="border-b border-border/50 p-6 animate-pulse">
          <div className="flex gap-6">
            {Array.from({ length: cols }).map((_, colIndex) => (
              <div 
                key={colIndex} 
                className="skeleton h-4 flex-1" 
                style={{ opacity: 1 - (colIndex * 0.15) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PageLoader({ message = 'Loading...' }) {
  return (
    <div 
      className="flex flex-col items-center justify-center py-24"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-body text-content-muted">{message}</p>
    </div>
  )
}

export function InlineLoader({ message = 'Loading' }) {
  return (
    <span className="inline-flex items-center gap-2 text-content-muted" role="status">
      <LoadingSpinner size="sm" />
      <span className="text-caption">{message}</span>
    </span>
  )
}

export function CardSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="flex items-start gap-4">
        <div className="skeleton-avatar" />
        <div className="flex-1">
          <div className="skeleton-title mb-3" />
          <div className="skeleton-text mb-2" style={{ width: '90%' }} />
          <div className="skeleton-text" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  )
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card animate-pulse" aria-hidden="true">
          <div className="skeleton h-3 w-20 mb-3" />
          <div className="skeleton h-8 w-24 mb-2" />
          <div className="skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export default LoadingSpinner
