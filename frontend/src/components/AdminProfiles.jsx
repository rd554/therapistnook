import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  User, Globe, EyeOff, Check, X, ExternalLink, Search, Loader2,
  Shield, ShieldOff
} from 'lucide-react'
import { listAllProfiles, updateProfileAdmin } from '../api/client'

export default function AdminProfiles() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    try {
      setLoading(true)
      const data = await listAllProfiles()
      setProfiles(data)
    } catch (err) {
      console.error('Failed to load profiles:', err)
      setError('Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }

  async function togglePublic(profileId, isPublic) {
    try {
      const updated = await updateProfileAdmin(profileId, { is_public: !isPublic })
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_public: updated.is_public } : p))
    } catch (err) {
      console.error('Failed to update profile:', err)
    }
  }

  async function toggleApproval(profileId, isApproved) {
    try {
      const updated = await updateProfileAdmin(profileId, { is_admin_approved: !isApproved })
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_admin_approved: updated.is_admin_approved } : p))
    } catch (err) {
      console.error('Failed to update profile:', err)
    }
  }

  const filteredProfiles = profiles.filter(profile => {
    const matchesSearch = !search || 
      profile.practitioner_name.toLowerCase().includes(search.toLowerCase()) ||
      profile.practitioner_email.toLowerCase().includes(search.toLowerCase()) ||
      profile.slug.toLowerCase().includes(search.toLowerCase())
    
    const matchesFilter = filter === 'all' ||
      (filter === 'public' && profile.is_public) ||
      (filter === 'hidden' && !profile.is_public) ||
      (filter === 'pending' && !profile.is_admin_approved)
    
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <button onClick={loadProfiles} className="mt-2 text-primary-600 hover:underline">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Public Profiles</h2>
        <p className="text-sm text-slate-500">Manage practitioner public profile visibility</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or URL..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="all">All Profiles</option>
          <option value="public">Public</option>
          <option value="hidden">Hidden</option>
          <option value="pending">Pending Approval</option>
        </select>
      </div>

      {/* Profiles List */}
      {filteredProfiles.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Practitioner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Profile URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Approval
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredProfiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="ml-3">
                        <p className="font-medium text-slate-800">
                          {profile.display_name || profile.practitioner_name}
                        </p>
                        <p className="text-sm text-slate-500">{profile.practitioner_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      to={`/p/${profile.slug}`}
                      target="_blank"
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      /p/{profile.slug}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => togglePublic(profile.id, profile.is_public)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        profile.is_public
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {profile.is_public ? (
                        <>
                          <Globe className="w-3 h-3" />
                          Public
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" />
                          Hidden
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleApproval(profile.id, profile.is_admin_approved)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        profile.is_admin_approved
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {profile.is_admin_approved ? (
                        <>
                          <Shield className="w-3 h-3" />
                          Approved
                        </>
                      ) : (
                        <>
                          <ShieldOff className="w-3 h-3" />
                          Pending
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/p/${profile.slug}`}
                        target="_blank"
                        className="text-slate-400 hover:text-slate-600"
                        title="View Profile"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm">
          <User className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">No profiles found</p>
        </div>
      )}
    </div>
  )
}
