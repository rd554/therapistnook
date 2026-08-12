export default function BarChart({
  data = [],
  xKey = 'label',
  yKey = 'value',
  height = 200,
  color = '#4F46E5',
  borderColor = null,
  showValues = true,
  formatValue = (v) => v,
  className = '',
}) {
  if (!data.length) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <p className="text-caption text-content-muted">No data available</p>
      </div>
    )
  }

  const maxValue = Math.max(...data.map((d) => d[yKey]))
  const barWidth = Math.min(60, Math.floor((100 - (data.length - 1) * 2) / data.length))

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-end justify-around gap-3" style={{ height: height - 30 }}>
        {data.map((item, index) => {
          const value = item[yKey]
          const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0
          
          return (
            <div key={index} className="flex h-full flex-col items-center justify-end gap-1.5" style={{ width: `${barWidth}%` }}>
              {showValues && value > 0 && (
                <span className="text-label text-content-secondary">
                  {formatValue(value)}
                </span>
              )}
              <div
                className="mx-auto w-full max-w-[44px] rounded-t-lg border transition-all duration-150 hover:opacity-80"
                style={{
                  height: `${Math.max(heightPercent, 2)}%`,
                  backgroundColor: color,
                  borderColor: borderColor || color,
                  minHeight: value > 0 ? 4 : 0,
                }}
                title={`${item[xKey]}: ${formatValue(value)}`}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex justify-around gap-3 border-t border-border pt-3">
        {data.map((item, index) => (
          <div key={index} className="text-center" style={{ width: `${barWidth}%` }}>
            <span className="text-label text-content-muted truncate block">
              {item[xKey]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
