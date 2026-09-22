import { useEffect, useRef, useState } from "react";

/**
 * MonthlyBarChart
 *
 * One chart serves both panels: stack one series for new patients, two for
 * revenue (collected + outstanding).
 *
 * It measures its container and draws at 1:1 pixels rather than scaling a
 * fixed viewBox. A scaled viewBox would shrink the axis text to ~6px on a
 * 390px screen, which is the usual reason dashboard charts are unreadable on
 * phones. Measuring also lets label density and bar width respond to the
 * space actually available, not to a guessed breakpoint.
 *
 * Series/segment fills are passed in as `color` (resolved by the caller via
 * getComputedStyle against --accent/--error, so they follow the Clinical Ink
 * tokens instead of being hardcoded here). Chart chrome that isn't a series
 * color — gridlines, axis text, the selected-month band — reads design
 * tokens directly as CSS var() strings, since those never vary per call.
 */
export function MonthlyBarChart({
  months,            // [{ key, label }] — fixed 12 slots, see trailingMonths()
  series,            // [{ key: "collected", label, color }] stacked bottom-up
  max,               // y-axis ceiling in data units
  ticks = [],        // [{ value, label }]
  selectedKey,       // month highlighted as the current period
  valueLabel,        // (row) => string | null, drawn above the bar
  ariaLabel,
  compact = false,   // forced small mode; otherwise derived from width
}) {
  const [ref, width] = useElementWidth();
  const small = compact || width < 520;

  const height = small ? 168 : 220;
  const axisW = small ? 34 : 48;
  const labelY = height - 12;
  const baseline = height - 30;
  const plotTop = 16;
  const plotH = baseline - plotTop;

  const n = months.length || 1;
  const plotW = Math.max(width - axisW - 6, 0);
  const slot = plotW / n;
  const barW = clamp(slot * 0.46, 10, 26);
  const labelEvery = small ? 3 : 1;
  const scale = max > 0 ? plotH / max : 0;

  const x = (i) => axisW + i * slot + (slot - barW) / 2;
  const centre = (i) => x(i) + barW / 2;

  return (
    <div ref={ref} className="analytics-chart">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="analytics-chart-svg"
        >
          {months.map((m, i) =>
            m.key === selectedKey ? (
              <rect
                key={`sel-${m.key}`}
                x={x(i) - (slot - barW) / 2}
                y={plotTop - 10}
                width={slot}
                height={baseline - plotTop + 20}
                rx="6"
                fill="var(--selected)"
              />
            ) : null
          )}

          {ticks.map((t) => {
            const y = baseline - t.value * scale;
            return (
              <g key={t.value}>
                <line
                  x1={axisW}
                  y1={y}
                  x2={width - 6}
                  y2={y}
                  stroke={t.value === 0 ? "var(--border)" : "var(--hairline)"}
                  strokeWidth="1"
                />
                <text
                  x={axisW - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={small ? 10 : 11}
                  fill="var(--text-muted)"
                >
                  {t.label}
                </text>
              </g>
            );
          })}

          {months.map((row, i) => {
            const total = series.reduce((sum, s) => sum + (row[s.key] || 0), 0);
            if (total <= 0) {
              return (
                <rect
                  key={row.key}
                  x={x(i)}
                  y={baseline - 3}
                  width={barW}
                  height="3"
                  rx="1.5"
                  fill={row.key === selectedKey ? "var(--border)" : "var(--hairline)"}
                />
              );
            }

            let cursor = baseline;
            const stack = series.map((s) => {
              const h = (row[s.key] || 0) * scale;
              cursor -= h;
              return { key: s.key, y: cursor, h, color: s.color };
            });
            const label = valueLabel?.(row);

            return (
              <g key={row.key}>
                {stack.map((seg) =>
                  seg.h > 0 ? (
                    <rect
                      key={seg.key}
                      x={x(i)}
                      y={seg.y}
                      width={barW}
                      height={seg.h}
                      rx="2"
                      fill={seg.color}
                    />
                  ) : null
                )}
                {label && !small && (
                  <text
                    x={centre(i)}
                    y={cursor - 6}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="var(--text-primary)"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {months.map((m, i) => {
            const isSelected = m.key === selectedKey;
            const show = isSelected || (n - 1 - i) % labelEvery === 0;
            if (!show) return null;
            return (
              <text
                key={`lbl-${m.key}`}
                x={centre(i)}
                y={labelY}
                textAnchor="middle"
                fontSize={small ? 10 : 11}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected ? "var(--text-primary)" : "var(--text-muted)"}
              >
                {m.label}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Stacked proportion bar — patient mix, assessment status. */
export function SegmentBar({ segments, className = "" }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div className={`analytics-segment-bar ${className}`} aria-hidden="true">
      {visible.map((s, i) => (
        <div
          key={s.key}
          className="analytics-segment"
          style={{
            flexGrow: s.value,
            background: s.color,
            border: s.dashed ? "1px dashed var(--border)" : undefined,
            borderTopLeftRadius: i === 0 ? 5 : 0,
            borderBottomLeftRadius: i === 0 ? 5 : 0,
            borderTopRightRadius: i === visible.length - 1 ? 5 : 0,
            borderBottomRightRadius: i === visible.length - 1 ? 5 : 0,
          }}
          title={`${s.label}: ${s.value} of ${total}`}
        />
      ))}
    </div>
  );
}

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
