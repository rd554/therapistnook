import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { LogIn, UserPlus, Mail } from 'lucide-react'
import { login, signup, resendVerification, getGoogleLoginUrl, getFeatureFlags } from '../api/client'
import { Alert } from '../components/ui'

const EMAIL_UNVERIFIED_MESSAGE = 'Please verify your email before logging in. Check your inbox for the verification link.'

export default function Login({ onLogin, onLogout }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'login')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupDone, setSignupDone] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  useEffect(() => {
    if (searchParams.get('new') === '1' && onLogout) {
      onLogout()
    }
  }, [searchParams, onLogout])

  useEffect(() => {
    getFeatureFlags().then((flags) => setGoogleEnabled(flags.google_signup_enabled)).catch(() => {})
  }, [])

  const redirectAfterLogin = (data) => {
    if (data.must_change_password && data.role === 'practitioner') {
      navigate('/change-password')
    } else if (data.role === 'practitioner' && !data.profile_setup_complete) {
      navigate('/profile-settings')
    } else if (data.role === 'owner') {
      navigate('/home')
    } else {
      navigate('/practitioner')
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setSignupDone(false)
    setResent(false)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(email, password)
      onLogin(data)
      redirectAfterLogin(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signup(name, email, password)
      setSignupDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setResent(false)
    try {
      await resendVerification(email)
      setResent(true)
    } catch {
      /* backend always returns a generic success message; ignore transport errors here */
    } finally {
      setResending(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    try {
      const redirectUri = `${window.location.origin}/auth/google/callback`
      const { auth_url } = await getGoogleLoginUrl(redirectUri)
      window.location.href = auth_url
    } catch (err) {
      setError(err.response?.data?.detail || 'Google sign-in is unavailable right now')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="card">
          {/* Header */}
          <div className="mb-8 text-center">
            <Link to="/">
              <img src="/logo.png" alt="Therapistnook" className="mx-auto mb-4 h-28 w-28" />
            </Link>
            <h1 className="text-h2 text-content-primary">Therapistnook</h1>
            <p className="mt-2 text-body text-content-secondary">
              {mode === 'login' ? 'Sign in to your practitioner account' : 'Create your practitioner account'}
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="mb-6 flex rounded-btn bg-surface-subtle p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 rounded-[12px] py-2 text-sm font-semibold transition ${
                mode === 'login' ? 'bg-white text-content-primary shadow-sm' : 'text-content-muted'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 rounded-[12px] py-2 text-sm font-semibold transition ${
                mode === 'signup' ? 'bg-white text-content-primary shadow-sm' : 'text-content-muted'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6">
              <Alert variant="error" onDismiss={() => setError('')}>
                {error}
                {error === EMAIL_UNVERIFIED_MESSAGE && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || !email}
                    className="mt-2 block text-sm font-semibold underline disabled:opacity-60"
                  >
                    {resending ? 'Resending…' : 'Resend verification email'}
                  </button>
                )}
              </Alert>
            </div>
          )}

          {resent && (
            <div className="mb-6">
              <Alert variant="success">
                If that email has an account, a new verification link is on its way.
              </Alert>
            </div>
          )}

          {searchParams.get('account_deleted') === 'true' && (
            <div className="mb-6">
              <Alert variant="success">
                Your account has been deleted and you've been logged out.
              </Alert>
            </div>
          )}

          {mode === 'signup' && signupDone ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
                <Mail className="h-6 w-6 text-primary-600" strokeWidth={1.75} />
              </div>
              <p className="text-body text-content-primary">
                Check <strong>{email}</strong> for a verification link to activate your account.
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-sm font-semibold text-primary-600 underline disabled:opacity-60"
              >
                {resending ? 'Resending…' : "Didn't get it? Resend"}
              </button>
            </div>
          ) : (
            <>
              {googleEnabled && (
                <>
                  <button type="button" onClick={handleGoogle} className="btn-secondary w-full">
                    <GoogleIcon />
                    {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
                  </button>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border-light" />
                    <span className="text-caption text-content-muted">or</span>
                    <span className="h-px flex-1 bg-border-light" />
                  </div>
                </>
              )}

              <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-5">
                {mode === 'signup' && (
                  <div>
                    <label className="label">Full Name</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Dr. Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                )}
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
                    placeholder={mode === 'login' ? 'Enter your password' : 'At least 6 characters'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === 'signup' ? 6 : undefined}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                    </>
                  ) : mode === 'login' ? (
                    <>
                      <LogIn className="h-5 w-5" strokeWidth={1.5} />
                      Sign In
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-5 w-5" strokeWidth={1.5} />
                      Sign Up
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.6 34.7 27 35.5 24 35.5c-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C40.9 36.8 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  )
}
