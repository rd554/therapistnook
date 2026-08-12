import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function CollapsibleCard({
  icon: Icon,
  title,
  subtitle,
  count,
  defaultExpanded = false,
  headerClassName = '',
  children,
  className = '',
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className={`card overflow-hidden !p-0 ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors ${headerClassName}`}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <Icon className="h-5 w-5 text-content-muted" strokeWidth={1.8} />
          )}
          <div>
            <h3 className="text-card-title">{title}</h3>
            {subtitle && (
              <p className="mt-0.5 text-caption">{subtitle}</p>
            )}
          </div>
          {count !== undefined && count !== null && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-content-secondary">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-content-muted" />
          ) : (
            <ChevronRight className="h-5 w-5 text-content-muted" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border-light p-5">
          {children}
        </div>
      )}
    </div>
  )
}

export function CollapsibleSection({
  icon: Icon,
  title,
  count,
  expanded,
  onToggle,
  headerClassName = '',
  children,
  className = '',
}) {
  return (
    <div className={`card overflow-hidden !p-0 ${className}`}>
      <button
        onClick={onToggle}
        className={`flex w-full items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors ${headerClassName}`}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <Icon className="h-5 w-5 text-content-muted" strokeWidth={1.8} />
          )}
          <h3 className="text-card-title">{title}</h3>
          {count !== undefined && count !== null && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-content-secondary">
              {count}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-content-muted" />
        ) : (
          <ChevronRight className="h-5 w-5 text-content-muted" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border-light p-5">
          {children}
        </div>
      )}
    </div>
  )
}

export function Accordion({
  items,
  allowMultiple = false,
  defaultExpandedIds = [],
  className = '',
}) {
  const [expandedIds, setExpandedIds] = useState(new Set(defaultExpandedIds))

  const toggleItem = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (!allowMultiple) {
          next.clear()
        }
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item) => (
        <CollapsibleSection
          key={item.id}
          icon={item.icon}
          title={item.title}
          count={item.count}
          expanded={expandedIds.has(item.id)}
          onToggle={() => toggleItem(item.id)}
          headerClassName={item.headerClassName}
        >
          {item.content}
        </CollapsibleSection>
      ))}
    </div>
  )
}

export default CollapsibleCard
