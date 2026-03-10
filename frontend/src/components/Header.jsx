import { Link, useLocation } from 'react-router-dom'
import { ClipboardList, LogOut, LayoutDashboard, Shield } from 'lucide-react'

export default function Header({ auth, onLogout, patientSession }) {
  const location = useLocation()
  const isPatientRoute = location.pathname.startsWith('/test')
  const isLoggedIn = !!auth?.token

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to={isLoggedIn ? '/dashboard' : '/'} className="flex items-center gap-2 text-lg font-bold text-primary-700">
          <ClipboardList className="h-6 w-6" />
          MMPI-2 Assessment
        </Link>

        <div className="flex items-center gap-3">
          {isLoggedIn && !isPatientRoute && (
            <>
              <nav className="hidden items-center gap-1 md:flex">
                <Link
                  to="/dashboard"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    location.pathname.startsWith('/dashboard')
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                {auth.role === 'owner' && (
                  <Link
                    to="/admin"
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      location.pathname === '/admin'
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                )}
              </nav>

              <div className="hidden h-5 w-px bg-gray-200 md:block" />

              <span className="hidden text-xs text-gray-500 md:block">{auth.name}</span>

              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-600"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </>
          )}

          {isPatientRoute && patientSession && !location.pathname.includes('/complete') && (
            <span className="text-xs text-gray-400">
              {patientSession.name}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
