import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ArrowLeft, ChevronDown, ChevronRight, History, RefreshCw, Sparkle,
  User, FileText, Target, HelpCircle, Calendar, Activity, TrendingUp,
  Users, AlertTriangle, Clock, CheckCircle, XCircle, Loader2, AlertCircle,
  X, Send, ShieldAlert, Brain,
} from 'lucide-react'
import {
  getClinicalIntelligence,
  getClinicalIntelligenceStats,
  processClinicalIntelligence,
  listPendingUpdates,
  reviewUpdate,
  bulkReviewUpdates,
  listClinicalIntelligenceVersions,
  getClinicalIntelligenceChat,
  askClinicalIntelligenceChat,
} from '../api/client'
import { NoClinicalIntelligence } from './ui'
import { formatDate } from '../utils/date'

// ---- formatting layer (colour rule §10: format raw data before render,
// this is not a CSS fix) ------------------------------------------------
// "job_change" -> "Job change" - sentence case, not title case, matching
// §B7's sentence-case rule for every label on this screen.
function formatEnum(value) {
  if (!value) return ''
  const words = value.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// ISO timestamp -> "Aug 20", used in the tighter ci-row-meta/tnum slots
// (treatment goals, pending-source group headers) matching the prototype.
function formatDateShort(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Sentence-cases a TABS label ("Documents & Assessments" -> "Documents &
// assessments") for the section switcher, without touching the shared TABS
// array in PatientProfile.jsx (other tabs still render it title-case).
function sentenceCase(label) {
  if (!label) return ''
  const lower = label.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Ordered-scale colour rule (§ colour table): high confidence is never
// shown - "(not shown)" in the reference block - only ever flagged when
// something is genuinely uncommon (low). Confidence lives on each item
// (symptom/diagnosis/etc), not on the source citation, so this takes the
// section's *items*, not its sources.
function confidenceNote(items) {
  const withConfidence = (items || []).filter(i => i?.confidence)
  if (withConfidence.length === 0) return null
  const lowCount = withConfidence.filter(i => i.confidence === 'low').length
  if (lowCount > 0) return { text: `${lowCount} low confidence`, warn: true }
  if (withConfidence.every(i => i.confidence === 'high')) return { text: 'all high confidence', warn: false }
  return null
}

// Diagnoses: ordered scale is History/Current/Provisional, not a colour
// per status - "current" (DiagnosisItem.status, schemas.py) is never red
// (see closed-palette rule, and the old STATUS_COLORS.active = red bug
// this replaces). Real values are current/historical/provisional/ruled_out.
function diagnosisStatusMeta(status) {
  switch (status) {
    case 'current':
      return { label: 'Current', cls: 'status-plain' }
    case 'historical':
      return { label: 'History', cls: 'status-quiet' }
    case 'ruled_out':
      return { label: 'Ruled out', cls: 'status-quiet' }
    case 'provisional':
      return { label: 'Provisional', cls: 'status-plain' }
    default:
      return { label: formatEnum(status) || 'Current', cls: 'status-plain' }
  }
}

// Shared ordered-scale mapping for symptom severity AND risk severity -
// both use the same low/moderate(mild)/high(severe)/critical vocabulary,
// coloured only at the top of the scale (§ colour table).
function severityMeta(severity) {
  switch (severity) {
    case 'low':
    case 'mild':
      return { label: formatEnum(severity), cls: 'status-plain' }
    case 'moderate':
      return { label: 'Moderate', cls: 'status-plain' }
    case 'high':
    case 'severe':
      return { label: formatEnum(severity), cls: 'status-warn' }
    case 'critical':
      return { label: 'Critical', cls: 'status-alert' }
    default:
      return { label: formatEnum(severity) || 'Unknown', cls: 'status-plain' }
  }
}

// Outstanding-question priority: Low/Medium are quiet, High is the only
// one that earns colour.
function priorityMeta(priority) {
  if (priority === 'high') return { label: 'High priority', cls: 'status-warn' }
  return { label: `${formatEnum(priority) || 'Low'} priority`, cls: 'status-quiet' }
}

const SOURCE_TYPE_META = {
  clinical_history: { label: 'Clinical History', icon: FileText },
  therapy_session: { label: 'Therapy Session', icon: Activity },
  assessment: { label: 'Assessment', icon: TrendingUp },
  mmpi_interpretation: { label: 'MMPI-2 Interpretation', icon: Brain },
  document: { label: 'Document', icon: FileText },
}

function sourceGroupMeta(sourceType) {
  return SOURCE_TYPE_META[sourceType] || {
    label: sourceType ? formatEnum(sourceType) : 'Unknown source',
    icon: Sparkle,
  }
}

// Multiple extracted facts often cite the same session, producing several
// identical (type, date) source entries - collapsed here to one entry with
// a ×N count instead of repeating the same label.
function groupSources(sources) {
  const grouped = []
  const byKey = new Map()
  for (const source of sources || []) {
    const label = sourceGroupMeta(source.source_type).label
    const date = source.date ? formatDateShort(source.date) : null
    const key = `${label}|${date || ''}`
    const existing = byKey.get(key)
    if (existing) {
      existing.count += 1
    } else {
      const entry = { label, date, count: 1, excerpt: source.excerpt }
      byKey.set(key, entry)
      grouped.push(entry)
    }
  }
  return grouped
}

// Groups pending updates by the source event that produced them (e.g. one
// clinical-history save, one therapy session) rather than showing a flat
// list, so a practitioner can review "everything from Tuesday's session" as
// a unit. `pendingUpdates` arrives newest-first, so the first time a
// group's key is seen is always its most recent item - no separate sort.
function groupPendingUpdates(updates) {
  const groups = []
  const indexByKey = new Map()
  for (const update of updates) {
    const key = `${update.source_type || 'unknown'}::${update.source_id || 'none'}`
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length)
      groups.push({ key, sourceType: update.source_type, sourceId: update.source_id, updates: [] })
    }
    groups[indexByKey.get(key)].updates.push(update)
  }
  return groups
}

const CONFIDENCE_FILTERS = ['all', 'high', 'medium', 'low']

const TIMELINE_ICONS = {
  clinical_history: FileText, assessment: TrendingUp, session: Activity,
  therapy_session: Activity, report: FileText, life_event: Calendar,
  risk_event: AlertTriangle, diagnosis: FileText, treatment: Target,
}

// Narrow-viewport check backing the Ask Nook panel's aria-modal: desktop is
// a non-modal floating panel (record stays readable behind it, no scrim),
// mobile is a modal sheet over a scrim (same breakpoint as .nook-panel's
// CSS media query in clinical-ink.css).
function useIsNarrow(breakpointPx = 640) {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpointPx
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`)
    const handler = (e) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpointPx])
  return isNarrow
}

export default function ClinicalIntelligenceTab({ patientId, patient, sectionOptions, onSectionChange, onBack }) {
  const [intelligence, setIntelligence] = useState(null)
  const [stats, setStats] = useState(null)
  const [pendingUpdates, setPendingUpdates] = useState([])
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [showVersions, setShowVersions] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [confidenceFilter, setConfidenceFilter] = useState('all')
  const [sectionOpen, setSectionOpen] = useState(false)
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const sectionRef = useRef(null)
  const mobileSectionRef = useRef(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const [intelligenceData, statsData, updatesData] = await Promise.all([
        getClinicalIntelligence(patientId),
        getClinicalIntelligenceStats(patientId),
        listPendingUpdates(patientId),
      ])
      setIntelligence(intelligenceData)
      setStats(statsData)
      setPendingUpdates(updatesData)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load Clinical Intelligence')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  useEffect(() => {
    function handleClickOutside(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) setSectionOpen(false)
    }
    if (sectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sectionOpen])

  useEffect(() => {
    function handleClickOutside(e) {
      if (mobileSectionRef.current && !mobileSectionRef.current.contains(e.target)) setMobileSectionOpen(false)
    }
    if (mobileSectionOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileSectionOpen])

  const handleProcess = async () => {
    try {
      setProcessing(true)
      await processClinicalIntelligence(patientId)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process')
    } finally {
      setProcessing(false)
    }
  }

  const handleReviewUpdate = async (updateId, action) => {
    try {
      await reviewUpdate(patientId, updateId, action)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to review update')
    }
  }

  const handleBulkApprove = async (updateIds = null) => {
    try {
      await bulkReviewUpdates(patientId, 'approve', updateIds)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to approve updates')
    }
  }

  const handleBulkReject = async (updateIds = null) => {
    try {
      await bulkReviewUpdates(patientId, 'reject', updateIds)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reject updates')
    }
  }

  const loadVersions = async () => {
    try {
      const versionsData = await listClinicalIntelligenceVersions(patientId)
      setVersions(versionsData)
      setShowVersions(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load versions')
    }
  }

  // These must run on every render regardless of loading/error state - the
  // early returns below would otherwise change the hook count between
  // renders (Rules of Hooks).
  const confidenceCounts = useMemo(() => {
    const counts = { all: pendingUpdates.length, high: 0, medium: 0, low: 0 }
    for (const u of pendingUpdates) {
      if (counts[u.confidence] !== undefined) counts[u.confidence] += 1
    }
    return counts
  }, [pendingUpdates])

  const filteredPendingUpdates = useMemo(
    () => confidenceFilter === 'all'
      ? pendingUpdates
      : pendingUpdates.filter(u => u.confidence === confidenceFilter),
    [pendingUpdates, confidenceFilter]
  )

  const pendingGroups = useMemo(
    () => groupPendingUpdates(filteredPendingUpdates),
    [filteredPendingUpdates]
  )

  const hasPendingUpdates = pendingUpdates.length > 0

  const isEmpty = !intelligence?.patient_summary &&
    !(intelligence?.symptoms?.length) &&
    !(intelligence?.diagnoses?.length) &&
    !(intelligence?.treatment_goals?.length)

  const currentSectionLabel = sentenceCase(
    sectionOptions?.find(o => o.value === 'clinical-intelligence')?.label || 'Clinical intelligence'
  )

  return (
    <div className="clinical-ink ci-page">
      {/* Desktop patient header + section switcher.
          Wrapped in a plain "hidden sm:block" div rather than putting
          "hidden sm:flex" directly on .ci-patient-head: Tailwind's .hidden
          is (0,1,0) specificity, .clinical-ink .ci-patient-head's own
          `display: flex` is (0,2,0) and would win, showing this row on
          mobile alongside the mobile block below. A wrapper's display
          doesn't compete with its child's. */}
      <div className="hidden sm:block">
        <div className="ci-patient-head">
          <div className="ci-patient-id">
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" onClick={onBack}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="ci-patient-name">
              <h1 className="t-h1">{patient?.full_name}</h1>
              <span className="t-body-s">
                {patient?.age != null ? `${patient.age} yrs` : ''}
                {patient?.age != null && patient?.gender ? ' · ' : ''}
                {patient?.gender}
              </span>
            </div>
          </div>
          <div ref={sectionRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-secondary"
              aria-haspopup="true"
              aria-expanded={sectionOpen}
              onClick={() => setSectionOpen(v => !v)}
            >
              {currentSectionLabel}
              <ChevronDown size={16} strokeWidth={1.5} />
            </button>
            {sectionOpen && (
              <div className="menu-popover align-right">
                {(sectionOptions || []).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className="menu-item"
                    onClick={() => { onSectionChange?.(opt.value); setSectionOpen(false) }}
                  >
                    {sentenceCase(opt.label)}{opt.badge ? ` · ${opt.badge}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop toolbar - same "hidden sm:block" wrapper reasoning as the
          patient header above (.ci-toolbar also sets its own display:flex). */}
      <div className="hidden sm:block">
        <div className="ci-toolbar">
          <h2 className="t-h2">Clinical intelligence</h2>
          <div className="ci-toolbar-actions">
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-icon-sm"
              aria-label="Version history"
              title="Version history"
              onClick={loadVersions}
            >
              <History size={16} strokeWidth={1.5} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleProcess} disabled={processing}>
              {processing && <Loader2 size={14} className="animate-spin" />}
              {processing ? 'Processing…' : 'Reprocess sources'}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${showChat ? 'btn-active' : 'btn-primary'}`}
              onClick={() => setShowChat(v => !v)}
            >
              <Sparkle size={16} strokeWidth={1.5} />
              Ask Nook
            </button>
          </div>
        </div>
      </div>

      {/* Mobile patient header, section switcher and actions */}
      <div className="flex sm:hidden flex-col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="ci-patient-id">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Back to patients" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="ci-patient-name">
            <h1 className="t-h1" style={{ fontSize: '24px', lineHeight: '30px' }}>{patient?.full_name}</h1>
            <span className="t-body-s">
              {patient?.age != null ? `${patient.age} yrs` : ''}
              {patient?.age != null && patient?.gender ? ' · ' : ''}
              {patient?.gender}
            </span>
          </div>
        </div>

        <div ref={mobileSectionRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'space-between' }}
            aria-haspopup="true"
            aria-expanded={mobileSectionOpen}
            onClick={() => setMobileSectionOpen(v => !v)}
          >
            {currentSectionLabel}
            <ChevronDown size={16} strokeWidth={1.5} />
          </button>
          {mobileSectionOpen && (
            <div className="menu-popover" style={{ width: '100%' }}>
              {(sectionOptions || []).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className="menu-item"
                  onClick={() => { onSectionChange?.(opt.value); setMobileSectionOpen(false) }}
                >
                  {sentenceCase(opt.label)}{opt.badge ? ` · ${opt.badge}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="action-row">
          <button
            type="button"
            className={`btn grow ${showChat ? 'btn-active' : 'btn-primary'}`}
            onClick={() => setShowChat(v => !v)}
          >
            <Sparkle size={16} strokeWidth={1.5} />
            Ask Nook
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            aria-label="Reprocess sources"
            title="Reprocess sources"
            onClick={handleProcess}
            disabled={processing}
          >
            {processing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} strokeWidth={1.5} />}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            aria-label="Version history"
            title="Version history"
            onClick={loadVersions}
          >
            <History size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
        </div>
      ) : error ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)' }}>
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: 'var(--icon-muted)', margin: '0 auto var(--space-3)' }} />
          <p className="t-body-s">{error}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={loadData}>
            Try again
          </button>
        </div>
      ) : (
        <div className="stack-lg">
          {hasPendingUpdates && (
            <PendingUpdatesCard
              pendingUpdates={pendingUpdates}
              filteredPendingUpdates={filteredPendingUpdates}
              pendingGroups={pendingGroups}
              confidenceFilter={confidenceFilter}
              setConfidenceFilter={setConfidenceFilter}
              confidenceCounts={confidenceCounts}
              onApprove={(id) => handleReviewUpdate(id, 'approve')}
              onReject={(id) => handleReviewUpdate(id, 'reject')}
              onBulkApprove={handleBulkApprove}
              onBulkReject={handleBulkReject}
            />
          )}

          {isEmpty && !hasPendingUpdates && (
            <div className="card">
              <NoClinicalIntelligence onProcess={handleProcess} />
            </div>
          )}

          {!isEmpty && (
            <>
              <PatientSummaryCard summary={intelligence?.patient_summary} stats={stats} />

              <ClinicalPictureCard
                diagnoses={intelligence?.diagnoses}
                symptoms={intelligence?.symptoms}
                riskFactors={intelligence?.risk_factors}
              />

              <TreatmentGoalsCard goals={intelligence?.treatment_goals} />

              <OutstandingQuestionsCard questions={intelligence?.outstanding_questions} />

              <MoreDetailSection
                relationships={intelligence?.relationships}
                lifeEvents={intelligence?.life_events}
                timeline={intelligence?.timeline}
              />

              {intelligence?.updated_at && (
                <div className="t-caption" style={{ textAlign: 'center', padding: 'var(--space-6) 0 var(--space-8)' }}>
                  Updated {formatDate(intelligence.updated_at)}
                  {intelligence.last_source_type && ` · Source: ${formatEnum(intelligence.last_source_type)}`}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showVersions && (
        <VersionHistoryModal
          versions={versions}
          recentChanges={intelligence?.recent_changes}
          onClose={() => setShowVersions(false)}
        />
      )}

      {showChat && (
        <>
          <div className="nook-scrim" onClick={() => setShowChat(false)} />
          <NookPanel patientId={patientId} patientName={patient?.full_name} onClose={() => setShowChat(false)} />
        </>
      )}
    </div>
  )
}

function PatientSummaryCard({ summary, stats }) {
  if (!summary?.text) return null

  const tags = [
    stats?.current_diagnoses > 0 && `${stats.current_diagnoses} current diagnos${stats.current_diagnoses === 1 ? 'is' : 'es'}`,
    stats?.current_goals > 0 && `${stats.current_goals} active goal${stats.current_goals === 1 ? '' : 's'}`,
    stats?.outstanding_questions > 0 && `${stats.outstanding_questions} open question${stats.outstanding_questions === 1 ? '' : 's'}`,
  ].filter(Boolean)

  return (
    <div className="card-narrative">
      <div className="ci-card-head">
        <span className="icon-badge"><User size={16} strokeWidth={1.5} /></span>
        <span className="t-h3">Patient summary</span>
      </div>
      <p className="t-narrative">{summary.text}</p>
      {tags.length > 0 && (
        <div className="t-caption" style={{ marginTop: 'var(--space-5)' }}>{tags.join(' · ')}</div>
      )}
      {/* No confidence note here - patient_summary has no per-item
          confidence, only the sections below (diagnoses/symptoms/etc) do. */}
      <SourcesDisclose sources={summary.sources} />
    </div>
  )
}

// Diagnoses, symptoms and active risk factors, grouped under one card -
// the three things that answer "what's going on with this patient". Risk
// factors have no card slot in the approved mockup (Elena, the mock
// patient, has none active) but backend/clinical_intelligence.py extracts
// them as a first-class section, so they're folded in here as a third
// sub-group using the same .ci-line/ordered-scale vocabulary as diagnoses
// and symptoms rather than left with nowhere to render.
function ClinicalPictureCard({ diagnoses, symptoms, riskFactors }) {
  const hasDiagnoses = diagnoses?.length > 0
  const hasSymptoms = symptoms?.length > 0
  const activeRisks = (riskFactors || []).filter(r => r.status !== 'resolved')
  const hasRisks = activeRisks.length > 0
  if (!hasDiagnoses && !hasSymptoms && !hasRisks) return null

  const allSources = [
    ...(hasDiagnoses ? diagnoses.flatMap(d => d.sources || []) : []),
    ...(hasSymptoms ? symptoms.flatMap(s => s.sources || []) : []),
    ...(hasRisks ? activeRisks.flatMap(r => r.sources || []) : []),
  ]
  const allItems = [...(diagnoses || []), ...(symptoms || []), ...activeRisks]

  return (
    <div className="card">
      <div className="ci-card-head">
        <span className="icon-badge"><FileText size={16} strokeWidth={1.5} /></span>
        <span className="t-h3">Clinical picture</span>
      </div>

      {hasDiagnoses && (
        <>
          <div className="ci-sub" style={{ marginTop: 0 }}>
            <span className="t-h4">Diagnoses</span>
            <span className="t-caption ci-count">{diagnoses.length} total</span>
          </div>
          {diagnoses.map((d, idx) => {
            const status = diagnosisStatusMeta(d.status)
            return (
              <div key={d.id || idx} className="ci-line">
                <span className="t-cell">{d.name}{d.icd_code ? ` (ICD-10 ${d.icd_code})` : ''}</span>
                <span className={`ci-line-meta ${status.cls}`}>{status.label}</span>
              </div>
            )
          })}
        </>
      )}

      {hasSymptoms && (
        <>
          <div className="ci-sub">
            <span className="t-h4">Symptoms</span>
            <span className="t-caption ci-count">{symptoms.length} total</span>
          </div>
          {symptoms.map((s, idx) => {
            const sev = s.severity ? severityMeta(s.severity) : null
            return (
              <div key={s.id || idx} className="ci-line">
                <span className="t-cell">{s.name}</span>
                {sev && <span className={`ci-line-meta ${sev.cls}`}>{sev.label}</span>}
              </div>
            )
          })}
        </>
      )}

      {hasRisks && (
        <>
          <div className="ci-sub">
            <span className="t-h4">Risk factors</span>
            <span className="t-caption ci-count">{activeRisks.length} total</span>
          </div>
          {activeRisks.map((r, idx) => {
            const sev = severityMeta(r.severity)
            return (
              <div key={r.id || idx} className="ci-row">
                <ChevronRight size={16} strokeWidth={1.5} className="ci-row-caret" />
                <div className="ci-row-body">
                  <span className="t-cell ci-row-text">
                    {formatEnum(r.risk_type)}
                  </span>
                  {r.last_assessment && <span className="t-caption tnum">{formatDateShort(r.last_assessment)}</span>}
                </div>
                <span className={`ci-row-meta ${sev.cls}`}>{sev.label}</span>
              </div>
            )
          })}
        </>
      )}

      <SourcesDisclose sources={allSources} items={allItems} />
    </div>
  )
}

// Goal text is often a full session note, not a short label - clamped to 2
// lines and tap-to-expand in place. Status is only shown when it deviates
// from the default (active/ongoing) - not an ordered scale, so never
// coloured, just a quiet caption addition so a completed/discontinued goal
// doesn't silently look identical to a current one.
function GoalRow({ goal }) {
  const [expanded, setExpanded] = useState(false)
  const date = goal.created_date && formatDateShort(goal.created_date)
  // TreatmentGoalItem.status is current/completed/ongoing/discontinued
  // (schemas.py) - "current" and "ongoing" are the unremarkable defaults,
  // so only completed/discontinued earn a caption.
  const showStatus = goal.status && !['current', 'ongoing'].includes(goal.status)

  return (
    <button type="button" className="ci-row" style={rowButtonStyle} onClick={() => setExpanded(v => !v)}>
      {expanded
        ? <ChevronDown size={16} strokeWidth={1.5} className="ci-row-caret" />
        : <ChevronRight size={16} strokeWidth={1.5} className="ci-row-caret" />}
      <div className="ci-row-body">
        <span className={expanded ? 't-cell' : 't-cell ci-row-text'}>{goal.goal}</span>
        <span className="t-caption tnum">
          {date}{showStatus ? ` · ${formatEnum(goal.status)}` : ''}
        </span>
      </div>
    </button>
  )
}

const rowButtonStyle = {
  width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', font: 'inherit',
}

function TreatmentGoalsCard({ goals }) {
  const [showAll, setShowAll] = useState(false)
  if (!goals?.length) return null

  const visible = showAll ? goals : goals.slice(0, 3)
  const remaining = goals.length - visible.length

  return (
    <div className="card">
      <div className="ci-card-head">
        <span className="icon-badge"><Target size={16} strokeWidth={1.5} /></span>
        <span className="t-h3">Treatment goals</span>
        <span className="t-caption ci-count">{goals.length} total</span>
      </div>
      {visible.map((g, idx) => <GoalRow key={g.id || idx} goal={g} />)}
      {remaining > 0 && (
        <button type="button" className="ci-disclose" style={{ justifyContent: 'center' }} onClick={() => setShowAll(true)}>
          Show {remaining} more goal{remaining === 1 ? '' : 's'}
          <ChevronDown size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

function QuestionRow({ question }) {
  const [expanded, setExpanded] = useState(false)
  const date = question.created_date && formatDateShort(question.created_date)
  const meta = priorityMeta(question.priority)

  return (
    <button type="button" className="ci-row" style={rowButtonStyle} onClick={() => setExpanded(v => !v)}>
      {expanded
        ? <ChevronDown size={16} strokeWidth={1.5} className="ci-row-caret" />
        : <ChevronRight size={16} strokeWidth={1.5} className="ci-row-caret" />}
      <div className="ci-row-body">
        <span className={expanded ? 't-cell' : 't-cell ci-row-text'}>{question.question}</span>
        {date && <span className="t-caption tnum">{date}</span>}
      </div>
      <span className={`ci-row-meta ${meta.cls}`}>{meta.label}</span>
    </button>
  )
}

function OutstandingQuestionsCard({ questions }) {
  const [showAll, setShowAll] = useState(false)
  const unresolved = (questions || []).filter(q => !q.resolved)
  if (unresolved.length === 0) return null

  const visible = showAll ? unresolved : unresolved.slice(0, 3)
  const remaining = unresolved.length - visible.length

  return (
    <div className="card">
      <div className="ci-card-head">
        <span className="icon-badge"><HelpCircle size={16} strokeWidth={1.5} /></span>
        <span className="t-h3">Outstanding questions</span>
        <span className="t-caption ci-count">{unresolved.length} total</span>
      </div>
      {visible.map((q, idx) => <QuestionRow key={q.id || idx} question={q} />)}
      {remaining > 0 && (
        <button type="button" className="ci-disclose" style={{ justifyContent: 'center' }} onClick={() => setShowAll(true)}>
          Show {remaining} more question{remaining === 1 ? '' : 's'}
          <ChevronDown size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

function RelationshipEntry({ relationship }) {
  return (
    <div className="ci-entry">
      <div className="ci-entry-head">
        <Users size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />
        <span className="t-cell-key">{relationship.person}</span>
        {relationship.relationship_type && <span className="t-caption">{formatEnum(relationship.relationship_type)}</span>}
      </div>
      {relationship.notes && <div className="t-cell">{relationship.notes}</div>}
    </div>
  )
}

function LifeEventEntry({ event }) {
  return (
    <div className="ci-entry">
      <div className="ci-entry-head">
        <Calendar size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />
        <span className="t-cell-key">{event.event}</span>
        {event.event_type && <span className="t-caption">{formatEnum(event.event_type)}</span>}
      </div>
      {event.description && <div className="t-cell">{event.description}</div>}
      {event.date && <div className="t-caption tnum" style={{ marginTop: '6px' }}>{formatDate(event.date)}</div>}
    </div>
  )
}

function TimelineEntry({ item }) {
  const Icon = TIMELINE_ICONS[item.event_type] || Clock
  return (
    <div className="ci-timeline-entry">
      <span className="ci-timeline-dot" />
      <div className="ci-entry">
        <div className="ci-entry-head">
          <Icon size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />
          <span className="t-cell-key">{item.title}</span>
        </div>
        {item.description && <div className="t-cell">{item.description}</div>}
        {item.date && <div className="t-caption tnum" style={{ marginTop: '6px' }}>{formatDate(item.date)}</div>}
      </div>
    </div>
  )
}

// Relationships, life events and timeline: real data, but not what a
// practitioner reads on every visit - collapsed by default. The prototype
// only shows Life events and Timeline (its mock patient has no recorded
// relationships to show); Relationships is kept as a third sub-group here
// since the live data model and the pre-existing component both carry it.
function MoreDetailSection({ relationships, lifeEvents, timeline }) {
  const [expanded, setExpanded] = useState(false)

  const sectionLabels = [
    relationships?.length > 0 && 'Relationships',
    lifeEvents?.length > 0 && 'Life events',
    timeline?.length > 0 && 'Timeline',
  ].filter(Boolean)
  if (sectionLabels.length === 0) return null

  const sortedTimeline = timeline?.length
    ? timeline.slice().sort((a, b) => new Date(b.date) - new Date(a.date))
    : []

  return (
    <div className="ci-more">
      <button
        type="button"
        className="ci-more-head"
        style={{ width: '100%', border: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        {expanded
          ? <ChevronDown size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />
          : <ChevronRight size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />}
        <span className="t-h3">More detail</span>
        <span className="t-body-s">{sectionLabels.join(' · ')}</span>
        <span className="t-caption ci-count">{sectionLabels.length} section{sectionLabels.length === 1 ? '' : 's'}</span>
      </button>
      {expanded && (
        <div className="ci-more-body">
          {relationships?.length > 0 && (
            <>
              <div className="ci-sub" style={{ marginTop: 0 }}><span className="t-h4">Relationships</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {relationships.map((rel, idx) => <RelationshipEntry key={rel.id || idx} relationship={rel} />)}
              </div>
            </>
          )}
          {lifeEvents?.length > 0 && (
            <>
              <div className="ci-sub"><span className="t-h4">Life events</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {lifeEvents.map((event, idx) => <LifeEventEntry key={event.id || idx} event={event} />)}
              </div>
            </>
          )}
          {sortedTimeline.length > 0 && (
            <>
              <div className="ci-sub"><span className="t-h4">Timeline</span></div>
              <div className="ci-timeline">
                {sortedTimeline.map((item, idx) => <TimelineEntry key={item.id || idx} item={item} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Maps a pending update's `section` to the same preview component used
// below, plus the prop name it expects its item under - keeps the
// pending-review queue showing an accurate preview of what the record will
// look like once approved, instead of a raw JSON dump.
const SECTION_CARD_MAP = {
  symptoms: { Component: SymptomPreview, prop: 'symptom' },
  diagnoses: { Component: DiagnosisPreview, prop: 'diagnosis' },
  treatment_goals: { Component: GoalPreview, prop: 'goal' },
  relationships: { Component: RelationshipPreview, prop: 'relationship' },
  life_events: { Component: LifeEventPreview, prop: 'event' },
  risk_factors: { Component: RiskPreview, prop: 'risk' },
  outstanding_questions: { Component: QuestionPreview, prop: 'question' },
  // No `timeline` entry: timeline updates are auto_apply everywhere
  // they're generated, so they essentially never reach this queue.
}

// ---- Pending updates queue --------------------------------------------
// Retained functionality (see clinical-ink.css's header comment on
// .ci-pending-group/.ci-proposal) - restyled onto tokens.css vocabulary
// rather than dropped: no chips, no colour-coded confidence badges, no
// dashed warning borders. Approve/reject are neutral icon buttons, never
// green/red - red stays reserved for safety flags elsewhere on this
// screen (colour rule).
function PendingUpdatesCard({
  pendingUpdates, filteredPendingUpdates, pendingGroups, confidenceFilter,
  setConfidenceFilter, confidenceCounts, onApprove, onReject, onBulkApprove, onBulkReject,
}) {
  return (
    <div className="card">
      <div className="ci-card-head">
        <span className="icon-badge"><Sparkle size={16} strokeWidth={1.5} /></span>
        <span className="t-h3">Pending updates</span>
        <span className="t-caption ci-count">{pendingUpdates.length} total</span>
      </div>
      <p className="t-body-s">Review AI-generated updates before they're added to the record.</p>

      <div className="action-row" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="seg">
          {CONFIDENCE_FILTERS.map(level => (
            <button
              key={level}
              type="button"
              className="seg-option"
              aria-pressed={confidenceFilter === level}
              onClick={() => setConfidenceFilter(level)}
            >
              {level === 'all' ? 'All' : formatEnum(level)} ({confidenceCounts[level]})
            </button>
          ))}
        </div>
        <span className="grow" />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={filteredPendingUpdates.length === 0}
          onClick={() => onBulkReject(confidenceFilter === 'all' ? null : filteredPendingUpdates.map(u => u.id))}
        >
          {confidenceFilter === 'all' ? 'Reject all' : `Reject filtered (${filteredPendingUpdates.length})`}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={filteredPendingUpdates.length === 0}
          onClick={() => onBulkApprove(confidenceFilter === 'all' ? null : filteredPendingUpdates.map(u => u.id))}
        >
          {confidenceFilter === 'all' ? 'Approve all' : `Approve filtered (${filteredPendingUpdates.length})`}
        </button>
      </div>

      <div style={{ marginTop: 'var(--space-4)', maxHeight: '32rem', overflowY: 'auto' }}>
        {pendingGroups.length === 0 ? (
          <p className="t-body-s" style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
            No pending updates match this filter.
          </p>
        ) : (
          pendingGroups.map(group => (
            <PendingSourceGroup
              key={group.key}
              group={group}
              onApprove={onApprove}
              onReject={onReject}
              onApproveGroup={() => onBulkApprove(group.updates.map(u => u.id))}
              onRejectGroup={() => onBulkReject(group.updates.map(u => u.id))}
            />
          ))
        )}
      </div>
    </div>
  )
}

function PendingSourceGroup({ group, onApprove, onReject, onApproveGroup, onRejectGroup }) {
  const meta = sourceGroupMeta(group.sourceType)
  const Icon = meta.icon
  const latestDate = group.updates[0]?.created_at

  return (
    <div className="ci-pending-group">
      <div className="action-row" style={{ flexWrap: 'wrap' }}>
        <Icon size={16} strokeWidth={1.5} style={{ color: 'var(--icon-muted)' }} />
        <span className="t-body-s">
          From {meta.label}{latestDate ? ` — ${formatDateShort(latestDate)}` : ''}
        </span>
        <span className="t-caption">{group.updates.length}</span>
        <span className="grow" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRejectGroup}>
          Reject shown ({group.updates.length})
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onApproveGroup}>
          Approve shown ({group.updates.length})
        </button>
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        {group.updates.map(update => (
          <PendingUpdateCard
            key={update.id}
            update={update}
            onApprove={() => onApprove(update.id)}
            onReject={() => onReject(update.id)}
          />
        ))}
      </div>
    </div>
  )
}

function PendingUpdateCard({ update, onApprove, onReject }) {
  const mapping = SECTION_CARD_MAP[update.section]
  const changes = update.proposed_changes || {}

  return (
    <div className="ci-proposal">
      <div className="action-row" style={{ flexWrap: 'wrap' }}>
        <span className="t-caption">{update.operation === 'update' ? 'Proposed update' : 'Proposed addition'}</span>
        {update.section && <span className="t-caption">· {formatEnum(update.section)}</span>}
        <span className="grow" />
        <div className="ci-pending-actions">
          <button type="button" className="btn btn-ghost btn-icon btn-icon-sm is-destructive" aria-label="Reject" title="Reject" onClick={onReject}>
            <XCircle size={16} strokeWidth={1.5} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Approve" title="Approve" onClick={onApprove}>
            <CheckCircle size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        {mapping ? (
          <mapping.Component {...{ [mapping.prop]: changes }} />
        ) : update.section === 'patient_summary' ? (
          <p className="t-cell">{changes.text}</p>
        ) : (
          <FallbackPendingContent update={update} />
        )}
      </div>
      {update.reasoning && (
        <p className="t-caption" style={{ marginTop: 'var(--space-2)', fontStyle: 'italic' }}>{update.reasoning}</p>
      )}
    </div>
  )
}

function FallbackPendingContent({ update }) {
  return (
    <div>
      <div className="t-caption">
        {formatEnum(update.update_type)}
        {update.confidence === 'low' && <> · <span className="status-warn">Low confidence</span></>}
      </div>
      <p className="t-cell" style={{ marginTop: '4px' }}>
        {update.proposed_changes?.name || update.proposed_changes?.goal || update.proposed_changes?.text ||
          JSON.stringify(update.proposed_changes).slice(0, 100)}
      </p>
      {update.source_excerpt && (
        <p className="t-caption" style={{ marginTop: '4px' }}>Source: {update.source_excerpt.slice(0, 100)}…</p>
      )}
    </div>
  )
}

// ---- Pending-queue preview cards --------------------------------------
// Compact previews of a single proposed change, using the same
// t-cell-key/t-caption/status-* vocabulary as the approved-record rows
// above (never a colour-coded confidence chip - low confidence is the
// only one ever flagged, per the ordered-scale rule).
function SymptomPreview({ symptom }) {
  const sev = symptom.severity ? severityMeta(symptom.severity) : null
  return (
    <div>
      <div className="t-cell-key">{symptom.name}</div>
      <div className="t-caption" style={{ marginTop: '2px' }}>
        {sev && <span className={sev.cls}>{sev.label}</span>}
        {symptom.first_mention && <> · First mentioned {formatDate(symptom.first_mention)}</>}
      </div>
      {symptom.confidence === 'low' && <div className="status-warn" style={{ marginTop: '4px' }}>Low confidence</div>}
    </div>
  )
}

function DiagnosisPreview({ diagnosis }) {
  const status = diagnosisStatusMeta(diagnosis.status)
  return (
    <div>
      <div className="t-cell-key">{diagnosis.name}</div>
      <div className="t-caption" style={{ marginTop: '2px' }}>
        <span className={status.cls}>{status.label}</span>
        {diagnosis.icd_code && <> · ICD-10 {diagnosis.icd_code}</>}
        {diagnosis.diagnosed_date && <> · {formatDate(diagnosis.diagnosed_date)}</>}
      </div>
      {diagnosis.confidence === 'low' && <div className="status-warn" style={{ marginTop: '4px' }}>Low confidence</div>}
    </div>
  )
}

function GoalPreview({ goal }) {
  return (
    <div>
      <p className="t-cell">{goal.goal}</p>
      {goal.target_date && <div className="t-caption tnum" style={{ marginTop: '4px' }}>Target {formatDate(goal.target_date)}</div>}
      {goal.confidence === 'low' && <div className="status-warn" style={{ marginTop: '4px' }}>Low confidence</div>}
    </div>
  )
}

function RiskPreview({ risk }) {
  const sev = severityMeta(risk.severity)
  return (
    <div>
      <div className="t-cell-key">{formatEnum(risk.risk_type)}</div>
      <div className="t-caption" style={{ marginTop: '2px' }}>
        <span className={sev.cls}>{sev.label}</span>
        {risk.status && <> · {formatEnum(risk.status)}</>}
        {risk.last_assessment && <> · {formatDate(risk.last_assessment)}</>}
      </div>
      {risk.confidence === 'low' && <div className="status-warn" style={{ marginTop: '4px' }}>Low confidence</div>}
    </div>
  )
}

function RelationshipPreview({ relationship }) {
  return (
    <div>
      <div className="t-cell-key">{relationship.person}</div>
      {relationship.relationship_type && (
        <div className="t-caption" style={{ marginTop: '2px' }}>{formatEnum(relationship.relationship_type)}</div>
      )}
      {relationship.notes && <p className="t-cell" style={{ marginTop: '4px' }}>{relationship.notes}</p>}
      {relationship.confidence === 'low' && <div className="status-warn" style={{ marginTop: '4px' }}>Low confidence</div>}
    </div>
  )
}

function LifeEventPreview({ event }) {
  return (
    <div>
      <div className="t-cell-key">{event.event}</div>
      <div className="t-caption" style={{ marginTop: '2px' }}>
        {event.event_type && formatEnum(event.event_type)}
        {event.date && <> · {formatDate(event.date)}</>}
      </div>
      {event.description && <p className="t-cell" style={{ marginTop: '4px' }}>{event.description}</p>}
      {event.confidence === 'low' && <div className="status-warn" style={{ marginTop: '4px' }}>Low confidence</div>}
    </div>
  )
}

function QuestionPreview({ question }) {
  const meta = priorityMeta(question.priority)
  return (
    <div>
      <p className="t-cell">{question.question}</p>
      <div className="t-caption" style={{ marginTop: '4px' }}>
        {question.category && <>{formatEnum(question.category)} · </>}
        <span className={meta.cls}>{meta.label}</span>
      </div>
    </div>
  )
}

// Sources disclosure used on the approved-record cards - .ci-disclose's own
// [aria-expanded] CSS rotates the chevron, so no inline style is needed.
function SourcesDisclose({ sources, items }) {
  const [expanded, setExpanded] = useState(false)
  if (!sources?.length) return null

  const note = confidenceNote(items)
  const grouped = groupSources(sources)

  return (
    <>
      <button type="button" className="ci-disclose" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        <ChevronRight size={14} strokeWidth={1.5} />
        <span>
          Sources ({sources.length})
          {note && (note.warn ? <> · <span className="status-warn">{note.text}</span></> : ` · ${note.text}`)}
        </span>
      </button>
      {expanded && (
        <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {grouped.map((g, idx) => (
            <span
              key={idx}
              className="t-caption"
              title={g.excerpt || ''}
              style={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '2px 8px' }}
            >
              {g.label}{g.date ? ` · ${g.date}` : ''}{g.count > 1 ? ` ×${g.count}` : ''}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

// Version history modal - not in the prototype, so free to design, but
// still built from tokens.css/clinical-ink.css vocabulary only. Also the
// home for `recent_changes` (the rolling per-field audit log): it's meta
// content about the record's edit history, not a patient-content
// sub-group, so it belongs next to the version list behind the same
// "Version history" trigger rather than folded into More detail.
function VersionHistoryModal({ versions, recentChanges, onClose }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(21, 21, 27, 0.32)' }} onClick={onClose} />
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 41, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5)' }}
        onClick={onClose}
      >
        <div
          className="card"
          style={{ width: '100%', maxWidth: '480px', maxHeight: '80vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ci-card-head" style={{ margin: 0, padding: 'var(--space-5)', borderBottom: 'var(--border-width) solid var(--hairline)' }}>
            <span className="icon-badge"><History size={16} strokeWidth={1.5} /></span>
            <span className="t-h3">Version history</span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-icon-sm"
              style={{ marginLeft: 'auto' }}
              aria-label="Close"
              onClick={onClose}
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
          <div style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
            {recentChanges?.length > 0 && (
              <>
                <div className="ci-sub" style={{ marginTop: 0 }}><span className="t-h4">Recent changes</span></div>
                {recentChanges.slice(0, 20).map(change => (
                  <div key={change.id} className="ci-line">
                    <span className="t-cell">{change.label}</span>
                    <span className="ci-line-meta t-caption">{sourceGroupMeta(change.source_type).label}</span>
                  </div>
                ))}
              </>
            )}

            <div className="ci-sub"><span className="t-h4">Versions</span></div>
            {versions.length === 0 ? (
              <p className="t-body-s" style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>No version history yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {versions.map(version => (
                  <div key={version.id} className="ci-entry">
                    <div className="ci-entry-head">
                      <span className="t-cell-key">Version {version.version}</span>
                      <span className="t-caption">{formatDate(version.created_at)}</span>
                    </div>
                    {version.change_reason && <p className="t-cell">{version.change_reason}</p>}
                    {version.changed_by_name && <p className="t-caption" style={{ marginTop: '4px' }}>By {version.changed_by_name}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ---- Ask Nook -----------------------------------------------------------
// Read-only over the patient's approved Clinical Intelligence record - it
// can never write to it. Every request is scoped by `patientId` at the API
// layer, so switching patients and reopening this panel always starts from
// that patient's own history, never a previous patient's.
const SUGGESTED_QUESTIONS = [
  'What symptoms have been reported?',
  'Are there any risk factors on record?',
  'How have treatment goals changed over time?',
  "What's still unresolved or unclear about this patient?",
]

function NookPanel({ patientId, patientName, onClose }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const isNarrow = useIsNarrow()

  // Bug fix (mobile only — desktop keeps the record scrollable behind the
  // floating chat by design, same as ConfirmDialog's body-lock pattern):
  // the mobile sheet is a fixed full-screen overlay, but with the
  // background record page still scrollable behind it, focusing
  // .nook-input made iOS scroll *that background page* to bring the input
  // above the keyboard — since the fixed sheet tracks the page it just
  // moved, this desynced the sheet from the visible viewport (record
  // content bled through above the composer while the keyboard was up),
  // and iOS didn't reliably restore that background scroll offset once
  // the keyboard closed, leaving the page looking permanently shifted/
  // resized. Locking body scroll removes anywhere for iOS to scroll to,
  // so it pans the visual viewport instead, which the fixed sheet already
  // tracks correctly.
  useEffect(() => {
    if (!isNarrow) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isNarrow])

  const fillDraft = (question) => {
    setDraft(question)
    textareaRef.current?.focus()
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    getClinicalIntelligenceChat(patientId)
      .then(data => { if (!cancelled) setMessages(data) })
      .catch(err => { if (!cancelled) setError(err.response?.data?.message || err.response?.data?.detail || 'Failed to load chat history') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patientId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSend = async () => {
    const question = draft.trim()
    if (!question || sending) return
    setSending(true)
    setError('')
    const optimisticId = `pending-${Date.now()}`
    setMessages(prev => [...prev, { id: optimisticId, role: 'user', content: question, created_at: new Date().toISOString() }])
    setDraft('')
    try {
      const reply = await askClinicalIntelligenceChat(patientId, question)
      setMessages(prev => [...prev, reply])
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.detail || 'Failed to get a response')
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setDraft(question)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="nook-panel" role="dialog" aria-label="Ask Nook" aria-modal={isNarrow ? 'true' : undefined}>
      <div className="nook-head">
        <span className="nook-mark"><Sparkle size={15} strokeWidth={1.5} /></span>
        <span className="t-h3">Nook</span>
        <span className="t-caption" style={{ marginLeft: 'auto' }}>{patientName}</span>
        <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Close" onClick={onClose}>
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="nook-note">
        Answers draw only from this patient's approved record. Updates still awaiting review aren't included.
      </div>

      <div ref={scrollRef} className="nook-body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6) 0' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--icon-muted)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="nook-suggest">
            {SUGGESTED_QUESTIONS.map(q => (
              <button key={q} type="button" onClick={() => fillDraft(q)}>{q}</button>
            ))}
          </div>
        ) : (
          messages.map(m => <ChatTurn key={m.id} message={m} />)
        )}
      </div>

      {error && (
        <p className="t-caption status-warn" style={{ padding: '0 var(--space-5) var(--space-3)' }}>{error}</p>
      )}

      <div className="nook-composer">
        <textarea
          ref={textareaRef}
          className="nook-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about ${patientName ? patientName.split(' ')[0] + "'s" : "the patient's"} record…`}
          rows={1}
          disabled={sending}
        />
        <button type="button" className="btn btn-primary btn-icon" aria-label="Send" onClick={handleSend} disabled={sending || !draft.trim()}>
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  )
}

function ChatTurn({ message }) {
  if (message.role === 'user') {
    return (
      <div className="nook-turn nook-turn-user">
        <div className="nook-bubble">{message.content}</div>
      </div>
    )
  }
  return (
    <div className="nook-turn">
      <span className="nook-avatar"><Sparkle size={13} strokeWidth={1.5} /></span>
      <div className="nook-answer">
        <p>{message.content}</p>
        {message.grounded === false && (
          <div className="status-warn" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'var(--space-2)', fontSize: '12px', fontWeight: 600 }}>
            <ShieldAlert size={12} strokeWidth={1.5} />
            Unverified — no matching record citation
          </div>
        )}
        {message.citations?.length > 0 && <ChatSources sources={message.citations} />}
      </div>
    </div>
  )
}

function ChatSources({ sources }) {
  const [expanded, setExpanded] = useState(false)
  const grouped = groupSources(sources)

  return (
    <>
      <button type="button" className="nook-sources" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        <ChevronRight size={13} strokeWidth={1.5} />
        Sources ({sources.length})
      </button>
      {expanded && (
        <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {grouped.map((g, idx) => (
            <span
              key={idx}
              className="t-caption"
              title={g.excerpt || ''}
              style={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '2px 8px' }}
            >
              {g.label}{g.date ? ` · ${g.date}` : ''}{g.count > 1 ? ` ×${g.count}` : ''}
            </span>
          ))}
        </div>
      )}
    </>
  )
}
