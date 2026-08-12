export function FilterTabs({
  value,
  onChange,
  options,
  size = 'md',
  className = '',
}) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  }

  return (
    <div className={`card !p-2 ${className}`}>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const isActive = value === option.value
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={`
                rounded-xl font-medium transition-colors
                ${sizeClasses[size]}
                ${isActive
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-content-secondary hover:bg-slate-100 hover:text-content-primary'
                }
              `}
            >
              {option.icon && (
                <option.icon className="h-4 w-4 mr-1.5 inline-block" strokeWidth={1.8} />
              )}
              {option.label}
              {option.count !== undefined && (
                <span className={`ml-1.5 ${isActive ? 'text-primary-500' : 'text-content-muted'}`}>
                  ({option.count})
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TabNav({
  value,
  onChange,
  tabs,
  className = '',
}) {
  return (
    <div className={`card !p-2 ${className}`}>
      <nav className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const isActive = value === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-content-secondary hover:bg-slate-100 hover:text-content-primary'
                }
              `}
            >
              {Icon && <Icon className="h-4 w-4" strokeWidth={1.8} />}
              {tab.label}
              {tab.badge && (
                <span className={`
                  rounded-full px-1.5 py-0.5 text-[10px] font-medium
                  ${isActive ? 'bg-primary-200 text-primary-800' : 'bg-slate-100 text-content-muted'}
                `}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export function SegmentedControl({
  value,
  onChange,
  options,
  className = '',
}) {
  return (
    <div className={`inline-flex rounded-xl bg-slate-100 p-1 ${className}`}>
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`
              rounded-lg px-4 py-1.5 text-sm font-medium transition-all
              ${isActive
                ? 'bg-white text-content-primary shadow-sm'
                : 'text-content-secondary hover:text-content-primary'
              }
            `}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function ChipFilter({
  value,
  onChange,
  options,
  multiple = false,
  className = '',
}) {
  const isSelected = (optionValue) => {
    if (multiple) {
      return Array.isArray(value) && value.includes(optionValue)
    }
    return value === optionValue
  }

  const handleClick = (optionValue) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : []
      if (currentValues.includes(optionValue)) {
        onChange(currentValues.filter((v) => v !== optionValue))
      } else {
        onChange([...currentValues, optionValue])
      }
    } else {
      onChange(optionValue)
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => {
        const selected = isSelected(option.value)
        return (
          <button
            key={option.value}
            onClick={() => handleClick(option.value)}
            className={`
              rounded-full px-4 py-1.5 text-sm font-medium border transition-colors
              ${selected
                ? 'bg-primary-light border-primary-200 text-primary'
                : 'bg-white border-slate-200 text-content-secondary hover:border-slate-300'
              }
            `}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default FilterTabs
