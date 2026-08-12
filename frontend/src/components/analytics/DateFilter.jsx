import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
]

export default function DateFilter({
  period,
  onPeriodChange,
  startDate,
  endDate,
  onDateRangeChange,
  className = '',
}) {
  const [showCustom, setShowCustom] = useState(period === 'custom')

  const handlePeriodChange = (e) => {
    const value = e.target.value
    onPeriodChange(value)
    setShowCustom(value === 'custom')
    if (value !== 'custom') {
      onDateRangeChange?.(null, null)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="relative">
        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <select
          value={period}
          onChange={handlePeriodChange}
          className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-gray-700 hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate || ''}
            onChange={(e) => onDateRangeChange?.(e.target.value, endDate)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={endDate || ''}
            onChange={(e) => onDateRangeChange?.(startDate, e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      )}
    </div>
  )
}
