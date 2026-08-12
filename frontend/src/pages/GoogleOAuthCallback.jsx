import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import * as api from '../api/client'

// Landing point for Google's OAuth consent redirect (registered in Google Cloud
// Console as the authorized redirect URI). Exchanges the ?code= for tokens via
// the backend, then sends the practitioner back to Settings > Integrations.
export default function GoogleOAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('working') // working | success | error
  const [message, setMessage] = useState('Connecting your Google account…')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = searchParams.get('code')
    const oauthError = searchParams.get('error')

    if (oauthError) {
      setStatus('error')
      setMessage(oauthError === 'access_denied'
        ? 'You cancelled the Google sign-in.'
        : `Google returned an error: ${oauthError}`)
      return
    }

    if (!code) {
      setStatus('error')
      setMessage('No authorization code was returned by Google.')
      return
    }

    const redirectUri = `${window.location.origin}/settings/google-callback`

    api.connectGoogleCalendar(code, redirectUri)
      .then((result) => {
        if (result.success) {
          setStatus('success')
          setMessage('Google connected successfully. Meeting links and calendar sync are now available.')
        } else {
          setStatus('error')
          setMessage(result.message || result.error || 'Failed to connect Google.')
        }
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.userMessage || 'Failed to connect Google.')
      })
      .finally(() => {
        setTimeout(() => navigate('/settings?section=integrations', { replace: true }), 2000)
      })
  }, [searchParams, navigate])

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="card mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: status === 'error' ? 'var(--color-error-bg)' : status === 'success' ? 'var(--color-success-bg)' : '#EEF2FF' }}>
          {status === 'working' && <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary)' }} strokeWidth={2} />}
          {status === 'success' && <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--color-success-text)' }} strokeWidth={2} />}
          {status === 'error' && <XCircle className="h-8 w-8" style={{ color: 'var(--color-error-text)' }} strokeWidth={2} />}
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          {status === 'working' ? 'Connecting Google…' : status === 'success' ? 'Connected!' : 'Connection Failed'}
        </h1>
        <p className="mt-3 text-sm text-gray-600">{message}</p>
        <p className="mt-6 text-xs text-gray-400">Redirecting you back to Settings…</p>
      </div>
    </div>
  )
}
