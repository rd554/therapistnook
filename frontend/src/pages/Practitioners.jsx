import { useState, useEffect } from 'react'
import {
  UserPlus, UserCog, Users, ToggleLeft, ToggleRight, Loader2, Copy, Check, Link2, Trash2,
} from 'lucide-react'
import { listPractitioners, createPractitioner, updatePractitioner, deletePractitioner } from '../api/client'

const PRACTITIONER_GRID_COLS = 'grid-cols-[1.2fr_1.6fr_0.8fr_0.7fr_0.9fr_0.8fr_1.1fr]'

export default function Practitioners() {
  const [practitioners, setPractitioners] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  const load = async () => {
    try {
      const data = await listPractitioners()
      setPractitioners(data)
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <UserCog className="h-6 w-6 text-gray-400" />
            Practitioners
          </h1>
          <p className="text-sm text-gray-500">Add and manage practitioner accounts</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <UserPlus className="h-4 w-4" />
          Add Practitioner
        </button>
      </div>

      {/* Create Form */}
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

      {/* Practitioners List */}
      <div>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
          <Users className="h-5 w-5 text-gray-400" />
          All Practitioners ({practitioners.length})
        </h2>
        {practitioners.length === 0 ? (
          <div className="card overflow-hidden !p-0 !bg-gray-50 py-16 text-center text-gray-400">
            <Users className="mx-auto mb-3 h-10 w-10" />
            <p>No practitioners yet</p>
            <p className="mt-1 text-xs">Add your first practitioner to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              {/* Column labels — outside the gray area */}
              <div className={`grid ${PRACTITIONER_GRID_COLS} gap-2 px-6 pb-3 text-left`}>
                <span className="text-sm font-semibold text-gray-600">Name</span>
                <span className="text-sm font-semibold text-gray-600">Email</span>
                <span className="text-sm font-semibold text-gray-600">Role</span>
                <span className="text-sm font-semibold text-gray-600">Sessions</span>
                <span className="text-sm font-semibold text-gray-600">Test Link</span>
                <span className="text-sm font-semibold text-gray-600">Status</span>
                <span />
              </div>

              {/* Practitioner rows — inside the gray card */}
              <div className="card overflow-hidden !p-0 !bg-gray-50">
                {practitioners.map((p) => (
                  <div
                    key={p.id}
                    className={`grid ${PRACTITIONER_GRID_COLS} items-center gap-2 border-b border-gray-200/60 px-6 py-3 text-sm last:border-b-0 hover:bg-gray-100`}
                  >
                    <span className="font-medium text-gray-800">{p.name}</span>
                    <span className="text-gray-600">{p.email}</span>
                    <span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {p.role}
                      </span>
                    </span>
                    <span className="text-gray-600">{p.session_count}</span>
                    <span>
                      <button
                        onClick={() => copyLink(p.ref_code, p.id)}
                        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                      >
                        {copiedId === p.id ? <Check className="h-3 w-3 text-green-600" /> : <Link2 className="h-3 w-3" />}
                        {copiedId === p.id ? 'Copied!' : p.ref_code}
                      </button>
                    </span>
                    <span>
                      {p.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Disabled</span>
                      )}
                    </span>
                    <span>
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
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
