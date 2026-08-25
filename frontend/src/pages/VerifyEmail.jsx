import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { verifyEmail } from '../api/client'

// Landing point for the "Verify Email Address" link sent by
// email_service.send_verification_email. Logs the practitioner straight in on
// success (the backend returns the same shape as /api/auth/login) and sends
// them on to whatever they'd see after a normal first login.
export default function VerifyEmail({ onLogin }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('working') // working | success | error
  const [message, setMessage] = useState('Verifying your email…')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage('This verification link is missing its token.')
      return
    }

    verifyEmail(token)
      .then((data) => {
        setStatus('success')
        setMessage('Your email is verified. Taking you to your dashboard…')
        onLogin(data)
        setTimeout(() => {
          if (data.must_change_password) navigate('/change-password', { replace: true })
          else if (!data.profile_setup_complete) navigate('/profile-settings', { replace: true })
          else navigate('/home', { replace: true })
        }, 1200)
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.response?.data?.detail || 'This verification link is invalid or has expired.')
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
          {status === 'working' ? 'Verifying…' : status === 'success' ? 'Email Verified!' : 'Verification Failed'}
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
