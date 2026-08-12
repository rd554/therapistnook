import { Link, useLocation } from 'react-router-dom'
import { ClipboardCheck, LogOut, LayoutDashboard, Shield, Users, Settings } from 'lucide-react'

export default function Header({ auth, onLogout, patientSession }) {
  const location = useLocation()
  const isPatientRoute = location.pathname.startsWith('/test')
  const isLoggedIn = !!auth?.token
  const isOwner = auth?.role === 'owner'
  const isPractitioner = auth?.role === 'practitioner'
  const isChangePasswordRoute = location.pathname === '/change-password'

  const getHomeLink = () => {
    if (!isLoggedIn) return '/'
    if (isOwner) return '/dashboard'
    return '/practitioner'
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link to={getHomeLink()} className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm">
            <ClipboardCheck className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <span className="text-lg font-semibold text-content-primary tracking-tight">MMPI-2</span>
        </Link>

        <div className="flex items-center gap-4">
          {isLoggedIn && !isPatientRoute && !isChangePasswordRoute && (
            <>
              {/* Owner Navigation */}
              {isOwner && (
                <nav className="hidden items-center gap-1 md:flex">
                  <Link
                    to="/dashboard"
                    className={`flex items-center gap-2 rounded-nav px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/results')
                        ? 'bg-primary text-white'
                        : 'text-content-secondary hover:bg-lavender-100 hover:text-content-primary'
                    }`}
                  >
                    <LayoutDashboard className="h-4 w-4" strokeWidth={1.5} />
                    Dashboard
                  </Link>
                  <Link
                    to="/admin/patients"
                    className={`flex items-center gap-2 rounded-nav px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      location.pathname.startsWith('/admin/patients')
                        ? 'bg-primary text-white'
                        : 'text-content-secondary hover:bg-lavender-100 hover:text-content-primary'
                    }`}
                  >
                    <Users className="h-4 w-4" strokeWidth={1.5} />
                    Patients
                  </Link>
                  <Link
                    to="/admin"
                    className={`flex items-center gap-2 rounded-nav px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      location.pathname === '/admin'
                        ? 'bg-primary text-white'
                        : 'text-content-secondary hover:bg-lavender-100 hover:text-content-primary'
                    }`}
                  >
                    <Shield className="h-4 w-4" strokeWidth={1.5} />
                    Admin
                  </Link>
                </nav>
              )}

              {/* Practitioner Navigation */}
              {isPractitioner && (
                <nav className="hidden items-center gap-1 md:flex">
                  <Link
                    to="/practitioner"
                    className={`flex items-center gap-2 rounded-nav px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      location.pathname === '/practitioner' || location.pathname.startsWith('/practitioner/results')
                        ? 'bg-primary text-white'
                        : 'text-content-secondary hover:bg-lavender-100 hover:text-content-primary'
                    }`}
                  >
                    <LayoutDashboard className="h-4 w-4" strokeWidth={1.5} />
                    Dashboard
                  </Link>
                  <Link
                    to="/practitioner/patients"
                    className={`flex items-center gap-2 rounded-nav px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      location.pathname === '/practitioner/patients'
                        ? 'bg-primary text-white'
                        : 'text-content-secondary hover:bg-lavender-100 hover:text-content-primary'
                    }`}
                  >
                    <Users className="h-4 w-4" strokeWidth={1.5} />
                    Patients
                  </Link>
                  <Link
                    to="/practitioner/settings"
                    className={`flex items-center gap-2 rounded-nav px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      location.pathname === '/practitioner/settings'
                        ? 'bg-primary text-white'
                        : 'text-content-secondary hover:bg-lavender-100 hover:text-content-primary'
                    }`}
                  >
                    <Settings className="h-4 w-4" strokeWidth={1.5} />
                    Settings
                  </Link>
                </nav>
              )}

              <div className="hidden h-6 w-px bg-border md:block" />

              <span className="hidden text-caption text-content-muted md:block">{auth.name}</span>

              <button
                onClick={onLogout}
                className="flex items-center gap-2 rounded-btn border border-border px-4 py-2 text-caption font-medium text-content-secondary transition-all duration-150 hover:border-error-text hover:bg-error-bg hover:text-error-text"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
                Sign Out
              </button>
            </>
          )}

          {isPatientRoute && patientSession && !location.pathname.includes('/complete') && (
            <span className="text-caption text-content-muted">
              {patientSession.name}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
