import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Eye, EyeOff, Mail, AlertCircle } from 'lucide-react'
import { login, signup, resendVerification, getGoogleLoginUrl, getFeatureFlags } from '../api/client'

const EMAIL_UNVERIFIED_MESSAGE = 'Please verify your email before logging in. Check your inbox for the verification link.'

export default function Login({ onLogin, onLogout }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'login')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupDone, setSignupDone] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  // null = not known yet (feature-flag request in flight). Seed from the last
  // answer we saw so returning visitors don't see the Google button pop in/out
  // and the card doesn't change height after first paint.
  const [googleEnabled, setGoogleEnabled] = useState(() => {
    const cached = localStorage.getItem('mmpi_google_enabled')
    return cached === null ? null : cached === 'true'
  })

  const formRef = useRef(null)

  useEffect(() => {
    if (searchParams.get('new') === '1' && onLogout) {
      onLogout()
    }
  }, [searchParams, onLogout])

  useEffect(() => {
    getFeatureFlags()
      .then((flags) => {
        setGoogleEnabled(flags.google_signup_enabled)
        localStorage.setItem('mmpi_google_enabled', String(flags.google_signup_enabled))
      })
      .catch(() => setGoogleEnabled((prev) => (prev === null ? false : prev)))
  }, [])

  // Tab switching is a state change, not a route change — move focus into
  // the newly-revealed form so keyboard/screen-reader users land somewhere
  // useful instead of staying parked on the tab button.
  useEffect(() => {
    if (!signupDone) {
      formRef.current?.querySelector('input')?.focus()
    }
  }, [mode, signupDone])

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
      // Deliberately not clearing email/password here — a failed attempt
      // shouldn't force the person to retype everything.
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

  const hasFieldError = Boolean(error) && !signupDone

  return (
    <div className="clinical-ink auth-page">
      <div className="auth-card">
        <div className="auth-head">
          <img src="/logo.png" alt="" aria-hidden="true" className="auth-mark" />
          <h1 className="t-h1">Therapist Nook</h1>
          <p className="t-body-s" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
            {mode === 'login' ? 'Sign in to your practitioner account' : 'Create your practitioner account'}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Log in or sign up">
          <button
            type="button"
            role="tab"
            id="auth-tab-login"
            aria-selected={mode === 'login'}
            aria-controls="auth-panel"
            className="seg-option"
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            id="auth-tab-signup"
            aria-selected={mode === 'signup'}
            aria-controls="auth-panel"
            className="seg-option"
            onClick={() => switchMode('signup')}
          >
            Sign up
          </button>
        </div>

        {error && (
          <div className="alert alert-error" aria-live="polite" style={{ marginBottom: 'var(--space-5)' }}>
            <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
            <div>
              <p>{error}</p>
              {error === EMAIL_UNVERIFIED_MESSAGE && (
                <button type="button" className="link" onClick={handleResend} disabled={resending || !email} style={{ marginTop: 6, display: 'block' }}>
                  {resending ? 'Resending…' : 'Resend verification email'}
                </button>
              )}
            </div>
          </div>
        )}

        {resent && (
          <div className="alert alert-info" role="status" aria-live="polite" style={{ marginBottom: 'var(--space-5)' }}>
            <p>If that email has an account, a new verification link is on its way.</p>
          </div>
        )}

        {searchParams.get('account_deleted') === 'true' && (
          <div className="alert alert-info" role="status" style={{ marginBottom: 'var(--space-5)' }}>
            <p>Your account has been deleted and you've been logged out.</p>
          </div>
        )}

        <div id="auth-panel" role="tabpanel" aria-labelledby={mode === 'login' ? 'auth-tab-login' : 'auth-tab-signup'}>
          {mode === 'signup' && signupDone ? (
            <div style={{ textAlign: 'center' }}>
              <div
                className="icon-badge"
                style={{ width: 56, height: 56, borderRadius: 'var(--radius-full)', margin: '0 auto var(--space-4)' }}
              >
                <Mail size={24} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className="t-body">
                Check <strong>{email}</strong> for a verification link to activate your account.
              </p>
              <button type="button" className="link" onClick={handleResend} disabled={resending} style={{ marginTop: 'var(--space-3)' }}>
                {resending ? 'Resending…' : "Didn't get it? Resend"}
              </button>
            </div>
          ) : (
            <>
              {googleEnabled === null ? (
                <>
                  <div className="btn btn-secondary" style={{ width: '100%', height: 40, visibility: 'hidden' }} aria-hidden="true" />
                  <div className="auth-divider">or</div>
                </>
              ) : googleEnabled ? (
                <>
                  <button type="button" onClick={handleGoogle} className="btn btn-secondary" style={{ width: '100%', height: 40 }}>
                    <GoogleIcon />
                    {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
                  </button>
                  <div className="auth-divider">or</div>
                </>
              ) : null}

              <form ref={formRef} onSubmit={mode === 'login' ? handleLogin : handleSignup}>
                {mode === 'signup' && (
                  <div className="field">
                    <label htmlFor="auth-name">Full name</label>
                    <input
                      id="auth-name"
                      type="text"
                      className="input"
                      placeholder="Dr. Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className="field">
                  <label htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    type="email"
                    inputMode="email"
                    className="input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    aria-invalid={hasFieldError}
                  />
                </div>

                <div className="field">
                  <div className="field-row">
                    <label htmlFor="auth-password" style={{ marginBottom: 0 }}>Password</label>
                    {mode === 'login' && (
                      <Link to="/forgot-password" className="link">Forgot password?</Link>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      className="input"
                      style={{ paddingRight: 40 }}
                      placeholder={mode === 'login' ? 'Enter your password' : 'At least 6 characters'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={mode === 'signup' ? 6 : undefined}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      aria-invalid={hasFieldError}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-icon-sm"
                      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <p className="t-caption" style={{ marginTop: 6 }}>At least 6 characters.</p>
                  )}
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 44 }} disabled={loading}>
                  {loading
                    ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                    : (mode === 'login' ? 'Sign in' : 'Sign up')}
                </button>
              </form>

              <p className="auth-legal">
                By continuing you agree to our <Link to="/terms">Terms of Service</Link> and{' '}
                <Link to="/privacy">Privacy Policy</Link>.
              </p>
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
