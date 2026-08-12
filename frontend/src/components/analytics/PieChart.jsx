const COLORS = [
  '#4F46E5', // primary indigo
  '#22C55E', // success green
  '#F59E0B', // warning amber
  '#EF4444', // error red
  '#8B5CF6', // purple
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#84CC16', // lime
]

export default function PieChart({
  data = [],
  labelKey = 'label',
  valueKey = 'value',
  size = 160,
  showLegend = true,
  colors = null,
  strokeColors = null,
  formatValue = (v) => v,
  className = '',
}) {
  if (!data.length) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height: size }}>
        <p className="text-caption text-content-muted">No data available</p>
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d[valueKey], 0)

  if (total === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height: size }}>
        <p className="text-caption text-content-muted">No data available</p>
      </div>
    )
  }

  const fillColors = colors || COLORS
  const radius = size / 2 - 10
  const center = size / 2
  let currentAngle = -90

  const slices = data.map((d, i) => {
    const percent = (d[valueKey] / total) * 100
    const angle = (d[valueKey] / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180

    const x1 = center + radius * Math.cos(startRad)
    const y1 = center + radius * Math.sin(startRad)
    const x2 = center + radius * Math.cos(endRad)
    const y2 = center + radius * Math.sin(endRad)

    const largeArcFlag = angle > 180 ? 1 : 0

    // A single SVG arc can't sweep a full 360° (start/end points coincide and
    // the arc collapses to nothing) — this happens whenever one category is
    // the only one with a nonzero value. Split it into two semicircle arcs.
    const isFullCircle = angle >= 359.99
    const path = isFullCircle
      ? `
        M ${center} ${center - radius}
        A ${radius} ${radius} 0 1 1 ${center} ${center + radius}
        A ${radius} ${radius} 0 1 1 ${center} ${center - radius}
        Z
      `
      : `
      M ${center} ${center}
      L ${x1} ${y1}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      Z
    `

    const color = fillColors[i % fillColors.length]
    const strokeColor = strokeColors ? strokeColors[i % strokeColors.length] : color

    return {
      path,
      color,
      strokeColor,
      label: d[labelKey],
      value: d[valueKey],
      percent: percent.toFixed(1),
    }
  })

  return (
    <div className={`flex items-center gap-8 ${className}`}>
      <svg width={size} height={size} className="shrink-0">
        {slices.map((slice, i) => (
          <path
            key={i}
            d={slice.path}
            fill={slice.color}
            stroke={slice.strokeColor}
            strokeWidth={1.5}
            className="transition-opacity duration-150 hover:opacity-80"
          >
            <title>{`${slice.label}: ${formatValue(slice.value)} (${slice.percent}%)`}</title>
          </path>
        ))}
        <circle cx={center} cy={center} r={radius * 0.6} fill="white" />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-lg font-semibold"
          fill="#0F172A"
        >
          {formatValue(total)}
        </text>
      </svg>

      {showLegend && (
        <div className="flex flex-col gap-3">
          {slices.map((slice, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="h-3 w-3 rounded-sm shrink-0 border"
                style={{ backgroundColor: slice.color, borderColor: slice.strokeColor }}
              />
              <span className="text-caption text-content-secondary">{slice.label}</span>
              <span className="text-caption font-medium text-content-primary">{slice.percent}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
