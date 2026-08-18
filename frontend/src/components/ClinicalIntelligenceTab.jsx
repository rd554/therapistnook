import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Brain, Loader2, AlertCircle, RefreshCw, CheckCircle, XCircle, Clock,
  User, Heart, AlertTriangle, Target, Users, Calendar, HelpCircle,
  FileText, Activity, ChevronDown, ChevronRight, History,
  ThumbsUp, ThumbsDown, Sparkles, Shield, TrendingUp,
  MessageCircle, Send, ShieldAlert,
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
  SectionHeader,
  MetricCard,
  MetricCardGrid,
  CollapsibleCard,
  NoClinicalIntelligence,
  Alert,
  Button,
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
  const [expandedSections, setExpandedSections] = useState({
    summary: false,
    symptoms: false,
    diagnoses: false,
    goals: false,
    relationships: false,
    events: false,
    risks: false,
    questions: false,
    timeline: false,
  })

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

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
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
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        icon={Brain}
        title="Clinical Intelligence"
        subtitle="AI-powered insights from all patient data sources"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={loadVersions} leftIcon={History}>
              Version History
            </Button>
            <Button variant="secondary" onClick={() => setShowChat(true)} leftIcon={MessageCircle}>
              Ask About This Patient
            </Button>
            <Button onClick={handleProcess} isLoading={processing} leftIcon={RefreshCw}>
              {processing ? 'Processing...' : 'Reprocess All Sources'}
            </Button>
          </div>
        }
      />

      {/* Stats Bar */}
      {stats && (
        <MetricCardGrid cols={6}>
          <MetricCard icon={Heart} label="Active Symptoms" value={stats.active_symptoms || 0} semantic="error" variant="mini" />
          <MetricCard icon={FileText} label="Diagnoses" value={stats.current_diagnoses || 0} semantic="info" variant="mini" />
          <MetricCard icon={Target} label="Active Goals" value={stats.current_goals || 0} semantic="success" variant="mini" />
          <MetricCard icon={AlertTriangle} label="Risk Factors" value={stats.current_risk_factors || 0} semantic="warning" variant="mini" />
          <MetricCard icon={HelpCircle} label="Questions" value={stats.outstanding_questions || 0} semantic="assessments" variant="mini" />
          <MetricCard icon={Clock} label="Pending Review" value={stats.pending_updates || 0} semantic="payments" variant="mini" />
        </MetricCardGrid>
      )}

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

      {/* Intelligence Content */}
      {!isEmpty && (
        <div className="space-y-4">
          {/* Patient Summary */}
          {intelligence?.patient_summary && (
            <IntelligenceCollapsibleSection
              title="Patient Summary"
              icon={User}
              expanded={expandedSections.summary}
              onToggle={() => toggleSection('summary')}
            >
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700">{intelligence.patient_summary.text}</p>
              </div>
              {intelligence.patient_summary.sources?.length > 0 && (
                <SourceCitations sources={intelligence.patient_summary.sources} />
              )}
            </IntelligenceCollapsibleSection>
          )}

          {/* Symptoms */}
          {intelligence?.symptoms?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Symptoms"
              icon={Heart}
              count={intelligence.symptoms.length}
              expanded={expandedSections.symptoms}
              onToggle={() => toggleSection('symptoms')}
            >
              <div className="space-y-3">
                {intelligence.symptoms.map((symptom, idx) => (
                  <SymptomCard key={symptom.id || idx} symptom={symptom} />
                ))}
              </div>
            </IntelligenceCollapsibleSection>
          )}

          {/* Diagnoses */}
          {intelligence?.diagnoses?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Diagnoses"
              icon={FileText}
              count={intelligence.diagnoses.length}
              expanded={expandedSections.diagnoses}
              onToggle={() => toggleSection('diagnoses')}
            >
              <div className="space-y-3">
                {intelligence.diagnoses.map((diagnosis, idx) => (
                  <DiagnosisCard key={diagnosis.id || idx} diagnosis={diagnosis} />
                ))}
              </div>
            </IntelligenceCollapsibleSection>
          )}

          {/* Treatment Goals */}
          {intelligence?.treatment_goals?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Treatment Goals"
              icon={Target}
              count={intelligence.treatment_goals.length}
              expanded={expandedSections.goals}
              onToggle={() => toggleSection('goals')}
            >
              <div className="space-y-3">
                {intelligence.treatment_goals.map((goal, idx) => (
                  <GoalCard key={goal.id || idx} goal={goal} />
                ))}
              </div>
            </IntelligenceCollapsibleSection>
          )}

          {/* Risk Factors */}
          {intelligence?.risk_factors?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Risk Factors"
              icon={AlertTriangle}
              count={intelligence.risk_factors.length}
              expanded={expandedSections.risks}
              onToggle={() => toggleSection('risks')}
              headerClass="bg-error-bg"
            >
              <div className="space-y-3">
                {intelligence.risk_factors.map((risk, idx) => (
                  <RiskCard key={risk.id || idx} risk={risk} />
                ))}
              </div>
            </IntelligenceCollapsibleSection>
          )}

          {/* Important Relationships */}
          {intelligence?.relationships?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Important Relationships"
              icon={Users}
              count={intelligence.relationships.length}
              expanded={expandedSections.relationships}
              onToggle={() => toggleSection('relationships')}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {intelligence.relationships.map((rel, idx) => (
                  <RelationshipCard key={rel.id || idx} relationship={rel} />
                ))}
              </div>
            </IntelligenceCollapsibleSection>
          )}

          {/* Life Events */}
          {intelligence?.life_events?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Life Events"
              icon={Calendar}
              count={intelligence.life_events.length}
              expanded={expandedSections.events}
              onToggle={() => toggleSection('events')}
            >
              <div className="space-y-3">
                {intelligence.life_events.map((event, idx) => (
                  <LifeEventCard key={event.id || idx} event={event} />
                ))}
              </div>
            </IntelligenceCollapsibleSection>
          )}

          {/* Outstanding Questions */}
          {intelligence?.outstanding_questions?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Outstanding Questions"
              icon={HelpCircle}
              count={intelligence.outstanding_questions.filter(q => !q.resolved).length}
              expanded={expandedSections.questions}
              onToggle={() => toggleSection('questions')}
            >
              <div className="space-y-3">
                {intelligence.outstanding_questions.filter(q => !q.resolved).map((question, idx) => (
                  <QuestionCard key={question.id || idx} question={question} />
                ))}
              </div>
            </IntelligenceCollapsibleSection>
          )}

          {/* Timeline */}
          {intelligence?.timeline?.length > 0 && (
            <IntelligenceCollapsibleSection
              title="Timeline"
              icon={Clock}
              count={intelligence.timeline.length}
              expanded={expandedSections.timeline}
              onToggle={() => toggleSection('timeline')}
            >
              <div className="relative">
                <div className="absolute left-4 top-0 h-full w-0.5 bg-slate-200" />
                <div className="space-y-4">
                  {intelligence.timeline
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((item, idx) => (
                      <TimelineItem key={item.id || idx} item={item} />
                    ))}
                </div>
              </div>
            </IntelligenceCollapsibleSection>
          )}
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

function IntelligenceCollapsibleSection({ title, icon: Icon, count, expanded, onToggle, children, headerClass = '' }) {
  return (
    <div className="card overflow-hidden !p-0">
      <button
        onClick={onToggle}
        className={`flex w-full items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors ${headerClass}`}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-content-muted" strokeWidth={1.8} />
          <h3 className="text-card-title">{title}</h3>
          {count !== undefined && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-content-secondary">
              {count}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-content-muted" />
        ) : (
          <ChevronRight className="h-5 w-5 text-content-muted" />
        )}
      </button>
      {expanded && <div className="border-t border-border-light p-5">{children}</div>}
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

function SourceCitations({ sources }) {
  if (!sources || sources.length === 0) return null
  
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-500">Sources:</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {sources.map((source, idx) => (
          <span
            key={idx}
            className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
            title={source.excerpt || ''}
          >
            {source.source_type?.replace('_', ' ')}
            {source.date && ` (${new Date(source.date).toLocaleDateString()})`}
          </span>
        ))}
      </div>
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
function ClinicalChatPanel({ patientId, onClose }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const scrollRef = useRef(null)

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
        className="fixed bottom-6 right-6 z-50 flex h-[70vh] max-h-[640px] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <MessageCircle className="h-5 w-5 text-gray-400" />
            Ask About This Patient
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <p className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
          Answers draw only from this patient's approved record. Updates still awaiting review aren't included.
        </p>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Ask a question about this patient's clinical record, e.g. "What symptoms have been reported?"
            </p>
          ) : (
            messages.map(m => <ChatBubble key={m.id} message={m} />)
          )}
        </div>

        {error && (
          <p className="border-t border-error-bg bg-error-bg/40 px-4 py-2 text-xs text-error-text">{error}</p>
        )}

        <div className="border-t border-gray-100 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              rows={2}
              disabled={sending}
              className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:bg-gray-50"
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
        isUser ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-900'
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
