import { useState, useEffect } from 'react'
import {
  UserPlus, Shield, Users, ToggleLeft, ToggleRight, Loader2, Copy, Check, Link2,
} from 'lucide-react'
import { listPractitioners, createPractitioner, updatePractitioner } from '../api/client'

export default function Admin() {
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
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Shield className="h-6 w-6 text-primary-600" />
              Admin Panel
            </h1>
            <p className="text-sm text-gray-500">Manage practitioner accounts</p>
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
                      <button
                        onClick={() => toggleActive(p)}
                        className={`flex items-center gap-1 text-xs font-medium ${p.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}
                      >
                        {p.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                        {p.is_active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
