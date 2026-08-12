import { useState, useEffect } from 'react'
import {
  Loader2, Calendar, Clock, Globe, Search, FileAudio, Eye, FileText,
  Trash2, AlertCircle, CheckCircle, RefreshCw, Filter,
} from 'lucide-react'
import { listTherapySessions, deleteTherapySession, processTherapySession } from '../api/client'

const STATUS_STYLES = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
}

const LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  ar: 'Arabic',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
}

export default function SessionsList({ patientId, onViewSession }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [filterLanguage, setFilterLanguage] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [processing, setProcessing] = useState(null)

  useEffect(() => {
    loadSessions()
  }, [patientId, searchDate, filterLanguage])

  const loadSessions = async () => {
    try {
      setLoading(true)
      const data = await listTherapySessions(patientId, {
        startDate: searchDate || undefined,
        language: filterLanguage || undefined,
      })
      setSessions(data)
    } catch (err) {
      setError('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return
    }
    
    setDeleting(sessionId)
    try {
      await deleteTherapySession(patientId, sessionId)
      setSessions(sessions.filter(s => s.id !== sessionId))
    } catch (err) {
      setError('Failed to delete session')
    } finally {
      setDeleting(null)
    }
  }

  const handleProcess = async (sessionId) => {
    setProcessing(sessionId)
    try {
      await processTherapySession(patientId, sessionId)
      await loadSessions()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process session')
    } finally {
      setProcessing(null)
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
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getLanguageName = (code) => {
    return LANGUAGE_NAMES[code] || code?.toUpperCase() || 'Unknown'
  }

  // Get unique languages from sessions
  const uniqueLanguages = [...new Set(sessions.filter(s => s.detected_language).map(s => s.detected_language))]

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            placeholder="Filter by date"
            className="input-field pl-10"
          />
        </div>
        
        {uniqueLanguages.length > 1 && (
          <div className="relative min-w-[150px]">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select
              value={filterLanguage}
              onChange={(e) => setFilterLanguage(e.target.value)}
              className="input-field appearance-none pl-10"
            >
              <option value="">All languages</option>
              {uniqueLanguages.map(lang => (
                <option key={lang} value={lang}>{getLanguageName(lang)}</option>
              ))}
            </select>
          </div>
        )}
        
        <button onClick={loadSessions} className="btn-secondary" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">
            <span className="sr-only">Dismiss</span>×
          </button>
        </div>
      )}

      {/* Sessions Table */}
      {sessions.length === 0 ? (
        <div className="py-12 text-center">
          <FileAudio className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">No therapy sessions found.</p>
          <p className="mt-1 text-sm text-gray-400">
            Upload a session recording to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Duration</th>
                <th className="pb-3 pr-4">Language</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((session) => {
                const status = STATUS_STYLES[session.processing_status] || STATUS_STYLES.pending
                return (
                  <tr key={session.id} className="group hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {formatDate(session.session_date)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {formatDuration(session.audio_duration)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {getLanguageName(session.detected_language)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}>
                        {session.processing_status === 'processing' && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {session.processing_status === 'completed' && (
                          <>
                            <button
                              onClick={() => onViewSession?.(session)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => onViewSession?.(session, 'transcript')}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="View transcript"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        
                        {(session.processing_status === 'pending' || session.processing_status === 'failed') && (
                          <button
                            onClick={() => handleProcess(session.id)}
                            disabled={processing === session.id}
                            className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-50 disabled:opacity-50"
                            title="Process session"
                          >
                            {processing === session.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDelete(session.id)}
                          disabled={deleting === session.id}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Delete session"
                        >
                          {deleting === session.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
