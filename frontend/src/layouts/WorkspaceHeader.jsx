import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Menu, Bell, LogOut, User, Settings, Clock, Plus, CalendarPlus } from 'lucide-react'
import { listNotifications } from '../api/client'

function getInitials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'
}

// One string, weekday + no year: "Thursday, Sep 11 · 10:42 AM" — collapsed
// from separate date/time chips per the Clinical Ink spec.
function formatHeaderDateTime(date) {
  const datePart = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${datePart} · ${timePart}`
}

export default function WorkspaceHeader({
  auth,
  onLogout,
  onMobileMenuToggle,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const onPatientsPage = location.pathname === '/patients'
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const profileMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    let cancelled = false
    listNotifications({ unreadOnly: true, limit: 1 })
      .then((res) => {
        if (!cancelled) setUnreadCount(res?.unread_count || 0)
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="clinical-ink workspace-header">
      {/* Left: mobile menu + date/time */}
      <div className="workspace-header__left">
        <button
          onClick={onMobileMenuToggle}
          className="workspace-header__icon-btn lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>

        <div className="workspace-header__datetime hidden sm:flex">
          <div className="workspace-header__datetime-item">
            <Clock size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{formatHeaderDateTime(now)}</span>
          </div>
        </div>
      </div>

      {/* Center-right actions + right cluster */}
      <div className="workspace-header__center-right">
        {/* Desktop: Add patient + solid Schedule session. Mobile gets its own
            single ghost icon below instead — Tailwind's "hidden" is (0,1,0)
            and .workspace-header__actions's own @apply-compiled display:flex
            is also (0,1,0), so hiding it directly on that element is a
            source-order coin flip (see clinical-ink-css-specificity-pitfalls);
            the wrapper div sidesteps that the same way ClinicalIntelligenceTab
            does for .ci-patient-head/.ci-toolbar. */}
        <div className="hidden sm:flex">
        <div className="workspace-header__actions">
          {/* Patients page owns its own page-level "Add patient" (§B6) — showing
              this one too would duplicate the action on the one screen where
              it's most likely to be clicked. */}
          {!onPatientsPage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/patients', { state: { openCreate: true } })}
              aria-label="Add patient"
            >
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden md:inline">Add patient</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/calendar')}
            aria-label="Schedule session"
          >
            <CalendarPlus size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden md:inline">Schedule session</span>
          </button>
        </div>
        </div>

        {/* Mobile: app-bar icons are ghost, never solid fill — the +/calendar
            pair collapses to this one action; "Add patient" lives on the
            Patients screen only. Same bare-wrapper trick as above: .topbar-
            actions's own display:flex is (0,2,0) once scoped and would beat
            Tailwind's sm:hidden if put on the same element. */}
        <div className="flex sm:hidden">
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => navigate('/calendar')}
              aria-label="Schedule session"
              title="Schedule session"
            >
              <CalendarPlus size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="workspace-header__right">
          <Link
            to="/inbox"
            className="workspace-header__icon-btn relative"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell size={20} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="workspace-header__notif-dot" aria-hidden="true" />
            )}
          </Link>

          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="workspace-header__avatar-btn"
              aria-label="Profile menu"
            >
              <div className="workspace-header__avatar">
                {getInitials(auth?.name)}
              </div>
            </button>

            {showProfileMenu && (
              <div className="workspace-header__dropdown">
                <div className="workspace-header__dropdown-info">
                  <p className="workspace-header__dropdown-name">{auth?.name}</p>
                  <p className="workspace-header__dropdown-role capitalize">{auth?.role}</p>
                </div>
                <div className="workspace-header__dropdown-links">
                  <Link
                    to="/profile-settings"
                    onClick={() => setShowProfileMenu(false)}
                    className="workspace-header__dropdown-link"
                  >
                    <User size={16} strokeWidth={1.5} />
                    Profile
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setShowProfileMenu(false)}
                    className="workspace-header__dropdown-link"
                  >
                    <Settings size={16} strokeWidth={1.5} />
                    Settings
                  </Link>
                </div>
                <button
                  onClick={() => {
                    setShowProfileMenu(false)
                    onLogout()
                  }}
                  className="workspace-header__dropdown-link workspace-header__dropdown-link--danger"
                >
                  <LogOut size={16} strokeWidth={1.5} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
