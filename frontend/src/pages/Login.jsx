import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { login } from '../api/client'
import { Alert } from '../components/ui'

export default function Login({ onLogin, onLogout }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (searchParams.get('new') === '1' && onLogout) {
      onLogout()
    }
  }, [searchParams, onLogout])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(email, password)
      onLogin(data)
      
      if (data.must_change_password && data.role === 'practitioner') {
        navigate('/change-password')
      } else if (data.role === 'practitioner' && !data.profile_setup_complete) {
        navigate('/profile-settings')
      } else if (data.role === 'owner') {
        navigate('/admin')
      } else {
        navigate('/practitioner')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="card">
          {/* Header */}
          <div className="mb-8 text-center">
            <img src="/logo.png" alt="Therapistnook" className="mx-auto mb-4 h-28 w-28" />
            <h1 className="text-h2 text-content-primary">Therapistnook</h1>
            <p className="mt-2 text-body text-content-secondary">
              Sign in to your practitioner account
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6">
              <Alert variant="error" onDismiss={() => setError('')}>
                {error}
              </Alert>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button 
              type="submit" 
              className="btn-primary w-full" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" strokeWidth={1.5} />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
