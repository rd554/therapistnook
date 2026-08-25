import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { googleLogin } from '../api/client'

// Landing point for Google's OAuth consent redirect when signing up/logging in
// (registered in Google Cloud Console as a second authorized redirect URI,
// alongside /settings/google-callback which is for Calendar sync — see
// google_login_service.py for why these are kept separate).
export default function GoogleLoginCallback({ onLogin }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('working') // working | success | error
  const [message, setMessage] = useState('Signing you in with Google…')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = searchParams.get('code')
    const oauthError = searchParams.get('error')

    if (oauthError) {
      setStatus('error')
      setMessage(oauthError === 'access_denied' ? 'You cancelled Google sign-in.' : `Google returned an error: ${oauthError}`)
      return
    }
    if (!code) {
      setStatus('error')
      setMessage('No authorization code was returned by Google.')
      return
    }

    const redirectUri = `${window.location.origin}/auth/google/callback`

    googleLogin(code, redirectUri)
      .then((data) => {
        setStatus('success')
        setMessage('Signed in successfully. Taking you to your dashboard…')
        onLogin(data)
        setTimeout(() => {
          if (data.must_change_password) navigate('/change-password', { replace: true })
          else if (!data.profile_setup_complete) navigate('/profile-settings', { replace: true })
          else navigate('/home', { replace: true })
        }, 800)
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.response?.data?.detail || 'Google sign-in failed.')
      })
  }, [searchParams, navigate, onLogin])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: status === 'error' ? 'var(--color-error-bg)' : status === 'success' ? 'var(--color-success-bg)' : '#EEF2FF' }}>
          {status === 'working' && <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary)' }} strokeWidth={2} />}
          {status === 'success' && <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--color-success-text)' }} strokeWidth={2} />}
          {status === 'error' && <XCircle className="h-8 w-8" style={{ color: 'var(--color-error-text)' }} strokeWidth={2} />}
        </div>
        <h1 className="text-xl font-semibold text-content-primary">
          {status === 'working' ? 'Connecting…' : status === 'success' ? 'Signed In!' : 'Sign-In Failed'}
        </h1>
        <p className="mt-3 text-sm text-content-secondary">{message}</p>
        {status === 'error' && (
          <Link to="/login" className="btn-primary mt-6 inline-flex">
            Back to Login
          </Link>
        )}
      </div>
    </div>
  )
}
