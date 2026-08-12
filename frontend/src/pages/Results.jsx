import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import ReactMarkdown from 'react-markdown'
import {
  Loader2, Download, Brain, BarChart3, FileText, AlertTriangle, TrendingUp, ArrowLeft,
  Shield, Activity, Layers, FlaskConical,
} from 'lucide-react'
import { getSessionResults, interpretResults, getPdfUrl } from '../api/client'

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

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-bold text-gray-800">{d.label || d.short}</p>
      <p className="text-sm text-primary-600">T-Score: <strong>{d.t_score}</strong></p>
      {d.raw !== undefined && <p className="text-xs text-gray-500">Raw: {d.raw}</p>}
      {d.t_score >= 65 && (
        <p className="mt-1 text-xs font-semibold text-red-500">Clinically Elevated</p>
      )}
    </div>
  )
}

function RawScoreTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-bold text-gray-800">{d.label || d.short}</p>
      <p className="text-sm text-primary-600">Raw Score: <strong>{d.raw}</strong></p>
    </div>
  )
}

function CustomDot({ cx, cy, payload }) {
  const elevated = payload.t_score >= 65
  return (
    <circle
      cx={cx} cy={cy} r={elevated ? 6 : 4}
      fill={elevated ? '#ef4444' : '#3b82f6'}
      stroke="#fff" strokeWidth={2}
    />
  )
}

function ValidityScoreTable({ data, fMinusK, trinDirection }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-4 py-3 font-semibold text-gray-600">Scale</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-600">Raw Score</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-600">T-Score</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const hasTScore = d.t_score !== null && d.t_score !== undefined
            const elevated = hasTScore && d.t_score >= 65
            const labelSuffix = d.scale === 'TRIN' && trinDirection ? `-${trinDirection}` : ''
            return (
              <tr key={d.scale} className={`border-b border-gray-100 ${elevated ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{d.label}{labelSuffix && <span className="ml-1 text-xs font-bold text-purple-600">({labelSuffix})</span>}</td>
                <td className="px-4 py-3 text-center text-gray-600">{Math.round(d.raw)}</td>
                <td className="px-4 py-3 text-center font-bold text-gray-800">{hasTScore ? Math.round(d.t_score) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  {hasTScore ? (
                    elevated ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Elevated</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Normal</span>
                    )
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            )
          })}
          <tr className="border-t-2 border-gray-300 bg-blue-50">
            <td className="px-4 py-3 font-bold text-blue-800">F - K (Index)</td>
            <td className="px-4 py-3 text-center font-bold text-blue-800">{fMinusK}</td>
            <td className="px-4 py-3 text-center text-gray-400">—</td>
            <td className="px-4 py-3 text-center text-gray-400">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ScoreTable({ data, showKCorrection = false, showTScore = true }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-4 py-3 font-semibold text-gray-600">Scale</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-600">Raw Score</th>
            {showKCorrection && <th className="px-4 py-3 text-center font-semibold text-gray-600">K-Corrected</th>}
            {showTScore && <th className="px-4 py-3 text-center font-semibold text-gray-600">T-Score</th>}
            {showTScore && <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const hasTScore = showTScore && d.t_score !== null && d.t_score !== undefined
            const elevated = hasTScore && d.t_score >= 65
            return (
              <tr key={d.scale || d.key} className={`border-b border-gray-100 ${elevated ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{d.label}</td>
                <td className="px-4 py-3 text-center text-gray-600">{Math.round(d.raw)}</td>
                {showKCorrection && <td className="px-4 py-3 text-center text-gray-600">{Math.round(d.k_corrected)}</td>}
                {showTScore && <td className="px-4 py-3 text-center font-bold text-gray-800">{hasTScore ? Math.round(d.t_score) : '—'}</td>}
                {showTScore && (
                  <td className="px-4 py-3 text-center">
                    {hasTScore ? (
                      elevated ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Elevated</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Normal</span>
                      )
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TScoreChart({ data, title, height = 350, color = '#3b82f6' }) {
  const filteredData = data.filter(d => d.t_score !== null && d.t_score !== undefined)
  if (filteredData.length === 0) return null
  
  return (
    <div className="mt-6">
      {title && <h4 className="mb-3 text-sm font-semibold text-gray-700">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={filteredData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="short" tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} interval={0} angle={-45} textAnchor="end" height={60} />
          <YAxis domain={[30, 120]} tick={{ fontSize: 11 }} label={{ value: 'T-Score', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={65} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={2}
            label={{ value: 'T=65', position: 'right', fill: '#ef4444', fontSize: 10 }} />
          <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="2 4" strokeWidth={1} />
          <Line type="linear" dataKey="t_score" stroke={color} strokeWidth={2}
            dot={<CustomDot />} activeDot={{ r: 8, stroke: color, strokeWidth: 2, fill: '#fff' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function RawScoreChart({ data, title, height = 300, color = '#8b5cf6' }) {
  const maxRaw = Math.max(...data.map(d => d.raw), 30)
  return (
    <div className="mt-6">
      {title && <h4 className="mb-3 text-sm font-semibold text-gray-700">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="short" tick={{ fontSize: 9, fontWeight: 600 }} tickLine={false} interval={0} angle={-45} textAnchor="end" height={60} />
          <YAxis domain={[0, Math.ceil(maxRaw / 10) * 10 + 5]} tick={{ fontSize: 11 }} label={{ value: 'Raw Score', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
          <Tooltip content={<RawScoreTooltip />} />
          <Line type="linear" dataKey="raw" stroke={color} strokeWidth={2}
            dot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
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
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!results) {
    return (
      <div className="text-center py-16 text-gray-500">{error || 'No results found.'}</div>
    )
  }

  const { raw_scores, k_corrected_scores, t_scores, harris_lingoes_subscales, si_subscales, supplementary_scales } = results

  // Get TRIN direction
  const trinDirection = supplementary_scales?.TRIN?.direction || null

  // Validity Scales Data (L, F, K + Fb, VRIN, TRIN)
  const validityData = VALIDITY_KEYS.map(key => ({
    scale: key,
    label: SCALE_LABELS[key] || key,
    short: SHORT_LABELS[key] || key,
    raw: raw_scores[key] || 0,
    t_score: t_scores[key] || 50,
  }))
  
  // Add Fb from supplementary
  if (supplementary_scales?.Fb !== undefined) {
    const fbData = supplementary_scales.Fb
    validityData.push({
      scale: 'Fb',
      label: SCALE_LABELS['Fb'],
      short: 'Fb',
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
      raw: getSubscaleValue(trinData, 'raw') ?? trinData,
      t_score: getSubscaleValue(trinData, 't_score'),
    })
  }

  const fMinusK = Math.round((raw_scores.F || 0) - (raw_scores.K || 0))

  // Clinical Scales Data
  const clinicalData = CLINICAL_KEYS.map(key => ({
    scale: key,
    key,
    label: SCALE_LABELS[key] || key,
    short: SHORT_LABELS[key] || key,
    raw: raw_scores[key] || 0,
    k_corrected: k_corrected_scores[key] || 0,
    t_score: t_scores[key] || 50,
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
      const labelSuffix = key === 'TRIN' && trinDirection ? ` (${trinDirection})` : ''
      return {
        scale: key,
        key,
        label: (SUPPLEMENTARY_LABELS[key] || key) + labelSuffix,
        short: key,
        raw: getSubscaleValue(scaleData, 'raw') ?? scaleData,
        t_score: getSubscaleValue(scaleData, 't_score'),
      }
    })

  const elevatedClinical = clinicalData.filter(d => d.t_score >= 65)

  const dobDisplay = results.patient_dob
    ? new Date(results.patient_dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  const sections = [
    { id: 'validity', label: 'Validity Scales', icon: Shield },
    { id: 'clinical', label: 'Clinical Scales', icon: Activity },
    { id: 'harris', label: 'Harris-Lingoes & Si', icon: Layers },
    { id: 'supplementary', label: 'Supplementary', icon: FlaskConical },
    { id: 'interpretation', label: 'Interpretation', icon: Brain },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              onClick={() => navigate(backUrl)}
              className="mb-2 flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{results.patient_name}</h1>
            <p className="text-sm text-gray-500">
              {results.patient_gender}, Age {results.patient_age}
              {dobDisplay ? ` (DOB: ${dobDisplay})` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {!interpretation && (
              <button onClick={handleInterpret} className="btn-secondary" disabled={interpreting}>
                {interpreting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                {interpreting ? 'Generating...' : 'AI Interpretation'}
              </button>
            )}
            <a href={getPdfUrl(sessionId)} className="btn-primary" target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {elevatedClinical.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Clinically Elevated Scales (T ≥ 65)</p>
            <p className="mt-1 text-sm text-amber-700">
              {elevatedClinical.map(d => `${SHORT_LABELS[d.scale] || d.scale}: T=${d.t_score}`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {sections.map(sec => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors min-w-[120px] ${
              activeSection === sec.id
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <sec.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{sec.label}</span>
          </button>
        ))}
      </div>

      {/* Validity Scales */}
      {activeSection === 'validity' && (
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
            <Shield className="h-5 w-5 text-purple-500" />
            Validity Scales
          </h3>
          <p className="mb-4 text-sm text-gray-500">
            Validity scales assess test-taking attitude and response consistency.
          </p>
          <ValidityScoreTable data={validityData} fMinusK={fMinusK} trinDirection={trinDirection} />
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>F - K Index:</strong> {fMinusK} — 
              {fMinusK > 11 ? ' May indicate exaggeration or faking bad' : 
               fMinusK < -11 ? ' May indicate defensiveness or faking good' : 
               ' Within normal limits'}
            </p>
          </div>
          {trinDirection && (
            <div className="mt-2 p-3 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-800">
                <strong>TRIN Direction:</strong> {trinDirection === 'T' ? 'True' : 'False'} responding — 
                {trinDirection === 'T' ? ' Tendency to answer True indiscriminately (acquiescence)' : ' Tendency to answer False indiscriminately (non-acquiescence)'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Clinical Scales */}
      {activeSection === 'clinical' && (
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
            <Activity className="h-5 w-5 text-blue-500" />
            Clinical Scales
          </h3>
          <ScoreTable data={clinicalData} showKCorrection={true} showTScore={true} />
          <TScoreChart 
            data={clinicalData.map(d => ({ ...d, short: SHORT_LABELS[d.scale] || d.scale }))} 
            title="Clinical Scales T-Score Profile"
            color="#3b82f6"
          />
        </div>
      )}

      {/* Harris-Lingoes & Si Subscales */}
      {activeSection === 'harris' && (
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
            <Layers className="h-5 w-5 text-green-500" />
            Harris-Lingoes Subscales & Si Subscales
          </h3>
          <p className="mb-4 text-sm text-gray-500">
            These subscales provide more detailed interpretation of the clinical scales.
          </p>
          {combinedSubscalesData.length > 0 ? (
            <>
              <ScoreTable data={combinedSubscalesData} showKCorrection={false} showTScore={true} />
              <TScoreChart 
                data={combinedSubscalesData} 
                title="Harris-Lingoes & Si Subscales T-Score Profile"
                height={400}
                color="#22c55e"
              />
            </>
          ) : (
            <p className="text-gray-500 text-center py-8">No subscale data available.</p>
          )}
        </div>
      )}

      {/* Supplementary Scales */}
      {activeSection === 'supplementary' && (
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
            <FlaskConical className="h-5 w-5 text-orange-500" />
            Supplementary Scales
          </h3>
          <p className="mb-4 text-sm text-gray-500">
            Additional scales measuring anxiety, repression, ego strength, substance use risk, response consistency, and gender roles.
          </p>
          {supplementaryData.length > 0 ? (
            <>
              <ScoreTable data={supplementaryData} showKCorrection={false} showTScore={true} />
              <TScoreChart 
                data={supplementaryData} 
                title="Supplementary Scales T-Score Profile"
                height={350}
                color="#f97316"
              />
            </>
          ) : (
            <p className="text-gray-500 text-center py-8">No supplementary scale data available.</p>
          )}
        </div>
      )}

      {/* Interpretation */}
      {activeSection === 'interpretation' && (
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
            <Brain className="h-5 w-5 text-purple-500" />
            Clinical Interpretation
          </h3>
          {interpretation ? (
            <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-3 prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-li:leading-relaxed prose-li:my-2 prose-strong:text-gray-800">
              <ReactMarkdown>{interpretation}</ReactMarkdown>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Brain className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="mb-4 text-gray-500">No interpretation generated yet.</p>
              <button onClick={handleInterpret} className="btn-primary" disabled={interpreting}>
                {interpreting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Brain className="h-4 w-4" /> Generate AI Interpretation</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
