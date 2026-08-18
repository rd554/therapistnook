import { useState, useEffect } from 'react'
import {
  Loader2, X, Calendar, Clock, Globe, FileText, MessageSquare, ClipboardList,
  Search, Copy, Download, CheckCircle, AlertCircle, Edit2, Save, ArrowLeft,
} from 'lucide-react'
import {
  getTherapySession, updateSOAPNotes, getTranscriptDownloadUrl,
} from '../api/client'

const TABS = [
  { id: 'transcript', label: 'Transcript', icon: FileText },
  { id: 'summary', label: 'Summary', icon: MessageSquare },
  { id: 'soap', label: 'SOAP Notes', icon: ClipboardList },
]

export default function SessionDetail({ patientId, sessionId, initialTab = 'transcript', onClose }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState(initialTab)
  const [searchTerm, setSearchTerm] = useState('')
  const [copied, setCopied] = useState(false)
  
  // SOAP editing state
  const [editingSOAP, setEditingSOAP] = useState(false)
  const [soapForm, setSoapForm] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  })
  const [savingSOAP, setSavingSOAP] = useState(false)

  useEffect(() => {
    loadSession()
  }, [patientId, sessionId])

  useEffect(() => {
    if (session?.soap_notes) {
      setSoapForm({
        subjective: session.soap_notes.subjective || '',
        objective: session.soap_notes.objective || '',
        assessment: session.soap_notes.assessment || '',
        plan: session.soap_notes.plan || '',
      })
    }
  }, [session])

  const loadSession = async () => {
    try {
      setLoading(true)
      const data = await getTherapySession(patientId, sessionId)
      setSession(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyTranscript = async () => {
    const text = session.translation_text || session.transcript_text
    if (text) {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownloadTranscript = () => {
    const url = getTranscriptDownloadUrl(patientId, sessionId)
    window.open(url, '_blank')
  }

  const handleSaveSOAP = async () => {
    setSavingSOAP(true)
    try {
      await updateSOAPNotes(patientId, sessionId, soapForm)
      setEditingSOAP(false)
      await loadSession()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save SOAP notes')
    } finally {
      setSavingSOAP(false)
    }
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatTimestamp = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const highlightText = (text, search) => {
    if (!search) return text
    const parts = text.split(new RegExp(`(${search})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === search.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200">{part}</mark>
      ) : part
    )
  }

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
        <button onClick={onClose} className="btn-secondary mt-4">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
    )
  }

  if (!session) return null

  const transcript = session.translation || session.transcript || []
  const hasTranslation = session.translation && session.detected_language !== 'en'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={onClose}
              className="mt-1 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Session Details</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(session.session_date)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDuration(session.audio_duration)}
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="h-4 w-4" />
                  {session.detected_language?.toUpperCase() || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
          
          {hasTranslation && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              Translated from {session.detected_language?.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="card !p-2">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'transcript' && (
        <div className="card">
          {/* Transcript Controls */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transcript..."
                className="input-field pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyTranscript} className="btn-secondary">
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
              <button onClick={handleDownloadTranscript} className="btn-secondary">
                <Download className="h-4 w-4" />
                Download
              </button>
            </div>
          </div>

          {/* Transcript Content */}
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {transcript.length === 0 && session.transcript_text ? (
              // Manually uploaded transcripts have no per-segment speaker/timestamp
              // data — just the raw text the therapist provided.
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {highlightText(session.transcript_text, searchTerm)}
              </p>
            ) : transcript.length === 0 ? (
              <p className="text-center text-gray-500">No transcript available</p>
            ) : (
              transcript
                .filter(seg => !searchTerm || seg.text.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((segment, idx) => (
                  <div key={idx} className="group flex gap-3">
                    <div className="w-14 flex-shrink-0 text-xs text-gray-400">
                      {formatTimestamp(segment.timestamp)}
                    </div>
                    <div className="flex-1">
                      <span className={`text-xs font-semibold ${
                        segment.speaker === 'Therapist' ? 'text-primary-600' : 'text-purple-600'
                      }`}>
                        {segment.speaker}
                      </span>
                      <p className="mt-0.5 text-sm text-gray-700">
                        {highlightText(segment.text, searchTerm)}
                      </p>
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Original transcript if translated */}
          {hasTranslation && session.transcript && (
            <div className="mt-6 border-t pt-4">
              <h4 className="mb-3 text-sm font-medium text-gray-700">Original Transcript ({session.detected_language?.toUpperCase()})</h4>
              <div className="max-h-[30vh] space-y-4 overflow-y-auto rounded-lg bg-gray-50 p-4">
                {session.transcript.map((segment, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="w-14 flex-shrink-0 text-xs text-gray-400">
                      {formatTimestamp(segment.timestamp)}
                    </div>
                    <div className="flex-1">
                      <span className={`text-xs font-semibold ${
                        segment.speaker === 'Therapist' ? 'text-primary-600' : 'text-purple-600'
                      }`}>
                        {segment.speaker}
                      </span>
                      <p className="mt-0.5 text-sm text-gray-600">{segment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="card">
          {session.summary ? (
            <div className="space-y-6">
              {session.summary.presenting_issues && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">Presenting Issues</h4>
                  <p className="text-sm text-gray-600">{session.summary.presenting_issues}</p>
                </div>
              )}
              {session.summary.key_discussion_points && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">Key Discussion Points</h4>
                  <p className="text-sm text-gray-600">{session.summary.key_discussion_points}</p>
                </div>
              )}
              {session.summary.emotional_themes && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">Emotional Themes</h4>
                  <p className="text-sm text-gray-600">{session.summary.emotional_themes}</p>
                </div>
              )}
              {session.summary.homework_discussed && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">Homework Discussed</h4>
                  <p className="text-sm text-gray-600">{session.summary.homework_discussed}</p>
                </div>
              )}
              {session.summary.action_items && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">Action Items</h4>
                  <p className="text-sm text-gray-600">{session.summary.action_items}</p>
                </div>
              )}
              {session.summary.open_questions && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">Open Questions</h4>
                  <p className="text-sm text-gray-600">{session.summary.open_questions}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-500">No summary available</p>
          )}
        </div>
      )}

      {activeTab === 'soap' && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">SOAP Notes</h3>
            {!editingSOAP && session.soap_notes && (
              <button onClick={() => setEditingSOAP(true)} className="btn-secondary">
                <Edit2 className="h-4 w-4" />
                Edit
              </button>
            )}
          </div>

          {session.soap_notes?.edited && (
            <div className="mb-4 flex items-center gap-2 text-xs text-amber-600">
              <CheckCircle className="h-3.5 w-3.5" />
              Edited by practitioner
            </div>
          )}

          {editingSOAP ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Subjective</label>
                <textarea
                  value={soapForm.subjective}
                  onChange={(e) => setSoapForm({ ...soapForm, subjective: e.target.value })}
                  rows={4}
                  className="input-field"
                  placeholder="Patient's self-reported symptoms, feelings, and concerns..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Objective</label>
                <textarea
                  value={soapForm.objective}
                  onChange={(e) => setSoapForm({ ...soapForm, objective: e.target.value })}
                  rows={4}
                  className="input-field"
                  placeholder="Observable behaviors, mental status observations..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Assessment</label>
                <textarea
                  value={soapForm.assessment}
                  onChange={(e) => setSoapForm({ ...soapForm, assessment: e.target.value })}
                  rows={4}
                  className="input-field"
                  placeholder="Clinical impressions, progress observations..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Plan</label>
                <textarea
                  value={soapForm.plan}
                  onChange={(e) => setSoapForm({ ...soapForm, plan: e.target.value })}
                  rows={4}
                  className="input-field"
                  placeholder="Treatment plan, interventions, next steps..."
                />
              </div>
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setEditingSOAP(false)
                    if (session.soap_notes) {
                      setSoapForm({
                        subjective: session.soap_notes.subjective || '',
                        objective: session.soap_notes.objective || '',
                        assessment: session.soap_notes.assessment || '',
                        plan: session.soap_notes.plan || '',
                      })
                    }
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSOAP}
                  disabled={savingSOAP}
                  className="btn-primary"
                >
                  {savingSOAP ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : session.soap_notes ? (
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-800">S - Subjective</h4>
                <p className="whitespace-pre-wrap text-sm text-gray-600">
                  {session.soap_notes.subjective || 'Not documented'}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-800">O - Objective</h4>
                <p className="whitespace-pre-wrap text-sm text-gray-600">
                  {session.soap_notes.objective || 'Not documented'}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-800">A - Assessment</h4>
                <p className="whitespace-pre-wrap text-sm text-gray-600">
                  {session.soap_notes.assessment || 'Not documented'}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-800">P - Plan</h4>
                <p className="whitespace-pre-wrap text-sm text-gray-600">
                  {session.soap_notes.plan || 'Not documented'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500">No SOAP notes available</p>
          )}
        </div>
      )}
    </div>
  )
}
