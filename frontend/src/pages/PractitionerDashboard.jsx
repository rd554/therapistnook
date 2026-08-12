import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Users, Link2, Copy, Check, Loader2, Settings, LogOut, Clock, ClipboardCheck, ExternalLink,
} from 'lucide-react'
import { listMySessions, getMe } from '../api/client'

export default function PractitionerDashboard({ onLogout }) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [s, m] = await Promise.all([listMySessions(), getMe()])
        setSessions(s)
        setMe(m)
      } catch { /* redirect handled by interceptor */ }
      finally { setLoading(false) }
    })()
  }, [])

  const testLink = me ? `${window.location.origin}/test?ref=${me.ref_code}` : ''

  const copyLink = async () => {
    await navigator.clipboard.writeText(testLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  const completed = sessions.filter(s => s.completed)
  const inProgress = sessions.filter(s => !s.completed)

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {me?.name}</h1>
            <p className="text-sm text-gray-500">Practitioner Dashboard</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-green-700">
              <ClipboardCheck className="h-4 w-4" />
              <span className="font-semibold">{completed.length}</span> completed
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              <Clock className="h-4 w-4" />
              <span className="font-semibold">{inProgress.length}</span> in progress
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* My Patients Card */}
        <div className="card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100">
              <Users className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">My Patients</h3>
              <p className="mt-1 text-2xl font-bold text-gray-900">{sessions.length}</p>
              <p className="text-xs text-gray-500">Total assessments</p>
            </div>
          </div>
        </div>

        {/* Generate Test Link Card */}
        <div className="card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <Link2 className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-800">Test Link</h3>
              <p className="mt-0.5 text-xs text-gray-500">Share with patients</p>
              <button
                onClick={copyLink}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <Settings className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Settings</h3>
              <p className="mt-0.5 text-xs text-gray-500">Coming Soon</p>
            </div>
          </div>
        </div>
      </div>

      {/* Test Link Section */}
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100">
            <Link2 className="h-5 w-5 text-primary-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-800">Your Patient Test Link</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Share this link with patients to begin the MMPI-2 assessment
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 break-all">
                {testLink}
              </code>
              <button onClick={copyLink} className="btn-secondary !px-3 !py-2" title="Copy link">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Sessions Table */}
      <div className="card overflow-hidden !p-0">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
            <Users className="h-5 w-5 text-gray-400" />
            Patient Sessions
          </h2>
        </div>

        {sessions.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Users className="mx-auto mb-3 h-10 w-10" />
            <p>No patients yet. Share your test link to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-6 py-3 font-semibold text-gray-600">Patient</th>
                  <th className="px-6 py-3 font-semibold text-gray-600">Gender</th>
                  <th className="px-6 py-3 font-semibold text-gray-600">Age</th>
                  <th className="px-6 py-3 font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-3 font-semibold text-gray-600">Progress</th>
                  <th className="px-6 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-6 py-3 font-medium text-gray-800">{s.name}</td>
                    <td className="px-6 py-3 text-gray-600">{s.gender}</td>
                    <td className="px-6 py-3 text-gray-600">{s.age}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${s.completed ? 'bg-green-500' : 'bg-amber-400'}`}
                            style={{ width: `${Math.round((s.answered_count / 567) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{s.answered_count}/567</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {s.completed ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          In Progress
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {s.completed && (
                        <button
                          onClick={() => navigate(`/practitioner/results/${s.id}`)}
                          className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
                        >
                          View Results <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className="card">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">Quick Navigation</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to="/practitioner/patients"
            className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-600 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
          >
            <Users className="h-4 w-4" />
            Patients
            <span className="ml-auto text-xs text-gray-400">Coming Soon</span>
          </Link>
          <Link
            to="/practitioner/settings"
            className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-600 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
          >
            <Settings className="h-4 w-4" />
            Settings
            <span className="ml-auto text-xs text-gray-400">Coming Soon</span>
          </Link>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
