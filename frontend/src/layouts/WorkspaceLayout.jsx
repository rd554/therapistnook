import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import WorkspaceHeader from './WorkspaceHeader'

export default function WorkspaceLayout({ auth, onLogout }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    return saved === 'true'
  })
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', isSidebarCollapsed)
  }, [isSidebarCollapsed])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleToggleCollapse = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  const handleMobileMenuToggle = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen)
  }

  const handleMobileClose = () => {
    setIsMobileSidebarOpen(false)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar */}
      <Sidebar
        userName={auth?.name || 'Ravi D'}
        userRoleLabel={auth?.role === 'owner' ? 'Practice Owner' : 'Clinical Psychologist'}
        userAvatar={auth?.avatar}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={handleMobileClose}
      />

      {/* Main Content Area */}
      <div
        className="flex flex-col min-h-screen bg-white transition-all duration-300 lg:ml-[240px]"
      >
        {/* Header */}
        <WorkspaceHeader
          auth={auth}
          onLogout={onLogout}
          onMobileMenuToggle={handleMobileMenuToggle}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Page Content */}
        <main className="workspace-main flex-1 animate-fade-in">
          <Outlet />
        </main>
      </div>

      {/* Mobile: Reset margin */}
      <style>{`
        @media (max-width: 1023px) {
          .min-h-screen > div:last-child {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
