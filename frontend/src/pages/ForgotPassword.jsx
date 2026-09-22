import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'sonam.theserenecouch@gmail.com'

// There is no self-service password reset endpoint yet (no email/token flow
// in the backend). Rather than link "Forgot password?" to nothing, this is
// an honest stopgap: it tells the practitioner what to do today. Replace
// with a real reset-by-email flow once the backend supports one.
export default function ForgotPassword() {
  return (
    <div className="clinical-ink auth-page">
      <div className="auth-card">
        <div className="auth-head">
          <img src="/logo.png" alt="" aria-hidden="true" className="auth-mark" />
          <h1 className="t-h1">Reset your password</h1>
        </div>

        <p className="t-body" style={{ marginBottom: 'var(--space-5)' }}>
          Self-service password reset isn't available yet. Email{' '}
          <a className="link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
          from your account's address and we'll reset it for you.
        </p>

        <Link to="/login" className="link">Back to sign in</Link>
      </div>
    </div>
  )
}
