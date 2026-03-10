import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Header from './components/Header'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import Results from './pages/Results'
import PatientEntry from './pages/PatientEntry'
import IntakeForm from './pages/IntakeForm'
import Test from './pages/Test'
import ThankYou from './pages/ThankYou'

export default function App() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('mmpi_token')
    const role = localStorage.getItem('mmpi_role')
    const name = localStorage.getItem('mmpi_prac_name')
    return token ? { token, role, name } : null
  })

  const [patientSession, setPatientSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mmpi_patient_session') || 'null')
    } catch { return null }
  })

  const handleLogin = (data) => {
    setAuth({ token: data.access_token, role: data.role, name: data.name })
  }

  const handleLogout = () => {
    localStorage.removeItem('mmpi_token')
    localStorage.removeItem('mmpi_role')
    localStorage.removeItem('mmpi_prac_name')
    setAuth(null)
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

  return (
    <div className="min-h-screen">
      <Header auth={auth} onLogout={handleLogout} patientSession={patientSession} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          {/* ── Patient-facing routes ──────────────────────────────── */}
          <Route path="/test" element={<PatientEntry onSessionResumed={handleSessionResumed} />} />
          <Route
            path="/test/intake"
            element={<IntakeForm onSessionCreated={handleSessionCreated} />}
          />
          <Route
            path="/test/questions"
            element={
              patientSession
                ? <Test sessionId={patientSession.id} resumeCode={patientSession.resume_code} />
                : <Navigate to="/test" replace />
            }
          />
          <Route path="/test/complete" element={<ThankYou />} />

          {/* ── Practitioner routes (auth required) ───────────────── */}
          <Route
            path="/login"
            element={isLoggedIn ? <Navigate to={auth.role === 'owner' ? '/admin' : '/dashboard'} replace /> : <Login onLogin={handleLogin} />}
          />
          <Route
            path="/dashboard"
            element={isLoggedIn ? <Dashboard /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/dashboard/results/:sessionId"
            element={isLoggedIn ? <Results /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/admin"
            element={isLoggedIn && auth.role === 'owner' ? <Admin /> : <Navigate to="/login" replace />}
          />

          {/* ── Default ───────────────────────────────────────────── */}
          <Route path="/" element={<Navigate to={isLoggedIn ? '/dashboard' : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
