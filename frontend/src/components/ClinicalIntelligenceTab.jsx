import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Brain, Loader2, AlertCircle, RefreshCw, CheckCircle, XCircle, Clock,
  User, AlertTriangle, Target, Users, Calendar, HelpCircle,
  FileText, Activity, ChevronDown, ChevronRight, History,
  ThumbsUp, ThumbsDown, Sparkles, Shield, TrendingUp,
  Send, ShieldAlert, Sparkle,
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
import {
  NoClinicalIntelligence,
  Alert,
  Button,
  IconButton,
  PageLoader,
} from './ui'

const CONFIDENCE_COLORS = {
  high: 'bg-success-bg text-success-text',
  medium: 'bg-warning-bg text-warning-text',
  low: 'bg-error-bg text-error-text',
}

const STATUS_COLORS = {
  active: 'bg-error-bg text-error-text',
  remission: 'bg-warning-bg text-warning-text',
  resolved: 'bg-success-bg text-success-text',
  current: 'bg-info-bg text-info-text',
  historical: 'bg-slate-100 text-slate-600',
  provisional: 'bg-purple-100 text-purple-700',
  completed: 'bg-success-bg text-success-text',
  ongoing: 'bg-info-bg text-info-text',
  discontinued: 'bg-slate-100 text-slate-600',
}

const SEVERITY_COLORS = {
  low: 'bg-success-bg text-success-text',
  moderate: 'bg-warning-bg text-warning-text',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-error-bg text-error-text',
  mild: 'bg-success-bg text-success-text',
  severe: 'bg-error-bg text-error-text',
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
    label: sourceType
      ? sourceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Unknown Source',
    icon: Sparkles,
  }
}

// Groups pending updates by the source event that produced them (e.g. one
// clinical-history save, one therapy session) rather than showing a flat
// list, so a practitioner can review "everything from Tuesday's session" as
// a unit. `pendingUpdates` arrives newest-first (see list_pending_updates'
// created_at desc ordering), so the first time a group's key is seen is
// always its most recent item - no separate sort needed.
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

export default function ClinicalIntelligenceTab({ patientId }) {
  const [intelligence, setIntelligence] = useState(null)
  const [stats, setStats] = useState(null)
  const [pendingUpdates, setPendingUpdates] = useState([])
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('overview')
  const [showVersions, setShowVersions] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [confidenceFilter, setConfidenceFilter] = useState('all')

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
  }, [patientId])

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
  // renders (violates Rules of Hooks: "Rendered more hooks than during the
  // previous render").
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

  if (loading) {
    return <PageLoader />
  }

  if (error) {
    return (
      <div className="card">
        <div className="py-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-error-text" />
          <p className="text-secondary">{error}</p>
          <Button onClick={loadData} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  const hasPendingUpdates = pendingUpdates.length > 0

  const isEmpty = !intelligence?.patient_summary &&
    !(intelligence?.symptoms?.length) && 
    !(intelligence?.diagnoses?.length) &&
    !(intelligence?.treatment_goals?.length)

  return (
    <div className="space-y-6 pt-2">
      {/* Section Header - Outside Card, matching the other patient tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-section-title text-content-primary">Clinical Intelligence</h2>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton icon={History} label="Version History" onClick={loadVersions} />
          <Button variant="tint" size="sm" onClick={() => setShowChat(true)} leftIcon={Sparkle}>
            Ask Nook
          </Button>
          <Button variant="tint" size="sm" onClick={handleProcess} isLoading={processing} leftIcon={RefreshCw}>
            {processing ? 'Processing...' : 'Reprocess All Sources'}
          </Button>
        </div>
      </div>

      {/* Pending Updates */}
      {hasPendingUpdates && (
        <Alert variant="warning" className="!p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 font-medium">
                <Sparkles className="h-5 w-5" />
                {pendingUpdates.length} Pending Updates
              </h3>
              <p className="text-sm opacity-90">
                Review AI-generated updates before they are added to the patient's record
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => handleBulkReject(confidenceFilter === 'all' ? null : filteredPendingUpdates.map(u => u.id))}
                leftIcon={ThumbsDown}
                disabled={filteredPendingUpdates.length === 0}
              >
                {confidenceFilter === 'all' ? 'Reject All' : `Reject Filtered (${filteredPendingUpdates.length})`}
              </Button>
              <Button
                onClick={() => handleBulkApprove(confidenceFilter === 'all' ? null : filteredPendingUpdates.map(u => u.id))}
                leftIcon={ThumbsUp}
                disabled={filteredPendingUpdates.length === 0}
              >
                {confidenceFilter === 'all' ? 'Approve All' : `Approve Filtered (${filteredPendingUpdates.length})`}
              </Button>
            </div>
          </div>

          {/* Confidence filter */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">Confidence</span>
            {CONFIDENCE_FILTERS.map(level => (
              <button
                key={level}
                onClick={() => setConfidenceFilter(level)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  confidenceFilter === level
                    ? 'bg-white text-warning-text shadow-sm'
                    : 'bg-white/40 text-warning-text/80 hover:bg-white/70'
                }`}
              >
                {level} ({confidenceCounts[level]})
              </button>
            ))}
          </div>

          {/* Grouped by source event */}
          <div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto">
            {pendingGroups.length === 0 ? (
              <p className="py-6 text-center text-sm opacity-80">No pending updates match this filter.</p>
            ) : (
              pendingGroups.map(group => (
                <PendingSourceGroup
                  key={group.key}
                  group={group}
                  onApprove={(updateId) => handleReviewUpdate(updateId, 'approve')}
                  onReject={(updateId) => handleReviewUpdate(updateId, 'reject')}
                  onApproveGroup={() => handleBulkApprove(group.updates.map(u => u.id))}
                  onRejectGroup={() => handleBulkReject(group.updates.map(u => u.id))}
                />
              ))
            )}
          </div>
        </Alert>
      )}

      {/* Empty State */}
      {isEmpty && !hasPendingUpdates && (
        <div className="card">
          <NoClinicalIntelligence onProcess={handleProcess} />
        </div>
      )}

      {/* Intelligence Content - one prioritized column: the things a
          practitioner needs to act on or orient by first (risk, what
          changed, the summary) come before reference detail, instead of
          nine identical-looking accordion rows in source order. */}
      {!isEmpty && (
        <div className="space-y-5">
          <RiskBanner riskFactors={intelligence?.risk_factors} />

          <WhatsChangedCard recentChanges={intelligence?.recent_changes} />

          <SnapshotCard summary={intelligence?.patient_summary} stats={stats} />

          <ClinicalPictureCard
            diagnoses={intelligence?.diagnoses}
            symptoms={intelligence?.symptoms}
          />

          <TreatmentGoalsCard goals={intelligence?.treatment_goals} />

          <OutstandingQuestionsCard questions={intelligence?.outstanding_questions} />

          <MoreDetailSection
            relationships={intelligence?.relationships}
            lifeEvents={intelligence?.life_events}
            timeline={intelligence?.timeline}
          />
        </div>
      )}

      {/* Version History Modal */}
      {showVersions && (
        <VersionHistoryModal
          versions={versions}
          onClose={() => setShowVersions(false)}
        />
      )}

      {/* Ask-about-this-patient chat panel */}
      {showChat && (
        <ClinicalChatPanel
          patientId={patientId}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Last Updated */}
      {intelligence?.updated_at && (
        <div className="text-center text-xs text-gray-400">
          Last updated: {new Date(intelligence.updated_at).toLocaleString()}
          {intelligence.last_source_type && (
            <span> • Source: {intelligence.last_source_type.replace('_', ' ')}</span>
          )}
        </div>
      )}
    </div>
  )
}

// A small header used by every card in the new layout: a muted icon tile
// plus a title (optionally a subtitle), matching the approved mockup.
function CardHeader({ icon: Icon, iconClassName = 'bg-slate-50 text-content-muted', title, subtitle, action }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3.5">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <h3 className="text-card-title">{title}</h3>
          {subtitle && <p className="mt-0.5 text-caption">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

// Only rendered when there's something to act on - not even a placeholder
// shows when the patient has no active risk factors.
function RiskBanner({ riskFactors }) {
  const active = (riskFactors || []).filter(r => r.status !== 'resolved')
  if (active.length === 0) return null

  return (
    <Alert
      variant="error"
      title={`${active.length} active risk factor${active.length === 1 ? '' : 's'}`}
    >
      <div className="mt-2 space-y-1.5">
        {active.map((risk, idx) => (
          <div key={risk.id || idx} className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {(risk.risk_type || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span className="text-xs uppercase tracking-wide opacity-80">
              {risk.severity}{risk.status ? ` · ${risk.status}` : ''}
            </span>
          </div>
        ))}
      </div>
    </Alert>
  )
}

// Shows the most recent applied changes across all sources, newest first -
// NOT grouped down to a single source event. A "reprocess all sources" run
// walks clinical history, sessions, documents and assessments in one pass
// and prepends every change it applies, so picking "the first group" would
// surface whichever source that loop happened to touch last, not what's
// actually most recent - and would hide changes from other sources applied
// moments earlier in the same run. A flat top-N list sidesteps that. Reads
// `recent_changes`, a rolling audit log the backend appends to on every
// applied change (auto-applied or reviewed) - see append_change_entry() in
// clinical_intelligence.py. Renders nothing for patients with no changes
// logged yet (existing records predate this field).
//
// Titled "Recent changes", not "since last visit" - nothing here is scoped
// to a visit boundary (no per-visit grouping, no reliable event date), so
// claiming otherwise would overstate what the log actually tracks. Also
// note a "Reprocess all sources" run can emit more entries than fit here in
// one pass, so right after a bulk reprocess this reflects processing
// activity, not only new clinical findings.
//
// The date tag is deliberately omitted. `applied_at` is when the backend
// processed the change, not when the underlying clinical event happened -
// reprocessing older history would otherwise show today's date on a
// months-old session.
function WhatsChangedCard({ recentChanges }) {
  const [showAll, setShowAll] = useState(false)
  if (!recentChanges || recentChanges.length === 0) return null

  const visible = showAll ? recentChanges : recentChanges.slice(0, 6)
  const remaining = recentChanges.length - visible.length

  return (
    <div className="card">
      <CardHeader
        icon={Clock}
        iconClassName="bg-info-bg text-info-text"
        title="Recent changes"
        action={<span className="text-caption">{recentChanges.length} total</span>}
      />
      <div className="divide-y divide-border-light">
        {visible.map(change => (
          <div key={change.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-info-text/40" />
              <span className="text-sm text-content-primary">{change.label}</span>
            </div>
            <span className="flex-shrink-0 rounded-full border border-border-light bg-slate-50 px-2.5 py-0.5 text-xs text-content-secondary">
              {sourceGroupMeta(change.source_type).label}
            </span>
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3.5 flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
        >
          Show {remaining} more change{remaining === 1 ? '' : 's'}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function SnapshotTag({ children }) {
  return (
    <span className="rounded-full border border-border-light bg-slate-50 px-2.5 py-1 text-xs font-medium text-content-secondary">
      {children}
    </span>
  )
}

// The orientation card: the AI-written narrative plus a handful of counts
// pulled from /clinical-intelligence/stats, so this is the one place that
// says "2 current diagnoses" - not a header count elsewhere computed from
// a differently-filtered list. That was the source of the diagnoses-count
// mismatch in the old layout.
function SnapshotCard({ summary, stats }) {
  if (!summary?.text) return null

  const tags = [
    stats?.current_diagnoses > 0 && `${stats.current_diagnoses} current diagnos${stats.current_diagnoses === 1 ? 'is' : 'es'}`,
    stats?.current_goals > 0 && `${stats.current_goals} active goal${stats.current_goals === 1 ? '' : 's'}`,
    stats?.outstanding_questions > 0 && `${stats.outstanding_questions} open question${stats.outstanding_questions === 1 ? '' : 's'}`,
  ].filter(Boolean)

  return (
    <div className="card">
      <CardHeader icon={User} iconClassName="bg-teal-50 text-teal-600" title="Patient Summary" />
      <p className="text-body text-content-secondary">{summary.text}</p>
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map(tag => <SnapshotTag key={tag}>{tag}</SnapshotTag>)}
        </div>
      )}
      {summary.sources?.length > 0 && <SourceCitations sources={summary.sources} />}
    </div>
  )
}

function DiagnosisRow({ diagnosis }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <div>
        <div className="text-sm text-content-primary">{diagnosis.name}</div>
        {diagnosis.icd_code ? (
          <div className="mt-0.5 text-xs text-content-muted">ICD-10 · {diagnosis.icd_code}</div>
        ) : diagnosis.status === 'provisional' ? (
          <div className="mt-0.5 text-xs text-content-muted">Pending diagnostic confirmation</div>
        ) : null}
      </div>
      <div className="flex flex-shrink-0 gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[diagnosis.status] || 'bg-gray-100 text-gray-600'}`}>
          {diagnosis.status}
        </span>
        {diagnosis.confidence && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CONFIDENCE_COLORS[diagnosis.confidence] || 'bg-gray-100 text-gray-600'}`}>
            {diagnosis.confidence} confidence
          </span>
        )}
      </div>
    </div>
  )
}

function SymptomRow({ symptom }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <div className="text-sm text-content-primary">{symptom.name}</div>
      <div className="flex flex-shrink-0 gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[symptom.current_status] || 'bg-gray-100 text-gray-600'}`}>
          {symptom.current_status}
        </span>
        {symptom.severity && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_COLORS[symptom.severity] || 'bg-gray-100 text-gray-600'}`}>
            {symptom.severity}
          </span>
        )}
      </div>
    </div>
  )
}

// Diagnoses and symptoms grouped visually under one card - they're the two
// things a practitioner reads together to answer "what's going on with this
// patient" - but kept as two separate sub-lists rather than merged into one
// data structure, since they're different clinical concepts.
//
// Each sub-header carries its own "N total" so the count next to it never
// disagrees with the rows underneath - this list shows every diagnosis
// including historical/resolved ones, while the Patient Summary badge above
// only counts current ones, and the two are labeled differently on purpose
// instead of silently showing two different numbers for "diagnoses".
function ClinicalPictureCard({ diagnoses, symptoms }) {
  const hasDiagnoses = diagnoses?.length > 0
  const hasSymptoms = symptoms?.length > 0
  if (!hasDiagnoses && !hasSymptoms) return null

  return (
    <div className="card">
      <CardHeader icon={FileText} iconClassName="bg-primary-light text-primary-600" title="Clinical Picture" />

      {hasDiagnoses && (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-content-muted">Diagnoses</p>
            <p className="text-xs text-content-muted">{diagnoses.length} total</p>
          </div>
          <div className="divide-y divide-border-light">
            {diagnoses.map((d, idx) => <DiagnosisRow key={d.id || idx} diagnosis={d} />)}
          </div>
        </>
      )}

      {hasDiagnoses && hasSymptoms && <div className="my-4 h-px bg-border-light" />}

      {hasSymptoms && (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-content-muted">Symptoms</p>
            <p className="text-xs text-content-muted">{symptoms.length} total</p>
          </div>
          <div className="divide-y divide-border-light">
            {symptoms.map((s, idx) => <SymptomRow key={s.id || idx} symptom={s} />)}
          </div>
        </>
      )}
    </div>
  )
}

// Goal text is often a full session note ("Continue to explore coping
// strategies for..."), not a short label - clamped to 2 lines and capped to
// a readable column width (instead of spanning the full card) so a list of
// 10 doesn't read like a document. Tap to expand in place rather than
// hover-to-reveal - hover doesn't work on tablet, and it's the same
// useState idiom already used for "show N more" elsewhere on this card.
// The date is `created_date` (when the goal was set/extracted), not a
// visit date - it at least lets a practitioner tell a recent goal apart
// from one that's been sitting untouched for months.
function GoalRow({ goal }) {
  const [expanded, setExpanded] = useState(false)
  const date = goal.created_date &&
    new Date(goal.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <button
      onClick={() => setExpanded(prev => !prev)}
      className="-mx-2 flex w-full items-start justify-between gap-4 rounded-lg px-2 py-3 text-left transition-colors hover:bg-slate-50/60 first:pt-0 last:pb-0"
    >
      <div className="flex min-w-0 items-start gap-2">
        {expanded ? (
          <ChevronDown className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-content-muted" />
        ) : (
          <ChevronRight className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-content-muted" />
        )}
        <div className="min-w-0 max-w-2xl">
          <p className={`text-sm text-content-primary ${expanded ? '' : 'line-clamp-2'}`}>{goal.goal}</p>
          {date && <p className="mt-1 text-xs text-content-muted">{date}</p>}
        </div>
      </div>
      <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[goal.status] || 'bg-gray-100 text-gray-600'}`}>
        {goal.status}
      </span>
    </button>
  )
}

// Shows the first 3 goals and hides the rest behind "Show N more" instead
// of dumping the whole list - most patients accumulate far more goals than
// anyone needs to see by default.
function TreatmentGoalsCard({ goals }) {
  const [showAll, setShowAll] = useState(false)
  if (!goals?.length) return null

  const visible = showAll ? goals : goals.slice(0, 3)
  const remaining = goals.length - visible.length

  return (
    <div className="card">
      <CardHeader
        icon={Target}
        iconClassName="bg-success-bg text-success-text"
        title="Treatment Goals"
        action={<span className="text-caption">{goals.length} total</span>}
      />
      <div className="divide-y divide-border-light">
        {visible.map((g, idx) => <GoalRow key={g.id || idx} goal={g} />)}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3.5 flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
        >
          Show {remaining} more goal{remaining === 1 ? '' : 's'}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// Kept as its own card rather than folded into "More detail" - these are
// things the practitioner is expected to go find out, which makes them
// more actionable than most other sections.
// Same treatment as GoalRow: narrower reading column, the date it was
// raised, and tap-to-expand instead of dumping the full question text -
// keeps a card with several open questions from reading like a wall of text.
function QuestionRow({ question: q }) {
  const [expanded, setExpanded] = useState(false)
  const date = q.created_date &&
    new Date(q.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <button
      onClick={() => setExpanded(prev => !prev)}
      className="-mx-2 flex w-full items-start justify-between gap-4 rounded-lg px-2 py-3 text-left transition-colors hover:bg-slate-50/60 first:pt-0 last:pb-0"
    >
      <div className="flex min-w-0 items-start gap-2">
        {expanded ? (
          <ChevronDown className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-content-muted" />
        ) : (
          <ChevronRight className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-content-muted" />
        )}
        <div className="min-w-0 max-w-2xl">
          <p className={`text-sm text-content-primary ${expanded ? '' : 'line-clamp-2'}`}>{q.question}</p>
          {date && <p className="mt-1 text-xs text-content-muted">{date}</p>}
        </div>
      </div>
      <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        q.priority === 'high' ? 'bg-error-bg text-error-text' :
        q.priority === 'medium' ? 'bg-warning-bg text-warning-text' :
        'bg-gray-100 text-gray-600'
      }`}>
        {q.priority} priority
      </span>
    </button>
  )
}

// Shows the first 3 and hides the rest behind "Show N more", same as
// Treatment Goals - a patient with a long open-questions list shouldn't
// dump the whole thing by default.
function OutstandingQuestionsCard({ questions }) {
  const [showAll, setShowAll] = useState(false)
  const unresolved = (questions || []).filter(q => !q.resolved)
  if (unresolved.length === 0) return null

  const visible = showAll ? unresolved : unresolved.slice(0, 3)
  const remaining = unresolved.length - visible.length

  return (
    <div className="card">
      <CardHeader
        icon={HelpCircle}
        iconClassName="bg-warning-bg text-warning-text"
        title="Outstanding Questions"
        action={<span className="text-caption">{unresolved.length} total</span>}
      />
      <div className="divide-y divide-border-light">
        {visible.map((q, idx) => <QuestionRow key={q.id || idx} question={q} />)}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3.5 flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
        >
          Show {remaining} more question{remaining === 1 ? '' : 's'}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// Relationships, Life Events and Timeline are real data a practitioner may
// need, but not what they read on every visit - demoted into one flat,
// de-emphasized, collapsed-by-default row instead of three more accordion
// cards competing for the same attention as Clinical Picture and Goals.
function MoreDetailSection({ relationships, lifeEvents, timeline }) {
  const [expanded, setExpanded] = useState(false)

  const sectionLabels = [
    relationships?.length > 0 && 'Relationships',
    lifeEvents?.length > 0 && 'Life Events',
    timeline?.length > 0 && 'Timeline',
  ].filter(Boolean)
  if (sectionLabels.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-slate-50/60">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-100/60"
      >
        <div className="flex items-center gap-2.5">
          {expanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-content-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-content-muted" />
          )}
          <span className="text-sm font-semibold text-content-secondary">More detail</span>
          <span className="text-caption">{sectionLabels.join(' · ')}</span>
        </div>
        <span className="text-caption">{sectionLabels.length} section{sectionLabels.length === 1 ? '' : 's'}</span>
      </button>
      {expanded && (
        <div className="space-y-6 border-t border-border-light bg-white p-5">
          {relationships?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-content-muted">Relationships</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {relationships.map((rel, idx) => (
                  <RelationshipCard key={rel.id || idx} relationship={rel} />
                ))}
              </div>
            </div>
          )}
          {lifeEvents?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-content-muted">Life Events</p>
              <div className="space-y-3">
                {lifeEvents.map((event, idx) => (
                  <LifeEventCard key={event.id || idx} event={event} />
                ))}
              </div>
            </div>
          )}
          {timeline?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-content-muted">Timeline</p>
              <div className="relative">
                <div className="absolute left-4 top-0 h-full w-0.5 bg-slate-200" />
                <div className="space-y-4">
                  {timeline
                    .slice()
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((item, idx) => (
                      <TimelineItem key={item.id || idx} item={item} />
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Maps a pending update's `section` to the same card component used to
// render approved items in that section, plus the prop name it expects its
// item under. Keeps the pending-review queue showing an accurate preview of
// what the record will look like once approved, instead of a raw JSON dump.
const SECTION_CARD_MAP = {
  symptoms: { Component: SymptomCard, prop: 'symptom' },
  diagnoses: { Component: DiagnosisCard, prop: 'diagnosis' },
  treatment_goals: { Component: GoalCard, prop: 'goal' },
  relationships: { Component: RelationshipCard, prop: 'relationship' },
  life_events: { Component: LifeEventCard, prop: 'event' },
  risk_factors: { Component: RiskCard, prop: 'risk' },
  outstanding_questions: { Component: QuestionCard, prop: 'question' },
  // No `timeline` entry: TimelineItem's dot is absolutely-positioned against
  // the vertical rail its parent section renders (see the Timeline section
  // below) - nested standalone in the pending queue it'd float with no rail.
  // Timeline updates are also auto_apply everywhere they're generated, so
  // they essentially never reach this queue; falls through to the raw-JSON
  // fallback on the rare case one does.
}

// One collapsible-free block per source event (a clinical-history save, a
// therapy session, etc) so a practitioner can act on "everything from this
// event" at once instead of hunting through a flat list.
function PendingSourceGroup({ group, onApprove, onReject, onApproveGroup, onRejectGroup }) {
  const meta = sourceGroupMeta(group.sourceType)
  const Icon = meta.icon
  const latestDate = group.updates[0]?.created_at

  return (
    <div className="rounded-xl bg-white/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 opacity-70" />
          <span className="text-sm font-medium">
            From {meta.label}
            {latestDate && ` — ${new Date(latestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-warning-text">
            {group.updates.length}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onRejectGroup}
            className="rounded-lg px-2 py-1 text-xs font-medium text-error-text hover:bg-error-bg transition-colors"
          >
            Reject shown ({group.updates.length})
          </button>
          <button
            onClick={onApproveGroup}
            className="rounded-lg px-2 py-1 text-xs font-medium text-success-text hover:bg-success-bg transition-colors"
          >
            Approve shown ({group.updates.length})
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
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
    <div className="rounded-xl border-2 border-dashed border-warning bg-warning-bg/20 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning-text">
            {update.operation === 'update' ? 'Proposed update' : 'Proposed addition'}
          </span>
          {update.section && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium capitalize text-content-secondary">
              {update.section.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReject}
            className="rounded-xl p-2 text-error-text hover:bg-error-bg transition-colors"
            title="Reject"
          >
            <XCircle className="h-5 w-5" />
          </button>
          <button
            onClick={onApprove}
            className="rounded-xl p-2 text-success-text hover:bg-success-bg transition-colors"
            title="Approve"
          >
            <CheckCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mapping ? (
        <mapping.Component {...{ [mapping.prop]: changes }} />
      ) : update.section === 'patient_summary' ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">{changes.text}</p>
          {changes.sources?.length > 0 && <SourceCitations sources={changes.sources} />}
        </div>
      ) : (
        <FallbackPendingContent update={update} />
      )}

      {update.reasoning && (
        <p className="mt-2 text-xs italic text-content-muted">{update.reasoning}</p>
      )}
    </div>
  )
}

function FallbackPendingContent({ update }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning-text">
          {update.update_type}
        </span>
        <ConfidenceBadge confidence={update.confidence} />
      </div>
      <p className="mt-2 text-secondary">
        {update.proposed_changes?.name || update.proposed_changes?.goal || update.proposed_changes?.text || JSON.stringify(update.proposed_changes).slice(0, 100)}
      </p>
      {update.source_excerpt && (
        <p className="mt-1 text-caption">
          Source: {update.source_excerpt.slice(0, 100)}...
        </p>
      )}
    </div>
  )
}

function SymptomCard({ symptom }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900">{symptom.name}</h4>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[symptom.current_status] || 'bg-gray-100 text-gray-600'}`}>
              {symptom.current_status}
            </span>
            {symptom.severity && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[symptom.severity] || 'bg-gray-100 text-gray-600'}`}>
                {symptom.severity}
              </span>
            )}
          </div>
          {symptom.first_mention && (
            <p className="mt-1 text-xs text-gray-500">
              First mentioned: {new Date(symptom.first_mention).toLocaleDateString()}
            </p>
          )}
        </div>
        <ConfidenceBadge confidence={symptom.confidence} />
      </div>
      {symptom.sources?.length > 0 && <SourceCitations sources={symptom.sources} />}
    </div>
  )
}

function DiagnosisCard({ diagnosis }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900">{diagnosis.name}</h4>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[diagnosis.status] || 'bg-gray-100 text-gray-600'}`}>
              {diagnosis.status}
            </span>
          </div>
          {diagnosis.icd_code && (
            <p className="mt-1 text-xs text-gray-500">ICD: {diagnosis.icd_code}</p>
          )}
          {diagnosis.diagnosed_date && (
            <p className="mt-1 text-xs text-gray-500">
              Diagnosed: {new Date(diagnosis.diagnosed_date).toLocaleDateString()}
              {diagnosis.diagnosed_by && ` by ${diagnosis.diagnosed_by}`}
            </p>
          )}
        </div>
        <ConfidenceBadge confidence={diagnosis.confidence} />
      </div>
      {diagnosis.sources?.length > 0 && <SourceCitations sources={diagnosis.sources} />}
    </div>
  )
}

function GoalCard({ goal }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[goal.status] || 'bg-gray-100 text-gray-600'}`}>
              {goal.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-700">{goal.goal}</p>
          {goal.target_date && (
            <p className="mt-1 text-xs text-gray-500">
              Target: {new Date(goal.target_date).toLocaleDateString()}
            </p>
          )}
        </div>
        <ConfidenceBadge confidence={goal.confidence} />
      </div>
      {goal.sources?.length > 0 && <SourceCitations sources={goal.sources} />}
    </div>
  )
}

function RiskCard({ risk }) {
  return (
    <div className={`rounded-lg border p-4 ${
      risk.severity === 'critical' ? 'border-red-300 bg-red-50' :
      risk.severity === 'high' ? 'border-orange-300 bg-orange-50' :
      'border-gray-200'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className={`h-4 w-4 ${
              risk.severity === 'critical' ? 'text-red-600' :
              risk.severity === 'high' ? 'text-orange-600' :
              'text-gray-400'
            }`} />
            <h4 className="font-medium text-gray-900">
              {(risk.risk_type || 'Unknown').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </h4>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[risk.severity] || 'bg-gray-100 text-gray-600'}`}>
              {risk.severity}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[risk.status] || 'bg-gray-100 text-gray-600'}`}>
              {risk.status}
            </span>
          </div>
          {risk.last_assessment && (
            <p className="mt-1 text-xs text-gray-500">
              Last assessed: {new Date(risk.last_assessment).toLocaleDateString()}
            </p>
          )}
        </div>
        <ConfidenceBadge confidence={risk.confidence} />
      </div>
      {risk.sources?.length > 0 && <SourceCitations sources={risk.sources} />}
    </div>
  )
}

function RelationshipCard({ relationship }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-gray-400" />
        <h4 className="font-medium text-gray-900">{relationship.person}</h4>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {relationship.relationship_type}
        </span>
      </div>
      {relationship.notes && (
        <p className="mt-2 text-sm text-gray-600">{relationship.notes}</p>
      )}
      <ConfidenceBadge confidence={relationship.confidence} small />
    </div>
  )
}

function LifeEventCard({ event }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <h4 className="font-medium text-gray-900">{event.event}</h4>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {event.event_type}
            </span>
          </div>
          {event.description && (
            <p className="mt-2 text-sm text-gray-600">{event.description}</p>
          )}
          {event.date && (
            <p className="mt-1 text-xs text-gray-500">
              {new Date(event.date).toLocaleDateString()}
            </p>
          )}
        </div>
        <ConfidenceBadge confidence={event.confidence} />
      </div>
      {event.sources?.length > 0 && <SourceCitations sources={event.sources} />}
    </div>
  )
}

function QuestionCard({ question }) {
  const priorityColors = {
    high: 'border-l-red-400 bg-red-50',
    medium: 'border-l-amber-400 bg-amber-50',
    low: 'border-l-gray-300',
  }
  
  return (
    <div className={`rounded-lg border border-l-4 p-4 ${priorityColors[question.priority] || ''}`}>
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        <div>
          <p className="text-sm text-gray-700">{question.question}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {question.category}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
              question.priority === 'high' ? 'bg-red-100 text-red-700' :
              question.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {question.priority} priority
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineItem({ item }) {
  const typeIcons = {
    clinical_history: FileText,
    assessment: TrendingUp,
    session: Activity,
    report: FileText,
    life_event: Calendar,
    risk_event: AlertTriangle,
    diagnosis: FileText,
    treatment: Target,
  }
  const Icon = typeIcons[item.event_type] || Clock
  
  return (
    <div className="relative flex gap-4 pl-8">
      <div className="absolute left-2 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-primary-500">
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
      <div className="flex-1 rounded-lg border border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-900">{item.title}</span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {item.event_type.replace('_', ' ')}
          </span>
        </div>
        {item.description && (
          <p className="mt-1 text-sm text-gray-600">{item.description}</p>
        )}
        <p className="mt-1 text-xs text-gray-400">
          {new Date(item.date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
    </div>
  )
}

function ConfidenceBadge({ confidence, small = false }) {
  if (!confidence) return null
  return (
    <span className={`rounded-full ${CONFIDENCE_COLORS[confidence] || 'bg-gray-100 text-gray-600'} ${
      small ? 'mt-2 px-2 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
    } font-medium`}>
      {confidence}
    </span>
  )
}

// Multiple extracted facts often cite the same session, producing several
// identical (type, date) source entries - collapsed here to one chip with a
// ×N count instead of repeating the same label down the column. Hidden by
// default behind a single "Sources (N)" toggle: the answer stays compact,
// but every citation backing it is one click away rather than trimmed or
// summarized away - trust here means nothing is hidden for good, just
// collapsed until asked for.
function SourceCitations({ sources }) {
  const [expanded, setExpanded] = useState(false)
  if (!sources || sources.length === 0) return null

  const grouped = []
  const byKey = new Map()
  for (const source of sources) {
    const label = source.source_type?.replace('_', ' ') || 'source'
    const date = source.date && new Date(source.date).toLocaleDateString()
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

  return (
    <div className="mt-2 border-t border-border-light pt-2">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-1 text-[10px] font-medium text-primary-600 hover:text-primary-700"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Sources ({sources.length})
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {grouped.map((g, idx) => (
            <span
              key={idx}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-content-muted"
              title={g.excerpt || ''}
            >
              {g.label}{g.date ? ` · ${g.date}` : ''}{g.count > 1 ? ` ×${g.count}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function VersionHistoryModal({ versions, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <History className="h-5 w-5 text-gray-400" />
            Version History
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-4">
          {versions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No version history yet</p>
          ) : (
            <div className="space-y-3">
              {versions.map(version => (
                <div key={version.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">Version {version.version}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(version.created_at).toLocaleString()}
                    </span>
                  </div>
                  {version.change_reason && (
                    <p className="mt-1 text-sm text-gray-600">{version.change_reason}</p>
                  )}
                  {version.changed_by_name && (
                    <p className="mt-1 text-xs text-gray-400">By: {version.changed_by_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Right-rail "ask about this patient" chat. Read-only over the patient's
// approved Clinical Intelligence record - it can never write to it. Every
// request is scoped by `patientId` at the API layer (see
// clinical-intelligence/chat routes in main.py), so switching patients and
// reopening this panel always starts from that patient's own history, never
// a previous patient's.
// A handful of example questions shown before the first message, spanning
// the kinds of things this record can actually answer (current picture,
// safety, progress over time, gaps) - not meant to be asked verbatim, just
// to give a therapist new to this feature a sense of its range. Tapping one
// fills the input rather than sending it immediately, since these are
// examples to edit, not one-click actions on a real patient record.
const SUGGESTED_QUESTIONS = [
  'What symptoms have been reported?',
  'Are there any risk factors on record?',
  'How have treatment goals changed over time?',
  "What's still unresolved or unclear about this patient?",
]

function ClinicalChatPanel({ patientId, onClose }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

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

  // Keep the transcript pinned to the latest message as the conversation
  // grows, rather than making the practitioner scroll down manually.
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
    // Optimistic render of the user's own message; the server is still the
    // source of truth for what gets persisted.
    const optimisticId = `pending-${Date.now()}`
    setMessages(prev => [...prev, { id: optimisticId, role: 'user', content: question, created_at: new Date().toISOString() }])
    setDraft('')
    try {
      const reply = await askClinicalIntelligenceChat(patientId, question)
      setMessages(prev => [...prev, reply])
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.detail || 'Failed to get a response')
      // Roll back the optimistic message so the transcript doesn't show an
      // unanswered question sitting there forever.
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
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} />
      <div
        className="fixed bottom-6 right-6 z-50 flex h-[70vh] max-h-[640px] w-full max-w-sm flex-col overflow-hidden rounded-[20px] bg-white"
        style={{ boxShadow: 'var(--shadow-card-hover)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5"
          style={{ background: 'var(--color-primary-hover)' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-primary-600">
              <Sparkle className="h-4 w-4" fill="currentColor" />
            </span>
            <h2 className="text-base font-semibold text-white">Nook</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/75 hover:bg-white/10 hover:text-white"
          >
            <XCircle className="h-4.5 w-4.5" />
          </button>
        </div>

        <p className="border-b border-border-light bg-slate-50 px-4 py-2 text-xs text-content-muted">
          Answers draw only from this patient's approved record. Updates still awaiting review aren't included.
        </p>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-content-muted" />
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-2 py-2">
              <p className="text-center text-xs text-content-muted">Try one of these:</p>
              <div className="space-y-1.5">
                {SUGGESTED_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => fillDraft(q)}
                    className="w-full rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-left text-xs leading-snug text-content-secondary transition-colors hover:border-primary-300 hover:bg-primary-light/40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(m => <ChatBubble key={m.id} message={m} />)
          )}
        </div>

        {error && (
          <p className="border-t border-error-bg bg-error-bg/40 px-4 py-2 text-xs text-error-text">{error}</p>
        )}

        <div className="border-t border-border-light p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Nook a question…"
              rows={2}
              disabled={sending}
              className="flex-1 resize-none rounded-lg border border-border-light px-3 py-2 text-sm text-content-primary focus:border-primary-500 focus:outline-none disabled:bg-slate-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-lg bg-primary-600 p-2.5 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ChatBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-primary-600">
          <Sparkle className="h-3.5 w-3.5" fill="currentColor" />
        </span>
      )}
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
        isUser ? 'bg-primary-600 text-white' : 'border border-border-light bg-white text-content-primary'
      }`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.grounded === false && (
          <div className="mt-2 flex items-center gap-1 text-[11px] text-warning-text">
            <ShieldAlert className="h-3 w-3" />
            No matching record citation - treat as unverified
          </div>
        )}
        {!isUser && message.citations?.length > 0 && (
          <SourceCitations sources={message.citations} />
        )}
      </div>
    </div>
  )
}
