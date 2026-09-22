import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import { useState, lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

// Layout
import { WorkspaceLayout } from './layouts'

// Patient-facing test flow header (deliberately distinct from the app chrome)
import PublicHeader from './components/PublicHeader'

// Auth Pages (eager load)
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ChangePassword from './pages/ChangePassword'
import Landing from './pages/Landing'
import VerifyEmail from './pages/VerifyEmail'
import GoogleLoginCallback from './pages/GoogleLoginCallback'

// Patient Test Pages (eager load - public routes)
import PatientEntry from './pages/PatientEntry'
import IntakeForm from './pages/IntakeForm'
import Test from './pages/Test'
import ThankYou from './pages/ThankYou'

// Workspace Pages (lazy load)
const Home = lazy(() => import('./pages/Home'))
const PractitionerPatients = lazy(() => import('./pages/PractitionerPatients'))
const PatientProfile = lazy(() => import('./pages/PatientProfile'))
const PatientEdit = lazy(() => import('./pages/PatientEdit'))
const Results = lazy(() => import('./pages/Results'))
const SettingsShell = lazy(() => import('./pages/settings/SettingsShell'))
const SchedulingSection = lazy(() => import('./pages/settings/SchedulingSection'))
const MessagingSection = lazy(() => import('./pages/settings/MessagingSection'))
const PaymentsSection = lazy(() => import('./pages/settings/PaymentsSection'))
const IntegrationsSection = lazy(() => import('./pages/settings/IntegrationsSection'))
const SecuritySection = lazy(() => import('./pages/settings/SecuritySection'))
const Assessments = lazy(() => import('./pages/Assessments'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Payments = lazy(() => import('./pages/Payments'))
const ProfileSettings = lazy(() => import('./pages/ProfileSettings'))
const GoogleOAuthCallback = lazy(() => import('./pages/GoogleOAuthCallback'))

// Public Profile Pages (lazy load)
const PublicProfile = lazy(() => import('./pages/PublicProfile'))

// The old onboarding guide route folded into the profile page's "Before
// your first session" accordion — redirect rather than render a page.
function OnboardingRedirect() {
  const { slug } = useParams()
  return <Navigate to={`/p/${slug}#before-your-first-session`} replace />
}

// Legal Pages (lazy load)
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))

// Phase 5 - Booking Pages (lazy load)
const PaymentPage = lazy(() => import('./pages/PaymentPage'))
const BookingStatusPage = lazy(() => import('./pages/BookingStatusPage'))
const InboxPage = lazy(() => import('./pages/InboxPage'))

// Legacy pages (for backward compatibility)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const PractitionerDashboard = lazy(() => import('./pages/PractitionerDashboard'))

// Loading Fallback
function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={2} />
      <p className="mt-4 text-body text-content-muted">Loading...</p>
    </div>
  )
}

// Protected Route wrapper
function ProtectedRoute({ children, isAllowed, redirectTo = '/login' }) {
  if (!isAllowed) {
    return <Navigate to={redirectTo} replace />
  }
  return children
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('mmpi_token')
    const role = localStorage.getItem('mmpi_role')
    const name = localStorage.getItem('mmpi_prac_name')
    const mustChangePassword = localStorage.getItem('mmpi_must_change_password') === 'true'
    const profileSetupComplete = localStorage.getItem('mmpi_profile_setup_complete') === 'true'
    return token ? { token, role, name, mustChangePassword, profileSetupComplete } : null
  })

  const [patientSession, setPatientSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mmpi_patient_session') || 'null')
    } catch { return null }
  })

  const handleLogin = (data) => {
    localStorage.setItem('mmpi_token', data.access_token)
    localStorage.setItem('mmpi_role', data.role)
    localStorage.setItem('mmpi_prac_name', data.name)
    localStorage.setItem('mmpi_must_change_password', data.must_change_password ? 'true' : 'false')
    localStorage.setItem('mmpi_profile_setup_complete', data.profile_setup_complete ? 'true' : 'false')
    setAuth({
      token: data.access_token,
      role: data.role,
      name: data.name,
      mustChangePassword: data.must_change_password,
      profileSetupComplete: data.profile_setup_complete,
    })
  }

  const handleProfileSetupComplete = () => {
    localStorage.setItem('mmpi_profile_setup_complete', 'true')
    setAuth(prev => prev ? { ...prev, profileSetupComplete: true } : null)
  }

  const handleLogout = () => {
    localStorage.removeItem('mmpi_token')
    localStorage.removeItem('mmpi_role')
    localStorage.removeItem('mmpi_prac_name')
    localStorage.removeItem('mmpi_must_change_password')
    localStorage.removeItem('mmpi_profile_setup_complete')
    setAuth(null)
  }

  const handlePasswordChanged = () => {
    localStorage.setItem('mmpi_must_change_password', 'false')
    setAuth(prev => prev ? { ...prev, mustChangePassword: false } : null)
  }

  const handleSessionCreated = (session) => {
    setPatientSession(session)
    localStorage.setItem('mmpi_patient_session', JSON.stringify(session))
  }

  const handleSessionResumed = (session) => {
    setPatientSession(session)
    localStorage.setItem('mmpi_patient_session', JSON.stringify(session))
  }

  const isLoggedIn = !!auth?.token
  const isOwner = auth?.role === 'owner'
  const isPractitioner = auth?.role === 'practitioner'
  const needsPasswordChange = auth?.mustChangePassword && isPractitioner
  // First-time practitioners (not admins) must complete their public profile
  // before reaching the dashboard; subsequent logins go straight to /home.
  // (Independent of needsPasswordChange so it's still known while on that page.)
  const needsProfileSetup = isPractitioner && !auth?.profileSetupComplete
  const canAccessWorkspace = isLoggedIn && !needsPasswordChange

  const getDefaultRoute = () => {
    if (!isLoggedIn) return '/login'
    if (needsPasswordChange) return '/change-password'
    if (needsProfileSetup) return '/profile-settings'
    return '/home'
  }

  return (
    <Routes>
      {/* ── Public Therapist Profile routes (No auth required) ─────────────────── */}
      <Route path="/p/:slug" element={<Suspense fallback={<PageLoader />}><PublicProfile /></Suspense>} />
      <Route path="/p/:slug/onboarding" element={<OnboardingRedirect />} />

      {/* ── Phase 5: Public Booking routes (No auth required) ────────────────────── */}
      <Route path="/pay/:paymentToken" element={<Suspense fallback={<PageLoader />}><PaymentPage /></Suspense>} />
      <Route path="/booking/:bookingToken" element={<Suspense fallback={<PageLoader />}><BookingStatusPage /></Suspense>} />

      {/* ── Legal routes (No auth required) ───────────────────────────────────── */}
      <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><Privacy /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={<PageLoader />}><Terms /></Suspense>} />

      {/* ── Patient-facing routes (Public, with minimal header) ──────────────── */}
      <Route element={<PatientLayout patientSession={patientSession} />}>
        <Route path="/test" element={<PatientEntry onSessionResumed={handleSessionResumed} />} />
        <Route path="/test/intake" element={<IntakeForm onSessionCreated={handleSessionCreated} />} />
        <Route
          path="/test/questions"
          element={
            patientSession
              ? <Test sessionId={patientSession.id} resumeCode={patientSession.resume_code} />
              : <Navigate to="/test" replace />
          }
        />
        <Route path="/test/complete" element={<ThankYou />} />
      </Route>

      {/* ── Auth routes ────────────────────────────────────────────────────────── */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login onLogin={handleLogin} onLogout={handleLogout} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-email" element={<VerifyEmail onLogin={handleLogin} />} />
        <Route path="/auth/google/callback" element={<GoogleLoginCallback onLogin={handleLogin} />} />
        <Route
          path="/change-password"
          element={
            isLoggedIn && needsPasswordChange
              ? <ChangePassword onPasswordChanged={handlePasswordChanged} redirectTo={needsProfileSetup ? '/profile-settings' : '/home'} />
              : <Navigate to={getDefaultRoute()} replace />
          }
        />
      </Route>

      {/* ── Workspace routes (Protected, with sidebar layout) ──────────────────── */}
      <Route
        element={
          <ProtectedRoute isAllowed={canAccessWorkspace} redirectTo={getDefaultRoute()}>
            <WorkspaceLayout auth={auth} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      >
        {/* Home */}
        <Route path="/home" element={<Suspense fallback={<PageLoader />}><Home /></Suspense>} />

        {/* Patients */}
        <Route path="/patients" element={<Suspense fallback={<PageLoader />}><PractitionerPatients /></Suspense>} />
        <Route path="/patients/:patientId" element={<Suspense fallback={<PageLoader />}><PatientProfile /></Suspense>} />
        <Route path="/patients/:patientId/edit" element={<Suspense fallback={<PageLoader />}><PatientEdit /></Suspense>} />

        {/* Results */}
        <Route path="/results/:sessionId" element={<Suspense fallback={<PageLoader />}><Results /></Suspense>} />

        {/* Settings */}
        <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsShell auth={auth} /></Suspense>}>
          <Route index element={null} />
          <Route path="scheduling" element={<SchedulingSection />} />
          <Route path="messaging" element={<MessagingSection />} />
          <Route path="payments" element={<PaymentsSection />} />
          <Route path="integrations" element={<IntegrationsSection />} />
          <Route path="security" element={<SecuritySection />} />
        </Route>
        <Route path="/settings/google-callback" element={<Suspense fallback={<PageLoader />}><GoogleOAuthCallback /></Suspense>} />

        {/* Calendar */}
        <Route path="/calendar" element={<Suspense fallback={<PageLoader />}><Calendar /></Suspense>} />
        
        {/* Payments */}
        <Route path="/payments" element={<Suspense fallback={<PageLoader />}><Payments /></Suspense>} />
        
        {/* Public Profile Settings */}
        <Route path="/public-profile" element={<Suspense fallback={<PageLoader />}><ProfileSettings onProfileSetupComplete={handleProfileSetupComplete} /></Suspense>} />

        {/* Profile Settings (from sidebar profile card) */}
        <Route path="/profile-settings" element={<Suspense fallback={<PageLoader />}><ProfileSettings onProfileSetupComplete={handleProfileSetupComplete} /></Suspense>} />

        {/* Inbox (Phase 5) */}
        <Route path="/inbox" element={<Suspense fallback={<PageLoader />}><InboxPage /></Suspense>} />

        {/* Assessments */}
        <Route path="/assessments" element={<Suspense fallback={<PageLoader />}><Assessments /></Suspense>} />

        {/* Analytics */}
        <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><Analytics /></Suspense>} />
      </Route>

      {/* ── Legacy routes (Backward compatibility) ─────────────────────────────── */}
      {/* These redirect to new routes or render within workspace layout */}
      
      {/* Owner/Admin legacy routes */}
      <Route
        path="/dashboard"
        element={
          isLoggedIn && isOwner 
            ? <Navigate to="/home" replace />
            : isLoggedIn && isPractitioner 
              ? <Navigate to="/home" replace />
              : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/dashboard/results/:sessionId"
        element={
          isLoggedIn && isOwner 
            ? <Navigate to={`/results/${window.location.pathname.split('/').pop()}`} replace />
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/admin"
        element={
          isLoggedIn && (isOwner || isPractitioner)
            ? <Navigate to="/home" replace />
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/admin/patients"
        element={
          isLoggedIn && isOwner 
            ? <Navigate to="/patients" replace />
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/admin/patients/:patientId"
        element={
          isLoggedIn && isOwner 
            ? <LegacyPatientRedirect />
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/admin/patients/:patientId/edit"
        element={
          isLoggedIn && isOwner 
            ? <LegacyPatientEditRedirect />
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/admin/results/:sessionId"
        element={
          isLoggedIn && isOwner 
            ? <LegacyResultsRedirect />
            : <Navigate to="/login" replace />
        }
      />

      {/* Practitioner legacy routes */}
      <Route
        path="/practitioner"
        element={
          isLoggedIn && isPractitioner && !needsPasswordChange
            ? <Navigate to="/home" replace />
            : isLoggedIn && needsPasswordChange
              ? <Navigate to="/change-password" replace />
              : isLoggedIn && isOwner
                ? <Navigate to="/home" replace />
                : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/practitioner/results/:sessionId"
        element={
          isLoggedIn && isPractitioner && !needsPasswordChange
            ? <LegacyResultsRedirect />
            : <Navigate to={getDefaultRoute()} replace />
        }
      />
      <Route
        path="/practitioner/patients"
        element={
          isLoggedIn && isPractitioner && !needsPasswordChange
            ? <Navigate to="/patients" replace />
            : <Navigate to={getDefaultRoute()} replace />
        }
      />
      <Route
        path="/practitioner/patients/:patientId"
        element={
          isLoggedIn && isPractitioner && !needsPasswordChange
            ? <LegacyPatientRedirect />
            : <Navigate to={getDefaultRoute()} replace />
        }
      />
      <Route
        path="/practitioner/patients/:patientId/edit"
        element={
          isLoggedIn && isPractitioner && !needsPasswordChange
            ? <LegacyPatientEditRedirect />
            : <Navigate to={getDefaultRoute()} replace />
        }
      />
      <Route
        path="/practitioner/settings"
        element={
          isLoggedIn && isPractitioner && !needsPasswordChange
            ? <Navigate to="/settings" replace />
            : <Navigate to={getDefaultRoute()} replace />
        }
      />

      {/* ── Default ───────────────────────────────────────────────────────────── */}
      <Route
        path="/"
        element={isLoggedIn ? <Navigate to={getDefaultRoute()} replace /> : <Landing />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Patient Layout - calmer, deliberately distinct shell for the unauthenticated
// /test flow. No practitioner identity ever renders here — see Bug 2.
function PatientLayout({ patientSession }) {
  return (
    <div className="clinical-ink public-page">
      <PublicHeader patientName={patientSession?.name} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}

// Auth Layout - minimal layout for login/password change
function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface-gradient">
      <Outlet />
    </div>
  )
}

// Legacy redirect helpers
function LegacyPatientRedirect() {
  const patientId = window.location.pathname.split('/').filter(Boolean).find((_, i, arr) => arr[i-1] === 'patients')
  return <Navigate to={`/patients/${patientId}`} replace />
}

function LegacyPatientEditRedirect() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const patientIdIndex = parts.indexOf('patients') + 1
  const patientId = parts[patientIdIndex]
  return <Navigate to={`/patients/${patientId}/edit`} replace />
}

function LegacyResultsRedirect() {
  const sessionId = window.location.pathname.split('/').pop()
  return <Navigate to={`/results/${sessionId}`} replace />
}
