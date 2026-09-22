import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Calendar, Download, Lock, RefreshCw } from 'lucide-react'
import { MonthlyBarChart, SegmentBar } from '../components/analytics'
import { getAnalyticsExportUrl, getPracticeAnalyticsSummary } from '../api/client'
import {
  alignToMonths,
  formatCount,
  formatINR,
  formatPeriod,
  periodBounds,
  periodLabel,
  recentPeriods,
  trailingMonths,
} from '../utils/practiceAnalytics'

// The existing /api/analytics/export routes stay as they are (see main.py) —
// this is the closest report_type each CSV row can reuse. They're
// summary-metric CSVs, not the raw per-patient/session rows the export
// menu's copy describes; building true row-level exporters is a separate
// piece of backend work this pass didn't include.
const REPORT_TYPE_BY_DATASET = {
  invoices: 'revenue',
  sessions: 'appointments',
  patients: 'patients',
  assessments: 'assessments',
}

function currentPeriod() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Practice Analytics
 *
 * One page, one period control. Every figure outside the trend charts is
 * scoped to `period`; the charts always show the trailing 12 months with the
 * selected month highlighted, and say so in their headers.
 */
export default function Analytics() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState(currentPeriod)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const theme = useThemeColors()

  const load = useCallback(async (p) => {
    setData(null)
    setError(null)
    try {
      const res = await getPracticeAnalyticsSummary(p)
      setData(res)
    } catch (err) {
      setError(err.userMessage || 'Could not load analytics.')
    }
  }, [])

  useEffect(() => {
    load(period)
  }, [period, load])

  const onAction = (item) => {
    if (item.id === 'unpaid') navigate('/payments')
    else if (item.id === 'not-started') navigate('/assessments')
    else if (item.id === 'upcoming') navigate('/calendar')
  }

  const onExport = ({ kind, dataset, period: p }) => {
    if (kind !== 'csv') return
    const reportType = REPORT_TYPE_BY_DATASET[dataset]
    if (!reportType) return
    const { start, end } = periodBounds(p)
    const url = getAnalyticsExportUrl(reportType, {
      period: 'custom',
      startDate: start,
      endDate: end,
      format: 'csv',
    })
    window.open(url, '_blank')
  }

  return (
    <div className="clinical-ink">
      <div className="analytics-page">
        <header className="analytics-header">
          <div className="flex flex-col gap-0.5">
            <h1 className="t-h1">Practice Analytics</h1>
            <p className="t-caption">
              Every number on this page follows the period selected on the right. Trends always show the
              trailing 12 months.
            </p>
          </div>

          <div className="analytics-header-controls">
            <PeriodPicker period={period} onChange={setPeriod} />
            <button
              type="button"
              aria-label="Refresh data"
              onClick={() => load(period)}
              className="btn btn-secondary btn-icon"
            >
              <RefreshCw size={16} />
            </button>
            {data?.exportCounts && (
              <ExportMenu period={period} counts={data.exportCounts} onExport={onExport} />
            )}
          </div>
        </header>

        {error ? (
          <div className="alert alert-error">{error}</div>
        ) : data === null ? (
          <AnalyticsSkeleton />
        ) : (
          <AnalyticsBody data={data} period={period} theme={theme} onAction={onAction} />
        )}
      </div>
    </div>
  )
}

/* ---------- body ---------- */

function AnalyticsBody({ data, period, theme, onAction }) {
  const months = useMemo(() => trailingMonths(period), [period])
  const selectedKey = months[months.length - 1]?.key

  const revenueMonths = useMemo(
    () => alignToMonths(months, data.revenueByMonth, { collected: 0, outstanding: 0 }),
    [months, data.revenueByMonth]
  )
  const patientMonths = useMemo(
    () => alignToMonths(months, data.newPatientsByMonth, { count: 0 }),
    [months, data.newPatientsByMonth]
  )

  const revenueMax = niceMax(Math.max(...revenueMonths.map((m) => m.collected + m.outstanding), 1))
  const patientMax = niceMax(Math.max(...patientMonths.map((m) => m.count), 1), [5, 10, 20, 50])

  const thisMonth = periodLabel(period)

  return (
    <>
      <section className="analytics-kpis">
        <Kpi
          label="Sessions completed"
          value={formatCount(data.sessions.completed)}
          note={`${formatCount(data.sessions.upcoming)} upcoming this week`}
        />
        <Kpi
          label={`Collected ${thisMonth}`}
          value={formatINR(data.revenue.collectedInPeriod)}
          note={`${formatINR(data.revenue.collectedTrailing12)} in the last 12 months`}
        />
        <Kpi
          label="Outstanding today"
          value={formatINR(data.revenue.outstanding)}
          note={`Across ${formatCount(data.revenue.unpaidInvoices)} unpaid invoices`}
          alert
        />
        <Kpi
          label="Active patients"
          value={formatCount(data.patients.active)}
          note={`of ${formatCount(data.patients.total)} on record · ${formatCount(
            data.patients.newInPeriod
          )} new ${thisMonth}`}
        />
      </section>

      {data.attention.length > 0 && (
        <section className="card">
          <div className="analytics-panel-head" style={{ marginBottom: 14 }}>
            <h2 className="t-h3">Needs attention</h2>
            <span className="t-caption">{data.attention.length} items</span>
          </div>
          {data.attention.map((item) => (
            <AttentionRow key={item.id} item={item} onAction={onAction} />
          ))}
        </section>
      )}

      {data.emptyAllTime ? (
        <div className="empty">
          <BarChart3 size={28} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: 'var(--icon-muted)' }} />
          <h3 className="empty-title">No activity yet</h3>
          <p className="empty-body">Analytics appear after your first session is recorded.</p>
        </div>
      ) : (
        <>
        <div className="analytics-panels">
          <section className="card">
            <div className="analytics-panel-head">
              <h2 className="t-h3">Revenue</h2>
              <div className="analytics-legend">
                <Swatch color={theme.accent}>Collected</Swatch>
                <Swatch color={theme.error}>Outstanding</Swatch>
              </div>
            </div>
            <div className="analytics-legend-mobile">
              <Swatch color={theme.accent}>Collected</Swatch>
              <Swatch color={theme.error}>Outstanding</Swatch>
            </div>
            <p className="t-caption">
              Billed {formatINR(data.revenue.billedTrailing12)} · collected{' '}
              {formatINR(data.revenue.collectedTrailing12)} · outstanding {formatINR(data.revenue.outstanding)}
            </p>
            <MonthlyBarChart
              months={revenueMonths}
              series={[
                { key: 'collected', label: 'Collected', color: theme.accent },
                { key: 'outstanding', label: 'Outstanding', color: theme.error },
              ]}
              max={revenueMax}
              ticks={revenueTicks(revenueMax)}
              selectedKey={selectedKey}
              valueLabel={(row) =>
                row.collected + row.outstanding > 0
                  ? formatINR(row.collected + row.outstanding, { compact: true })
                  : null
              }
              ariaLabel="Revenue by month over the trailing twelve months, split into collected and outstanding."
            />
          </section>

          <section className="card analytics-side">
            <h2 className="t-h3">MMPI-2 assessments</h2>
            <p className="flex items-baseline gap-2" style={{ marginTop: 6 }}>
              <span className="analytics-kpi-value">{formatCount(data.assessments.sent)}</span>
              <span className="t-caption">sent {thisMonth}</span>
            </p>
            <SegmentBar
              className="analytics-segment-bar"
              segments={[
                { key: 'notStarted', label: 'Not started', value: data.assessments.notStarted, color: theme.error },
                { key: 'inProgress', label: 'In progress', value: data.assessments.inProgress, color: theme.accent },
                { key: 'completed', label: 'Completed', value: data.assessments.completed, color: 'var(--border)' },
              ]}
            />
            <ul className="analytics-legend-list">
              <LegendRow color={theme.error} label="Not started" value={data.assessments.notStarted} />
              <LegendRow color={theme.accent} label="In progress" value={data.assessments.inProgress} />
              <LegendRow color="var(--border)" label="Completed" value={data.assessments.completed} last />
            </ul>
            <a href="/assessments" className="link" style={{ display: 'inline-block', marginTop: 8 }}>
              Open assessment list
            </a>
          </section>
        </div>

        <div className="analytics-panels">
          <section className="card">
            <div className="analytics-panel-head">
              <h2 className="t-h3">New patients</h2>
              <span className="t-caption">Trailing 12 months</span>
            </div>
            <p className="t-caption">
              {formatCount(data.patients.addedTrailing12)} added · {data.patients.sessionsPerPatient} sessions per
              patient
            </p>
            <MonthlyBarChart
              months={patientMonths}
              series={[{ key: 'count', label: 'New patients', color: theme.accent }]}
              max={patientMax}
              ticks={countTicks(patientMax)}
              selectedKey={selectedKey}
              valueLabel={(row) => (row.count > 0 ? String(row.count) : null)}
              ariaLabel="New patients by month over the trailing twelve months."
            />
          </section>

          <section className="card analytics-side">
            <h2 className="t-h3">Patient mix</h2>
            <p className="analytics-mix-note">{formatCount(data.patients.total)} patients on record</p>
            <SegmentBar
              className="analytics-segment-bar"
              segments={[
                { key: 'active', label: 'Active', value: data.patients.active, color: theme.accent },
                { key: 'inactive', label: 'Inactive', value: data.patients.inactive, color: 'var(--text-muted)' },
                {
                  key: 'unclassified',
                  label: 'Unclassified',
                  value: data.patients.unclassified,
                  color: 'var(--surface)',
                  dashed: true,
                },
              ]}
            />
            <ul className="analytics-legend-list">
              <MixRow color={theme.accent} label="Active" value={data.patients.active} total={data.patients.total} />
              <MixRow
                color="var(--text-muted)"
                label="Inactive"
                value={data.patients.inactive}
                total={data.patients.total}
              />
              <MixRow
                color="var(--surface)"
                dashed
                label="Unclassified"
                value={data.patients.unclassified}
                total={data.patients.total}
                last
              />
            </ul>
            <div className="analytics-side-stats">
              <Stat label="Sessions / patient" value={data.patients.sessionsPerPatient} />
              <Stat label="Returned for a 2nd session" value={`${data.patients.returnRate}%`} />
            </div>
          </section>
        </div>
        </>
      )}
    </>
  )
}

/* ---------- pieces ---------- */

function Kpi({ label, value, note, alert = false }) {
  return (
    <div className={`analytics-kpi${alert ? ' is-alert' : ''}`}>
      <span className="t-caption" style={{ fontWeight: 600 }}>
        {label}
      </span>
      <div className="analytics-kpi-value">{value}</div>
      <div className="t-caption">{note}</div>
    </div>
  )
}

function AttentionRow({ item, onAction }) {
  return (
    <div className="analytics-attention-row">
      <div className="analytics-attention-main">
        <span className="analytics-attention-title">{item.title}</span>
        <span className="analytics-attention-detail">{item.detail}</span>
      </div>
      <button type="button" onClick={() => onAction?.(item)} className="btn btn-secondary">
        {item.action}
      </button>
    </div>
  )
}

function PeriodPicker({ period, onChange }) {
  const options = useMemo(() => recentPeriods(currentPeriod(), 24), [])
  const value = `${period.year}-${String(period.month).padStart(2, '0')}`

  const handleChange = (e) => {
    const [year, month] = e.target.value.split('-').map(Number)
    onChange({ year, month })
  }

  return (
    <div className="analytics-period">
      <Calendar className="analytics-period-icon" aria-hidden="true" />
      <select
        aria-label="Select period"
        className="analytics-period-select"
        value={value}
        onChange={handleChange}
      >
        {options.map((p) => {
          const v = `${p.year}-${String(p.month).padStart(2, '0')}`
          return (
            <option key={v} value={v}>
              {formatPeriod(p)}
            </option>
          )
        })}
      </select>
    </div>
  )
}

/**
 * Dropdown on desktop, bottom sheet on phones. Same options either way —
 * the difference is reach, not content.
 */
function ExportMenu({ period, counts, onExport }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const isPhone = useMediaQuery('(max-width: 1023px)')

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onClick = (e) => {
      if (!isPhone && wrap.current && !wrap.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, isPhone])

  const pick = (kind, dataset) => {
    setOpen(false)
    onExport?.({ kind, dataset, period })
  }

  const csvRows = [
    { key: 'invoices', label: 'Invoices', note: counts.invoices },
    { key: 'sessions', label: 'Sessions', note: counts.sessions },
    { key: 'patients', label: 'Patients', note: counts.patients },
    { key: 'assessments', label: 'Assessments', note: counts.assessments },
  ]

  const body = (
    <>
      {/* No backend PDF generator exists yet — disabled rather than faked. */}
      <button type="button" disabled className="analytics-export-pdf">
        <span className="analytics-export-pdf-title">PDF summary</span>
        <span className="analytics-export-pdf-note">Not available yet.</span>
      </button>

      <p className="analytics-export-label">Raw data (CSV)</p>
      {csvRows.map((row) => (
        <button key={row.key} type="button" onClick={() => pick('csv', row.key)} className="analytics-export-row">
          <span>{row.label}</span>
          <span className="analytics-export-row-note">{row.note}</span>
        </button>
      ))}

      <p className="analytics-export-lock">
        <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
        CSVs carry patient names and clinical identifiers. Downloads are logged.
      </p>
    </>
  )

  return (
    <div ref={wrap} className="analytics-export">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-primary"
      >
        <Download size={16} strokeWidth={1.9} aria-hidden="true" />
        <span className="hidden lg:inline">Export</span>
      </button>

      {open && !isPhone && (
        <div role="menu" className="analytics-export-panel">
          <p className="analytics-export-meta">{formatPeriod(period)} · current filter</p>
          {body}
        </div>
      )}

      {open && isPhone && (
        <div
          className="analytics-export-sheet-backdrop"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div role="dialog" aria-label="Export" className="analytics-export-sheet">
            <div className="analytics-export-sheet-handle" />
            <div className="analytics-export-sheet-head">
              <h2 className="t-h3">Export</h2>
              <span className="t-caption">{formatPeriod(period)} · current filter</span>
            </div>
            {body}
            <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendRow({ color, label, value, last = false }) {
  return (
    <li className={`analytics-legend-row${last ? ' is-last' : ''}`}>
      <span className="analytics-legend-key">
        <span className="analytics-legend-swatch" style={{ background: color }} />
        {label}
      </span>
      <span className="analytics-legend-value">{value}</span>
    </li>
  )
}

function MixRow({ color, label, value, total, dashed = false, last = false }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <li className={`analytics-legend-row${last ? ' is-last' : ''}`}>
      <span className="analytics-legend-key">
        <span
          className="analytics-legend-swatch"
          style={{ background: color, border: dashed ? '1px dashed var(--border)' : undefined }}
        />
        {label}
      </span>
      <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="analytics-legend-value" style={{ marginRight: 4 }}>
          {value}
        </span>
        · {pct}%
      </span>
    </li>
  )
}

function Stat({ label, value }) {
  return (
    <div className="analytics-side-stat">
      <div className="t-caption">{label}</div>
      <div className="t-h3" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

function Swatch({ color, children }) {
  return (
    <span className="analytics-swatch">
      <span className="analytics-swatch-dot" style={{ background: color }} />
      {children}
    </span>
  )
}

/* ---------- loading ---------- */

function AnalyticsSkeleton() {
  return (
    <>
      <section className="analytics-kpis">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="analytics-kpi">
            <div className="analytics-skel" style={{ height: 12, width: '60%' }} />
            <div className="analytics-skel" style={{ height: 28, width: '45%' }} />
            <div className="analytics-skel" style={{ height: 12, width: '80%' }} />
          </div>
        ))}
      </section>
      <div className="analytics-panels">
        <section className="card">
          <div className="analytics-skel" style={{ height: 18, width: 140, marginBottom: 12 }} />
          <div className="analytics-skel" style={{ height: 220, width: '100%' }} />
        </section>
        <section className="card analytics-side">
          <div className="analytics-skel" style={{ height: 18, width: 160, marginBottom: 12 }} />
          <div className="analytics-skel" style={{ height: 160, width: '100%' }} />
        </section>
      </div>
    </>
  )
}

/* ---------- helpers ---------- */

// Reads --accent/--error off the document root so chart fills follow the
// Clinical Ink tokens instead of a hardcoded hex, and stay correct if the
// tokens ever change. tokens.css defines these on :root, not `.clinical-ink`,
// so document.documentElement always has them regardless of scope.
function useThemeColors() {
  const [theme, setTheme] = useState({ accent: '#5A4AD1', error: '#A32E43' })
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    const accent = styles.getPropertyValue('--accent').trim()
    const err = styles.getPropertyValue('--error').trim()
    setTheme({ accent: accent || '#5A4AD1', error: err || '#A32E43' })
  }, [])
  return theme
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function niceMax(value, steps) {
  if (steps) return steps.find((s) => s >= value) ?? value
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2)
}

function revenueTicks(max) {
  return [0, max / 2, max].map((value) => ({ value, label: formatINR(value, { compact: true }) }))
}

function countTicks(max) {
  return [0, max / 2, max].map((value) => ({ value, label: String(value) }))
}
