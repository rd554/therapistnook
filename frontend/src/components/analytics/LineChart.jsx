export default function LineChart({
  data = [],
  xKey = 'label',
  yKey = 'value',
  height = 200,
  color = '#4F46E5',
  showDots = true,
  showArea = true,
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

  const values = data.map((d) => d[yKey])
  const maxValue = Math.max(...values, 1)
  const minValue = Math.min(...values, 0)
  const range = maxValue - minValue || 1

  const padding = { top: 20, right: 10, bottom: 30, left: 10 }
  const chartWidth = 100
  const chartHeight = height - padding.top - padding.bottom

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * (chartWidth - padding.left - padding.right),
    y: padding.top + chartHeight - ((d[yKey] - minValue) / range) * chartHeight,
    value: d[yKey],
    label: d[xKey],
  }))

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`

  return (
    <div className={className}>
      <svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="none">
        {showArea && (
          <path
            d={areaPath}
            fill={color}
            fillOpacity={0.08}
          />
        )}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showDots && points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={3}
              fill="white"
              stroke={color}
              strokeWidth={2}
            />
            <title>{`${p.label}: ${formatValue(p.value)}`}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-2 mt-2 text-label text-content-muted">
        {data.length > 0 && (
          <>
            <span>{data[0][xKey]}</span>
            {data.length > 2 && <span>{data[Math.floor(data.length / 2)][xKey]}</span>}
            <span>{data[data.length - 1][xKey]}</span>
          </>
        )}
      </div>
    </div>
  )
}
