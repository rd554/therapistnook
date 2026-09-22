import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  CreditCard,
  BarChart3,
  Settings,
  X,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/home' },
  { id: 'patients', label: 'Patients', icon: Users, path: '/patients' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, path: '/calendar' },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/assessments' },
  { id: 'billing', label: 'Billing', icon: CreditCard, path: '/payments' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
]

function getInitials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Sidebar({ 
  userName = 'Ravi D',
  userRoleLabel = 'Clinical Psychologist',
  userAvatar,
  isMobileOpen, 
  onMobileClose 
}) {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path) => {
    if (path === '/home') {
      return location.pathname === '/home' || location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  const NavItemComponent = ({ item }) => {
    const Icon = item.icon
    const active = isActive(item.path)

    return (
      <NavLink
        to={item.path}
        onClick={onMobileClose}
        className={`nav-item${active ? ' is-active' : ''}`}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
        {item.label}
      </NavLink>
    )
  }

  // Avatar + name + role only (design system B8) — the trailing chevron the
  // old .sidebar-profile carried is gone; the prototype's static
  // .sidebar-footer has no affordance hinting at "this opens something" and
  // doesn't need one, and this row is already announced as a link/button by
  // its own role + hover state.
  const PractitionerProfile = () => (
    <div
      className="sidebar-footer"
      onClick={() => navigate('/profile-settings')}
      role="button"
      tabIndex={0}
      aria-label={`Profile: ${userName}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate('/profile-settings')
        }
      }}
    >
      {userAvatar ? (
        <img
          src={userAvatar}
          alt={userName}
          className="sidebar-footer__avatar-img"
        />
      ) : (
        <span className="avatar">{getInitials(userName)}</span>
      )}
      <div className="sidebar-footer-text">
        <span className="t-label truncate" style={{ color: 'var(--text-primary)' }}>{userName}</span>
        <span className="t-caption truncate">{userRoleLabel}</span>
      </div>
    </div>
  )

  const sidebarContent = (
    <>
      <div className="logo-row">
        <img src="/logo.png" alt="" aria-hidden="true" className="logo-tile" />
        <span className="t-h3">Therapist Nook</span>
      </div>

      {/* Navigation — flush list, no group header */}
      <nav className="sidebar-nav" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavItemComponent key={item.id} item={item} />
        ))}
      </nav>

      {/* Account block — pinned to bottom */}
      <PractitionerProfile />
    </>
  )

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={`clinical-ink sidebar sidebar--mobile ${isMobileOpen ? 'sidebar--open' : ''}`}
        aria-label="Mobile navigation"
      >
        <button
          onClick={onMobileClose}
          className="absolute right-4 top-6 p-2 rounded-full hover:bg-slate-50 transition-colors duration-150"
          aria-label="Close menu"
        >
          <X size={20} strokeWidth={1.5} className="text-content-secondary" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="clinical-ink sidebar sidebar--desktop" aria-label="Main navigation">
        {sidebarContent}
      </aside>
    </>
  )
}
