import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { Loader2, Brain, ArrowLeft, X } from 'lucide-react'
import { getSessionResults, interpretResults, getPdfUrl } from '../api/client'
import { formatDate } from '../utils/date'

// Single source of truth for the elevation cutoff — drives the scale-row bars,
// the chart reference line, and the top-summary elevated list. The CSS notch
// in .scale-track::after and the backend's Python copy (main.py's
// _validity_section / interpretation-prompt logic) are the two unavoidable
// non-JS duplicates of this same value; both are pinned to 65 by convention.
const ELEVATION_T_THRESHOLD = 65
const T_SCALE_MIN = 30
const T_SCALE_MAX = 120

const VALIDITY_KEYS = ['L', 'F', 'K']
const CLINICAL_KEYS = ['1_Hs', '2_D', '3_Hy', '4_Pd', '5_Mf', '6_Pa', '7_Pt', '8_Sc', '9_Ma', '0_Si']

const SCALE_LABELS = {
  'L': 'L (Lie)', 'F': 'F (Infrequency)', 'K': 'K (Correction)',
  'Fb': 'Fb (Back F)', 'VRIN': 'VRIN (Variable Response Inconsistency)',
  'TRIN': 'TRIN (True Response Inconsistency)',
  '1_Hs': '1-Hs (Hypochondriasis)', '2_D': '2-D (Depression)', '3_Hy': '3-Hy (Hysteria)',
  '4_Pd': '4-Pd (Psychopathic Deviate)', '5_Mf': '5-Mf (Masculinity-Femininity)',
  '6_Pa': '6-Pa (Paranoia)', '7_Pt': '7-Pt (Psychasthenia)', '8_Sc': '8-Sc (Schizophrenia)',
  '9_Ma': '9-Ma (Hypomania)', '0_Si': '0-Si (Social Introversion)',
}

const SHORT_LABELS = {
  'L': 'L', 'F': 'F', 'K': 'K', 'Fb': 'Fb', 'VRIN': 'VRIN', 'TRIN': 'TRIN',
  '1_Hs': 'Hs', '2_D': 'D', '3_Hy': 'Hy', '4_Pd': 'Pd', '5_Mf': 'Mf',
  '6_Pa': 'Pa', '7_Pt': 'Pt', '8_Sc': 'Sc', '9_Ma': 'Ma', '0_Si': 'Si',
}

const HARRIS_LINGOES_LABELS = {
  'D1': 'D1 (Subjective Depression)', 'D2': 'D2 (Psychomotor Retardation)',
  'D3': 'D3 (Physical Malfunctioning)', 'D4': 'D4 (Mental Dullness)', 'D5': 'D5 (Brooding)',
  'Hy1': 'Hy1 (Denial of Social Anxiety)', 'Hy2': 'Hy2 (Need for Affection)',
  'Hy3': 'Hy3 (Lassitude-Malaise)', 'Hy4': 'Hy4 (Somatic Complaints)', 'Hy5': 'Hy5 (Inhibition of Aggression)',
  'Pd1': 'Pd1 (Familial Discord)', 'Pd2': 'Pd2 (Authority Problems)',
  'Pd3': 'Pd3 (Social Imperturbability)', 'Pd4': 'Pd4 (Social Alienation)', 'Pd5': 'Pd5 (Self-Alienation)',
  'Pa1': 'Pa1 (Persecutory Ideas)', 'Pa2': 'Pa2 (Poignancy)', 'Pa3': 'Pa3 (Naivete)',
  'Sc1': 'Sc1 (Social Alienation)', 'Sc2': 'Sc2 (Emotional Alienation)',
  'Sc3': 'Sc3 (Lack of Ego Mastery, Cognitive)', 'Sc4': 'Sc4 (Lack of Ego Mastery, Conative)',
  'Sc5': 'Sc5 (Lack of Ego Mastery, Defective Inhibition)', 'Sc6': 'Sc6 (Bizarre Sensory Experiences)',
  'Ma1': 'Ma1 (Amorality)', 'Ma2': 'Ma2 (Psychomotor Acceleration)',
  'Ma3': 'Ma3 (Imperturbability)', 'Ma4': 'Ma4 (Ego Inflation)',
  'Si1': 'Si1 (Shyness-Self-Consciousness)', 'Si2': 'Si2 (Social Avoidance)',
  'Si3': 'Si3 (Alienation-Self and Others)',
}

const SUPPLEMENTARY_LABELS = {
  'A': 'A (Anxiety)', 'R': 'R (Repression)', 'Es': 'Es (Ego Strength)',
  'MAC-R': 'MAC-R (MacAndrew Alcoholism-Revised)', 'Fb': 'Fb (Back F)',
  'OH': 'OH (Overcontrolled Hostility)', 'Do': 'Do (Dominance)',
  'Re': 'Re (Social Responsibility)', 'Mt': 'Mt (College Maladjustment)',
  'GM': 'GM (Masculine Gender Role)', 'GF': 'GF (Feminine Gender Role)',
  'PK': 'PK (PTSD-Keane)', 'PS': 'PS (PTSD-Schlenger)',
  'VRIN': 'VRIN (Variable Response Inconsistency)',
  'TRIN': 'TRIN (True Response Inconsistency)',
}

// "1-Hs (Hypochondriasis)" -> "Hypochondriasis" for the <small> line under
// the scale abbreviation — the abbreviation itself is already the row's
// primary label, so the parenthetical is all the second line needs.
function scaleDescription(label) {
  const match = /\(([^)]+)\)/.exec(label || '')
  return match ? match[1] : label
}

// Old stored interpretations (generated before the numbered-header/title
// prompt fix) still contain "## 1. Validity Scales" and an improvised title
// line. Both the screen and the PDF read the same stored text, so both must
// normalize at render time rather than assuming the prompt fix alone is enough.
const KNOWN_SECTION_WORDS = [
  'validity scales', 'clinical scales', 'harris-lingoes', 'code type',
  'modifying variables', 'diagnostic considerations', 'prognosis',
  'treatment implications', 'summary',
]

function isKnownHeading(text) {
  const t = text.toLowerCase()
  return KNOWN_SECTION_WORDS.some((w) => t.includes(w))
}

// "**Label:** body" or "**Label**: body" -> { label, body } — stored
// interpretations use both shapes interchangeably depending on which LLM
// call produced them, so the colon is matched whether it lands inside or
// outside the bold markers.
function splitLabel(line) {
  const m = /^\*\*(.+?)\*\*:?\s*(.*)$/.exec(line)
  if (!m) return null
  const label = m[1].replace(/:\s*$/, '').trim()
  if (!label) return null
  return { label, body: m[2].trim() }
}

function extractTScore(body) {
  const m = /T-score of (-?\d+)/i.exec(body)
  return m ? parseInt(m[1], 10) : null
}

// Turns stored interpretation text (old numbered "## 1. Foo" headers, an
// improvised title line, "- **Label:** prose" bullets, plain bullet lists,
// and "### " subgroup headers) into a render-ready section tree. Both the
// screen and the PDF read the same stored text, so this can't assume the
// prompt fix alone normalized everything — it has to handle old records too.
function parseInterpretation(text) {
  if (!text) return []
  let lines = text.replace(/\r\n/g, '\n').split('\n')
  lines = lines.map((l) => l.replace(/^(#{1,3}\s*)\d+\.\s*/, '$1'))

  const firstHeadingIdx = lines.findIndex((l) => /^#{1,2}\s/.test(l.trim()))
  if (firstHeadingIdx > -1) {
    const headingText = lines[firstHeadingIdx].replace(/^#{1,2}\s*/, '').trim()
    lines = isKnownHeading(headingText) ? lines.slice(firstHeadingIdx) : lines.slice(firstHeadingIdx + 1)
  }

  const sections = []
  let current = null
  let listBuffer = null

  const flushList = () => {
    if (listBuffer && listBuffer.items.length) current.blocks.push(listBuffer)
    listBuffer = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    const headingMatch = /^##\s+(.+)$/.exec(line)
    if (headingMatch) {
      if (current) flushList()
      current = { heading: headingMatch[1].trim(), blocks: [] }
      sections.push(current)
      continue
    }
    if (!current) continue

    if (!line) { flushList(); continue }

    const subMatch = /^###\s+(.+)$/.exec(line)
    if (subMatch) {
      flushList()
      current.blocks.push({ type: 'sub', text: subMatch[1].trim() })
      continue
    }

    const isBullet = /^[-*]\s+/.test(line)
    const bulletText = isBullet ? line.replace(/^[-*]\s+/, '') : line

    const split = splitLabel(bulletText)
    if (split) {
      flushList()
      current.blocks.push({ type: 'item', label: split.label, body: split.body, tScore: extractTScore(split.body) })
      continue
    }

    if (isBullet) {
      if (!listBuffer) listBuffer = { type: 'list', items: [] }
      listBuffer.items.push(bulletText)
      continue
    }

    flushList()
    current.blocks.push({ type: 'para', body: line })
  }
  if (current) flushList()

  return sections
}

// Resolves the design tokens the chart needs into actual color values once,
// at mount — recharts/SVG props need a real value, not var(--x), so this
// reads the same custom properties tokens.css defines rather than
// hand-copying a hex mirror of them.
function useChartColors() {
  const [colors] = useState(() => {
    if (typeof document === 'undefined') return null
    const style = getComputedStyle(document.documentElement)
    const v = (name) => style.getPropertyValue(name).trim()
    return {
      line: v('--text-secondary'),
      elevated: v('--warning'),
      hairline: v('--hairline'),
      border: v('--border'),
      muted: v('--text-muted'),
      canvas: v('--canvas'),
    }
  })
  return colors
}

function ChartTooltip({ active, payload, colors }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  if (d.t_score == null) return null
  const elevated = d.t_score >= ELEVATION_T_THRESHOLD
  return (
    <div className="card card-compact" style={{ padding: '10px 12px' }}>
      <p className="t-body-s" style={{ margin: 0 }}>{d.label || d.short}</p>
      <p className="t-cell-key" style={{ margin: 0 }}>T-Score: {Math.round(d.t_score)}</p>
      {d.raw != null && <p className="t-caption" style={{ margin: 0 }}>Raw: {Math.round(d.raw)}</p>}
      {elevated && <p className="t-caption" style={{ margin: 0, color: colors.elevated }}>Clinically elevated</p>}
    </div>
  )
}

// T-score -> percent across the 30-120 track, shared by the bar fill/overlay
// and the chart's y-domain so every visual reads the same scale.
function tPct(t) {
  return Math.min(100, Math.max(0, ((t - T_SCALE_MIN) / (T_SCALE_MAX - T_SCALE_MIN)) * 100))
}
const NOTCH_PCT = tPct(ELEVATION_T_THRESHOLD)

function ProfileChart({ data, height = 320 }) {
  const colors = useChartColors()
  if (!colors) return null
  const pts = data.length
  const minWidth = Math.max(560, pts * 38)
  return (
    <div className="profile-chart" style={{ '--pts': pts }}>
      <ResponsiveContainer width="100%" height={height} minWidth={minWidth}>
        <LineChart data={data} margin={{ top: 16, right: 40, left: 8, bottom: 32 }}>
          <CartesianGrid stroke={colors.hairline} vertical={false} />
          <XAxis dataKey="short" tick={{ fontSize: 12, fontWeight: 500, fill: colors.muted }}
            tickLine={false} axisLine={{ stroke: colors.border }} interval={0}
            angle={-45} textAnchor="end" height={50} />
          <YAxis domain={[T_SCALE_MIN, T_SCALE_MAX]} tick={{ fontSize: 12, fontWeight: 500, fill: colors.muted }}
            tickLine={false} axisLine={false} width={36} />
          <Tooltip content={(p) => <ChartTooltip {...p} colors={colors} />} />
          <ReferenceLine y={50} stroke={colors.hairline} strokeWidth={1} />
          <ReferenceLine y={ELEVATION_T_THRESHOLD} stroke={colors.border} strokeDasharray="4 4" strokeWidth={1}
            label={{ value: `T=${ELEVATION_T_THRESHOLD}`, position: 'right', fill: colors.muted, fontSize: 11 }} />
          <Line type="linear" dataKey="t_score" stroke={colors.line} strokeWidth={2}
            dot={(p) => {
              if (p.payload.t_score == null) return null
              const elevated = p.payload.t_score >= ELEVATION_T_THRESHOLD
              return (
                <circle key={p.key} cx={p.cx} cy={p.cy} r={elevated ? 5 : 3}
                  fill={elevated ? colors.elevated : colors.line} stroke={colors.canvas} strokeWidth={1.5} />
              )
            }}
            activeDot={{ r: 6, stroke: colors.canvas, strokeWidth: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="profile-hint">Scroll to see the full profile.</p>
    </div>
  )
}

function ScaleRows({ data, showKCorrected = false }) {
  return (
    <div>
      {data.map((d) => {
        const hasT = d.t_score !== null && d.t_score !== undefined
        const elevated = hasT && d.t_score >= ELEVATION_T_THRESHOLD
        const pct = hasT ? tPct(d.t_score) : 0
        const overWidth = elevated ? Math.max(0, pct - NOTCH_PCT) : 0
        return (
          <div key={d.key || d.scale} className={`scale-row${elevated ? ' is-elevated' : ''}`}>
            <span className="scale-name">
              <span className="scale-abbr">{d.short}</span>
              <small className="scale-full">{d.desc}</small>
            </span>
            <span className="scale-raw">
              <b>{d.raw != null ? Math.round(d.raw) : '—'}</b>
              {showKCorrected && d.k_corrected != null && <small>K-corr {Math.round(d.k_corrected)}</small>}
            </span>
            <span className="scale-track">
              <span className="scale-fill" style={{ width: `${pct}%` }} />
              {overWidth > 0 && <span className="scale-over" style={{ left: `${NOTCH_PCT}%`, width: `${overWidth}%` }} />}
            </span>
            <span className="scale-t">{hasT ? Math.round(d.t_score) : '—'}</span>
          </div>
        )
      })}
      <div className="scale-legend">
        Bar shows T-score, {T_SCALE_MIN}–{T_SCALE_MAX} · Notch marks T={ELEVATION_T_THRESHOLD}
      </div>
    </div>
  )
}

// Helper to extract raw/t_score from new subscale format
function getSubscaleValue(scaleData, field) {
  if (scaleData === null || scaleData === undefined) return null
  if (typeof scaleData === 'object') return scaleData[field] ?? null
  return field === 'raw' ? scaleData : null
}

export default function Results() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [results, setResults] = useState(null)
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(true)
  const [interpreting, setInterpreting] = useState(false)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('validity')
  const [chartSheet, setChartSheet] = useState(null) // { data, label } | null

  const backUrl = '/home' // Unified routes

  useEffect(() => {
    (async () => {
      try {
        const r = await getSessionResults(sessionId)
        setResults(r)
        if (r.interpretation) setInterpretation(r.interpretation)
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load results')
      } finally {
        setLoading(false)
      }
    })()
  }, [sessionId])

  const handleInterpret = async () => {
    setInterpreting(true)
    try {
      const res = await interpretResults(sessionId)
      setInterpretation(res.interpretation)
    } catch {
      setError('Interpretation failed')
    } finally {
      setInterpreting(false)
    }
  }

  if (loading) {
    return (
      <div className="clinical-ink flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
      </div>
    )
  }

  if (!results) {
    return (
      <div className="clinical-ink">
        <p className="status-quiet" style={{ textAlign: 'center', padding: 'var(--space-9) 0' }}>{error || 'No results found.'}</p>
      </div>
    )
  }

  const { raw_scores, k_corrected_scores, t_scores, harris_lingoes_subscales, si_subscales, supplementary_scales } = results

  // Get TRIN direction
  const trinDirection = supplementary_scales?.TRIN?.direction || null
  const trinDirWord = trinDirection === 'T' ? 'True' : trinDirection === 'F' ? 'False' : null

  // Validity Scales Data (L, F, K + Fb, VRIN, TRIN)
  const validityData = VALIDITY_KEYS.map(key => ({
    scale: key,
    label: SCALE_LABELS[key] || key,
    short: SHORT_LABELS[key] || key,
    desc: scaleDescription(SCALE_LABELS[key] || key),
    raw: raw_scores[key] ?? null,
    t_score: t_scores[key] ?? null,
  }))

  // Add Fb from supplementary
  if (supplementary_scales?.Fb !== undefined) {
    const fbData = supplementary_scales.Fb
    validityData.push({
      scale: 'Fb',
      label: SCALE_LABELS['Fb'],
      short: 'Fb',
      desc: scaleDescription(SCALE_LABELS['Fb']),
      raw: getSubscaleValue(fbData, 'raw') ?? fbData,
      t_score: getSubscaleValue(fbData, 't_score'),
    })
  }

  // Add VRIN
  if (supplementary_scales?.VRIN !== undefined) {
    const vrinData = supplementary_scales.VRIN
    validityData.push({
      scale: 'VRIN',
      label: SCALE_LABELS['VRIN'],
      short: 'VRIN',
      desc: scaleDescription(SCALE_LABELS['VRIN']),
      raw: getSubscaleValue(vrinData, 'raw') ?? vrinData,
      t_score: getSubscaleValue(vrinData, 't_score'),
    })
  }

  // Add TRIN
  if (supplementary_scales?.TRIN !== undefined) {
    const trinData = supplementary_scales.TRIN
    validityData.push({
      scale: 'TRIN',
      label: SCALE_LABELS['TRIN'],
      short: 'TRIN',
      desc: scaleDescription(SCALE_LABELS['TRIN']) + (trinDirWord ? ` · ${trinDirWord} direction` : ''),
      raw: getSubscaleValue(trinData, 'raw') ?? trinData,
      t_score: getSubscaleValue(trinData, 't_score'),
    })
  }

  const fMinusK = Math.round((raw_scores.F || 0) - (raw_scores.K || 0))
  const fMinusKText = fMinusK > 11
    ? 'May indicate exaggeration or faking bad.'
    : fMinusK < -11
      ? 'May indicate defensiveness or faking good.'
      : 'Within normal limits.'

  // Clinical Scales Data
  const clinicalData = CLINICAL_KEYS.map(key => ({
    scale: key,
    key,
    label: SCALE_LABELS[key] || key,
    short: SHORT_LABELS[key] || key,
    desc: scaleDescription(SCALE_LABELS[key] || key),
    raw: raw_scores[key] ?? null,
    k_corrected: k_corrected_scores[key] ?? null,
    t_score: t_scores[key] ?? null,
  }))

  // Harris-Lingoes + Si Subscales Data (with T-scores from new format)
  const hlOrder = ['D1', 'D2', 'D3', 'D4', 'D5', 'Hy1', 'Hy2', 'Hy3', 'Hy4', 'Hy5', 'Pd1', 'Pd2', 'Pd3', 'Pd4', 'Pd5', 'Pa1', 'Pa2', 'Pa3', 'Sc1', 'Sc2', 'Sc3', 'Sc4', 'Sc5', 'Sc6', 'Ma1', 'Ma2', 'Ma3', 'Ma4']
  const siOrder = ['Si1', 'Si2', 'Si3']

  const harrisLingoesData = hlOrder
    .filter(key => harris_lingoes_subscales?.[key] !== undefined)
    .map(key => {
      const scaleData = harris_lingoes_subscales[key]
      return {
        scale: key,
        key,
        label: HARRIS_LINGOES_LABELS[key] || key,
        short: key,
        desc: scaleDescription(HARRIS_LINGOES_LABELS[key] || key),
        raw: getSubscaleValue(scaleData, 'raw') ?? scaleData,
        t_score: getSubscaleValue(scaleData, 't_score'),
      }
    })

  const siData = siOrder
    .filter(key => si_subscales?.[key] !== undefined)
    .map(key => {
      const scaleData = si_subscales[key]
      return {
        scale: key,
        key,
        label: HARRIS_LINGOES_LABELS[key] || key,
        short: key,
        desc: scaleDescription(HARRIS_LINGOES_LABELS[key] || key),
        raw: getSubscaleValue(scaleData, 'raw') ?? scaleData,
        t_score: getSubscaleValue(scaleData, 't_score'),
      }
    })

  const combinedSubscalesData = [...harrisLingoesData, ...siData]

  // Supplementary Scales Data (including Fb, VRIN, TRIN for this section too)
  const suppOrder = ['A', 'R', 'Es', 'MAC-R', 'Fb', 'OH', 'Do', 'Re', 'Mt', 'GM', 'GF', 'PK', 'PS', 'VRIN', 'TRIN']
  const supplementaryData = suppOrder
    .filter(key => supplementary_scales?.[key] !== undefined)
    .map(key => {
      const scaleData = supplementary_scales[key]
      return {
        scale: key,
        key,
        label: SUPPLEMENTARY_LABELS[key] || key,
        short: key,
        desc: scaleDescription(SUPPLEMENTARY_LABELS[key] || key) + (key === 'TRIN' && trinDirWord ? ` · ${trinDirWord} direction` : ''),
        raw: getSubscaleValue(scaleData, 'raw') ?? scaleData,
        t_score: getSubscaleValue(scaleData, 't_score'),
      }
    })

  const elevatedClinical = clinicalData.filter(d => d.t_score != null && d.t_score >= ELEVATION_T_THRESHOLD)
  const validityQuestioned = results.validity_status !== 'Valid' || (results.validity_cautions?.length > 0)

  const dobDisplay = formatDate(results.patient_dob)
  const assessedDisplay = formatDate(results.assessed_at)
  const metaLine = [
    results.patient_gender,
    results.patient_age != null ? `Age ${results.patient_age}` : null,
    dobDisplay ? `DOB ${dobDisplay}` : null,
    assessedDisplay ? `Assessed ${assessedDisplay}` : null,
  ].filter(Boolean).join(' · ')

  const sections = [
    { id: 'validity', label: 'Validity Scales', count: validityData.length },
    { id: 'clinical', label: 'Clinical Scales', count: clinicalData.length },
    { id: 'harris', label: 'Harris-Lingoes & Si', count: combinedSubscalesData.length },
    { id: 'supplementary', label: 'Supplementary', count: supplementaryData.length },
    { id: 'interpretation', label: 'Interpretation' },
  ]

  // Below 760px the chart itself is hidden (.profile-chart-inline) in favor
  // of a "View profile chart" trigger (.profile-chart-open) that opens it
  // full-screen — the .scale-row list above is already the profile on a
  // phone, so the chart isn't the default mobile reading of the data.
  const renderChartBlock = (data, height, label) => (
    <>
      <div className="profile-chart-inline">
        <ProfileChart data={data} height={height} />
      </div>
      <div className="profile-chart-open">
        <button type="button" className="btn btn-secondary" onClick={() => setChartSheet({ data, label })}>
          View profile chart
        </button>
      </div>
    </>
  )

  const interpretButton = (fullWidth) => (
    <button onClick={handleInterpret} className="btn btn-secondary" disabled={interpreting}
      style={fullWidth ? { width: '100%', justifyContent: 'center' } : undefined}>
      {interpreting ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Brain size={16} strokeWidth={1.5} />}
      {interpreting ? 'Generating…' : 'AI interpretation'}
    </button>
  )

  const downloadButton = (fullWidth) => (
    <a href={getPdfUrl(sessionId)} className="btn btn-primary" target="_blank" rel="noreferrer"
      style={fullWidth ? { width: '100%', justifyContent: 'center' } : undefined}>
      Download PDF
    </a>
  )

  return (
    <div className="clinical-ink">
      {/* Desktop header */}
      <div className="hidden sm:block">
        <div className="report-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to dashboard" title="Back to dashboard" onClick={() => navigate(backUrl)}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="report-id">
              <h1 className="t-h1">{results.patient_name}</h1>
              <p className="t-body-s">{metaLine}</p>
            </div>
          </div>
          <div className="profile-actions">
            {!interpretation && interpretButton(false)}
            {downloadButton(false)}
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to dashboard" onClick={() => navigate(backUrl)}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>{results.patient_name}</h1>
        </div>
        <p className="t-body-s">{metaLine}</p>
        {!interpretation && interpretButton(true)}
        {downloadButton(true)}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>{error}</div>
      )}

      {/* Summary block — validity first, elevated scales second (Part 0) */}
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        {validityQuestioned ? (
          <div className="alert alert-warn">
            <p style={{ margin: 0 }}>
              <strong>Profile validity: {results.validity_status}.</strong>
              {results.validity_cautions?.length > 0 && ' ' + results.validity_cautions.join('; ') + '.'}
            </p>
          </div>
        ) : (
          <p className="status-quiet">Profile validity: {results.validity_status}. No response-style concerns.</p>
        )}
        <p className="status-plain" style={{ marginTop: 'var(--space-3)' }}>
          {elevatedClinical.length > 0
            ? `Clinically elevated (T ≥ ${ELEVATION_T_THRESHOLD}): ${elevatedClinical.map(d => `${d.short} T=${Math.round(d.t_score)}`).join(' · ')}`
            : `No clinical scales are elevated (T ≥ ${ELEVATION_T_THRESHOLD}).`}
        </p>
      </div>

      {/* Section Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--space-5)' }}>
        {sections.map(sec => (
          <button
            key={sec.id}
            type="button"
            className={`tab${activeSection === sec.id ? ' is-active' : ''}`}
            onClick={() => setActiveSection(sec.id)}
          >
            {sec.label}
            {sec.count != null && <span className="tab-count">{sec.count}</span>}
          </button>
        ))}
      </div>

      {/* Validity Scales */}
      {activeSection === 'validity' && (
        <div className="card card-flush">
          <ScaleRows data={validityData} />
          <div style={{ padding: 'var(--space-4)' }}>
            <p className="t-body-s">F − K Index: {fMinusK} — {fMinusKText}</p>
          </div>
        </div>
      )}

      {/* Clinical Scales */}
      {activeSection === 'clinical' && (
        <div className="card card-flush">
          <ScaleRows data={clinicalData} showKCorrected />
          <div style={{ padding: 'var(--space-4)' }}>
            {renderChartBlock(clinicalData, 320, 'Clinical Scales')}
          </div>
        </div>
      )}

      {/* Harris-Lingoes & Si Subscales */}
      {activeSection === 'harris' && (
        <div className="card card-flush">
          {combinedSubscalesData.length > 0 ? (
            <>
              <ScaleRows data={combinedSubscalesData} />
              <div style={{ padding: 'var(--space-4)' }}>
                {renderChartBlock(combinedSubscalesData, 360, 'Harris-Lingoes & Si Subscales')}
              </div>
            </>
          ) : (
            <p className="status-quiet" style={{ textAlign: 'center', padding: 'var(--space-9) 0' }}>No subscale data available.</p>
          )}
        </div>
      )}

      {/* Supplementary Scales */}
      {activeSection === 'supplementary' && (
        <div className="card card-flush">
          {supplementaryData.length > 0 ? (
            <>
              <ScaleRows data={supplementaryData} />
              <div style={{ padding: 'var(--space-4)' }}>
                {renderChartBlock(supplementaryData, 320, 'Supplementary Scales')}
              </div>
            </>
          ) : (
            <p className="status-quiet" style={{ textAlign: 'center', padding: 'var(--space-9) 0' }}>No supplementary scale data available.</p>
          )}
        </div>
      )}

      {/* Interpretation */}
      {activeSection === 'interpretation' && (
        interpretation ? (
          <div className="card-narrative">
            <div className="interp">
              {parseInterpretation(interpretation).map((section, i) => {
                const isSummary = /^summary$/i.test(section.heading)
                return (
                  <div key={i} className={isSummary ? 'interp-summary' : 'interp-section'}>
                    {!isSummary && <h3 className="interp-h">{section.heading}</h3>}
                    {section.blocks.map((block, j) => {
                      if (block.type === 'sub') {
                        return <h4 key={j} className="t-h4" style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-3)' }}>{block.text}</h4>
                      }
                      if (block.type === 'list') {
                        return (
                          <ul key={j} className="interp-list">
                            {block.items.map((item, k) => <li key={k}>{item}</li>)}
                          </ul>
                        )
                      }
                      if (block.type === 'item') {
                        const elevated = block.tScore != null && block.tScore >= ELEVATION_T_THRESHOLD
                        return (
                          <div key={j} className="interp-item">
                            <span className="interp-label">
                              {block.label}
                              {block.tScore != null && (
                                <span className={`interp-t${elevated ? ' is-elevated' : ''}`}>{block.tScore}</span>
                              )}
                            </span>
                            <p className="interp-body">{block.body}</p>
                          </div>
                        )
                      }
                      return <p key={j} className="interp-body">{block.body}</p>
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-9) var(--space-6)' }}>
            <p className="status-quiet" style={{ marginBottom: 'var(--space-4)' }}>No interpretation generated yet.</p>
            <button onClick={handleInterpret} className="btn btn-primary" disabled={interpreting} style={{ margin: '0 auto' }}>
              {interpreting ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Brain size={16} strokeWidth={1.5} />}
              {interpreting ? 'Generating…' : 'Generate AI interpretation'}
            </button>
          </div>
        )
      )}

      {chartSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ padding: 'var(--space-4)' }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="chart-sheet-title" style={{ maxWidth: '100%', width: '100%', height: '100%', maxHeight: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
              <h3 id="chart-sheet-title" className="modal-title">{chartSheet.label}</h3>
              <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Close" onClick={() => setChartSheet(null)}>
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <ProfileChart data={chartSheet.data} height={360} />
          </div>
        </div>
      )}
    </div>
  )
}
