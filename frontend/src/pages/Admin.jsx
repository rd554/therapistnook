import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserPlus, Shield, Users, ToggleLeft, ToggleRight, Loader2, Copy, Check, Link2, Trash2,
  ClipboardCheck, Clock, ExternalLink,
} from 'lucide-react'
import { listPractitioners, createPractitioner, updatePractitioner, deletePractitioner, listMySessions, getMe } from '../api/client'

export default function Admin() {
  const navigate = useNavigate()
  const [practitioners, setPractitioners] = useState([])
  const [sessions, setSessions] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('practitioners')

  const load = async () => {
    try {
      const [pracData, sessData, meData] = await Promise.all([
        listPractitioners(),
        listMySessions(),
        getMe()
      ])
      setPractitioners(pracData)
      setSessions(sessData)
      setMe(meData)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createPractitioner(form)
      setForm({ name: '', email: '', password: '' })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (prac) => {
    await updatePractitioner(prac.id, { is_active: !prac.is_active })
    await load()
  }

  const handleDelete = async (prac) => {
    if (!window.confirm(`Are you sure you want to delete ${prac.name}? This action cannot be undone.`)) {
      return
    }
    try {
      await deletePractitioner(prac.id)
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete practitioner')
    }
  }

  const copyLink = async (refCode, id) => {
    await navigator.clipboard.writeText(`${window.location.origin}/test?ref=${refCode}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const testLink = me ? `${window.location.origin}/test?ref=${me.ref_code}` : ''

  const copyTestLink = async () => {
    await navigator.clipboard.writeText(testLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const completed = sessions.filter(s => s.completed)
  const inProgress = sessions.filter(s => !s.completed)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Shield className="h-6 w-6 text-primary-600" />
              Admin Panel
            </h1>
            <p className="text-sm text-gray-500">Welcome back, {me?.name}</p>
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

      {/* Test Link */}
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
              <button onClick={copyTestLink} className="btn-secondary !px-3 !py-2" title="Copy link">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setActiveTab('practitioners')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'practitioners'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield className="h-4 w-4" />
          Practitioners ({practitioners.length})
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'sessions'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="h-4 w-4" />
          Patient Sessions ({sessions.length})
        </button>
      </div>

      {/* Practitioners Tab */}
      {activeTab === 'practitioners' && (
        <>
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Manage Practitioners</h2>
                <p className="text-sm text-gray-500">Add and manage practitioner accounts</p>
              </div>
              <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                <UserPlus className="h-4 w-4" />
                Add Practitioner
              </button>
            </div>
          </div>

      {showForm && (
        <div className="card">
          <h3 className="mb-4 text-lg font-bold text-gray-800">New Practitioner</h3>
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text" className="input-field" placeholder="Dr. Jane Smith" required
                  value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email" className="input-field" placeholder="jane@clinic.com" required
                  value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="text" className="input-field" placeholder="Initial password" required
                  value={form.password} onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create Account
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden !p-0">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
            <Users className="h-5 w-5 text-gray-400" />
            Practitioners ({practitioners.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-6 py-3 font-semibold text-gray-600">Name</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Email</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Role</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Sessions</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Test Link</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {practitioners.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-6 py-3 font-medium text-gray-800">{p.name}</td>
                  <td className="px-6 py-3 text-gray-600">{p.email}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{p.session_count}</td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => copyLink(p.ref_code, p.id)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                    >
                      {copiedId === p.id ? <Check className="h-3 w-3 text-green-600" /> : <Link2 className="h-3 w-3" />}
                      {copiedId === p.id ? 'Copied!' : p.ref_code}
                    </button>
                  </td>
                  <td className="px-6 py-3">
                    {p.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Active</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Disabled</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {p.role !== 'owner' && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleActive(p)}
                          className={`flex items-center gap-1 text-xs font-medium ${p.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}
                        >
                          {p.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                          {p.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600"
                          title="Delete practitioner"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* Patient Sessions Tab */}
      {activeTab === 'sessions' && (
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
              <p>No assessments yet. Share your test link to get started.</p>
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
                            onClick={() => navigate(`/dashboard/results/${s.id}`)}
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
      )}
    </div>
  )
}
