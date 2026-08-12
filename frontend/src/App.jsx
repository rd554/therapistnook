import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useState, lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

// Layout
import { WorkspaceLayout } from './layouts'

// Legacy Header for patient routes
import Header from './components/Header'

// Auth Pages (eager load)
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'

// Patient Test Pages (eager load - public routes)
import PatientEntry from './pages/PatientEntry'
import IntakeForm from './pages/IntakeForm'
import Test from './pages/Test'
import ThankYou from './pages/ThankYou'

// Workspace Pages (lazy load)
const Home = lazy(() => import('./pages/Home'))
const Practitioners = lazy(() => import('./pages/Practitioners'))
const PractitionerPatients = lazy(() => import('./pages/PractitionerPatients'))
const PatientProfile = lazy(() => import('./pages/PatientProfile'))
const PatientEdit = lazy(() => import('./pages/PatientEdit'))
const Results = lazy(() => import('./pages/Results'))
const Settings = lazy(() => import('./pages/Settings'))
const Assessments = lazy(() => import('./pages/Assessments'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Payments = lazy(() => import('./pages/Payments'))
const ProfileSettings = lazy(() => import('./pages/ProfileSettings'))
const GoogleOAuthCallback = lazy(() => import('./pages/GoogleOAuthCallback'))

// Public Profile Pages (lazy load)
const PublicProfile = lazy(() => import('./pages/PublicProfile'))
const PatientOnboarding = lazy(() => import('./pages/PatientOnboarding'))

// Phase 5 - Booking Pages (lazy load)
const PaymentPage = lazy(() => import('./pages/PaymentPage'))
const BookingStatusPage = lazy(() => import('./pages/BookingStatusPage'))
const InboxPage = lazy(() => import('./pages/InboxPage'))

// Legacy pages (for backward compatibility)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Admin = lazy(() => import('./pages/Admin'))
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
      <Route path="/p/:slug/onboarding" element={<Suspense fallback={<PageLoader />}><PatientOnboarding /></Suspense>} />

      {/* ── Phase 5: Public Booking routes (No auth required) ────────────────────── */}
      <Route path="/pay/:paymentToken" element={<Suspense fallback={<PageLoader />}><PaymentPage /></Suspense>} />
      <Route path="/booking/:bookingToken" element={<Suspense fallback={<PageLoader />}><BookingStatusPage /></Suspense>} />

      {/* ── Patient-facing routes (Public, with minimal header) ──────────────── */}
      <Route element={<PatientLayout auth={auth} onLogout={handleLogout} patientSession={patientSession} />}>
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
        
        {/* Practitioners (Admin only) */}
        <Route
          path="/practitioners"
          element={
            <ProtectedRoute isAllowed={isOwner} redirectTo="/home">
              <Suspense fallback={<PageLoader />}><Practitioners /></Suspense>
            </ProtectedRoute>
          }
        />

        {/* Patients */}
        <Route path="/patients" element={<Suspense fallback={<PageLoader />}><PractitionerPatients /></Suspense>} />
        <Route path="/patients/:patientId" element={<Suspense fallback={<PageLoader />}><PatientProfile /></Suspense>} />
        <Route path="/patients/:patientId/edit" element={<Suspense fallback={<PageLoader />}><PatientEdit /></Suspense>} />

        {/* Results */}
        <Route path="/results/:sessionId" element={<Suspense fallback={<PageLoader />}><Results /></Suspense>} />

        {/* Settings */}
        <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings auth={auth} /></Suspense>} />
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
          isLoggedIn && isOwner 
            ? <Navigate to="/practitioners" replace />
            : isLoggedIn && isPractitioner
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
      <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Patient Layout - minimal header for patient test routes
function PatientLayout({ auth, onLogout, patientSession }) {
  return (
    <div className="min-h-screen bg-surface-gradient">
      <Header auth={auth} onLogout={onLogout} patientSession={patientSession} />
      <main className="mx-auto max-w-5xl px-6 py-8">
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
