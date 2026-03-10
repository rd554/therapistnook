import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import ReactMarkdown from 'react-markdown'
import {
  Loader2, Download, Brain, BarChart3, FileText, AlertTriangle, TrendingUp, ArrowLeft,
} from 'lucide-react'
import { getSessionResults, interpretResults, getPdfUrl } from '../api/client'

const CLINICAL_KEYS = ['1_Hs', '2_D', '3_Hy', '4_Pd', '5_Mf', '6_Pa', '7_Pt', '8_Sc', '9_Ma', '0_Si']

const SHORT_LABELS = {
  'L': 'L', 'F': 'F', 'K': 'K',
  '1_Hs': 'Hs', '2_D': 'D', '3_Hy': 'Hy', '4_Pd': 'Pd', '5_Mf': 'Mf',
  '6_Pa': 'Pa', '7_Pt': 'Pt', '8_Sc': 'Sc', '9_Ma': 'Ma', '0_Si': 'Si',
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-bold text-gray-800">{d.label}</p>
      <p className="text-sm text-primary-600">T-Score: <strong>{d.t_score}</strong></p>
      <p className="text-xs text-gray-500">Raw: {d.raw} | K-Corrected: {d.k_corrected}</p>
      {d.t_score >= 65 && (
        <p className="mt-1 text-xs font-semibold text-red-500">Clinically Elevated</p>
      )}
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

export default function Results() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [results, setResults] = useState(null)
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(true)
  const [interpreting, setInterpreting] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('profile')

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

  const clinicalData = results.profile_data.filter(d => CLINICAL_KEYS.includes(d.scale))
  const validityData = results.profile_data.filter(d => ['L', 'F', 'K'].includes(d.scale))

  const chartData = clinicalData.map(d => ({ ...d, short: SHORT_LABELS[d.scale] || d.scale }))
  const validityChartData = validityData.map(d => ({ ...d, short: SHORT_LABELS[d.scale] || d.scale }))
  const elevatedScales = clinicalData.filter(d => d.t_score >= 65)

  const dobDisplay = results.patient_dob
    ? new Date(results.patient_dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              onClick={() => navigate('/dashboard')}
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

      {elevatedScales.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Clinically Elevated Scales (T ≥ 65)</p>
            <p className="mt-1 text-sm text-amber-700">
              {elevatedScales.map(d => `${d.label}: T=${d.t_score}`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {[
          { id: 'profile', label: 'Profile Graph', icon: BarChart3 },
          { id: 'scores', label: 'Score Table', icon: FileText },
          { id: 'interpretation', label: 'Interpretation', icon: Brain },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Graph */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
              <TrendingUp className="h-5 w-5 text-primary-500" />
              Clinical Scales Profile
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="short" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} />
                <YAxis domain={[30, 120]} tick={{ fontSize: 11 }} label={{ value: 'T-Score', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={65} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={2}
                  label={{ value: 'T=65 Clinical Threshold', position: 'right', fill: '#ef4444', fontSize: 11 }} />
                <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="2 4" strokeWidth={1} />
                <Line type="linear" dataKey="t_score" stroke="#3b82f6" strokeWidth={3}
                  dot={<CustomDot />} activeDot={{ r: 8, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3 className="mb-4 text-lg font-bold text-gray-800">Validity Scales</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={validityChartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="short" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} />
                <YAxis domain={[30, 120]} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={65} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={2} />
                <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="2 4" strokeWidth={1} />
                <Line type="linear" dataKey="t_score" stroke="#8b5cf6" strokeWidth={3}
                  dot={{ r: 5, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Score Table */}
      {activeTab === 'scores' && (
        <div className="card overflow-hidden">
          <h3 className="mb-4 text-lg font-bold text-gray-800">Complete Score Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">Scale</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Raw Score</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">K-Corrected</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">T-Score</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.profile_data.map((d, i) => {
                  const elevated = d.t_score >= 65
                  return (
                    <tr key={d.scale} className={`border-b border-gray-100 ${elevated ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{d.label}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{typeof d.raw === 'number' ? d.raw.toFixed(1) : d.raw}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{typeof d.k_corrected === 'number' ? d.k_corrected.toFixed(1) : d.k_corrected}</td>
                      <td className="px-4 py-3 text-center font-bold text-gray-800">{typeof d.t_score === 'number' ? d.t_score.toFixed(1) : d.t_score}</td>
                      <td className="px-4 py-3 text-center">
                        {elevated ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Elevated</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Normal</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interpretation */}
      {activeTab === 'interpretation' && (
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
            <Brain className="h-5 w-5 text-purple-500" />
            Clinical Interpretation
          </h3>
          {interpretation ? (
            <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-strong:text-gray-800">
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
