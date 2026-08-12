import { useState } from 'react'
import { Settings, Mic, User, Bell, Shield, Calendar } from 'lucide-react'
import VoiceProfile from '../components/VoiceProfile'
import AvailabilitySettings from '../components/AvailabilitySettings'

const TABS = [
  { id: 'availability', label: 'Availability', icon: Calendar },
  { id: 'voice-profile', label: 'Voice Profile', icon: Mic },
  { id: 'account', label: 'Account', icon: User, comingSoon: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, comingSoon: true },
  { id: 'security', label: 'Security', icon: Shield, comingSoon: true },
]

export default function PractitionerSettings() {
  const [activeTab, setActiveTab] = useState('availability')

  const currentTab = TABS.find(t => t.id === activeTab)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Settings className="h-6 w-6 text-gray-400" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="card !p-2">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.comingSoon && (
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    Soon
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'availability' ? (
        <AvailabilitySettings />
      ) : activeTab === 'voice-profile' ? (
        <VoiceProfile />
      ) : (
        <div className="card">
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              {currentTab && <currentTab.icon className="h-8 w-8 text-gray-400" />}
            </div>
            <h2 className="text-xl font-bold text-gray-900">{currentTab?.label || 'Settings'}</h2>
            <p className="mt-2 text-sm text-gray-500">
              This feature will be available in a future update.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
