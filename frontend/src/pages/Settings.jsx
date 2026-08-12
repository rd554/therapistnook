import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  CalendarDays,
  Users,
  Plug,
  CreditCard,
  Mail,
  MessageCircle,
  Bell,
  Shield,
  User,
  Calendar,
  CalendarClock,
  Globe,
  Loader2,
  Check,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'

import * as api from '../api/client'
import { SettingsSection, ToggleControl, FormField, IntegrationCard, SaveBar } from '../components/settings'
import AvailabilitySettings from '../components/AvailabilitySettings'
import VoiceProfile from '../components/VoiceProfile'

const ICON_MAP = {
  CalendarDays,
  Users,
  Plug,
  CreditCard,
  Mail,
  MessageCircle,
  Bell,
  Shield,
  User,
  Calendar,
  CalendarSync: CalendarClock,
  CalendarClock,
  Globe,
}

const CURRENCIES = [
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
]

const EMAIL_PROVIDERS = [
  { value: 'smtp', label: 'SMTP' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'mailgun', label: 'Mailgun' },
]

const PAYMENT_PROVIDERS = [
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'paypal', label: 'PayPal' },
]

export default function Settings({ auth }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [navigation, setNavigation] = useState({ role: '', sections: [] })
  const [activeSection, setActiveSection] = useState('')
  const [loading, setLoading] = useState(true)

  const isOwner = auth?.role === 'owner'

  useEffect(() => {
    loadNavigation()
  }, [])

  useEffect(() => {
    const sectionFromUrl = searchParams.get('section')
    if (sectionFromUrl && navigation.sections.find(s => s.id === sectionFromUrl)) {
      setActiveSection(sectionFromUrl)
    } else if (navigation.sections.length > 0 && !activeSection) {
      setActiveSection(navigation.sections[0].id)
    }
  }, [navigation.sections, searchParams])

  const loadNavigation = async () => {
    try {
      const data = await api.getSettingsNavigation()
      setNavigation(data)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load settings navigation:', err)
      setLoading(false)
    }
  }

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId)
    setSearchParams({ section: sectionId })
  }

  const currentSection = navigation.sections.find(s => s.id === activeSection)
  const Icon = currentSection ? ICON_MAP[currentSection.icon] : SettingsIcon

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          {isOwner
            ? 'Manage your clinic, integrations, and platform configuration'
            : 'Manage your account and preferences'}
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <div className="hidden w-64 shrink-0 lg:block">
          <nav className="card !p-2">
            <ul className="space-y-1">
              {navigation.sections.map((section) => {
                const SectionIcon = ICON_MAP[section.icon] || SettingsIcon
                const isActive = activeSection === section.id
                return (
                  <li key={section.id}>
                    <button
                      onClick={() => handleSectionChange(section.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <SectionIcon
                        className={`h-5 w-5 shrink-0 ${
                          isActive ? 'text-primary-600' : 'text-gray-400'
                        }`}
                      />
                      <span className="flex-1 truncate">{section.label}</span>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? 'text-primary-500' : 'text-gray-300'
                        }`}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>

        {/* Mobile Section Selector */}
        <div className="mb-4 lg:hidden">
          <select
            value={activeSection}
            onChange={(e) => handleSectionChange(e.target.value)}
            className="input-field"
          >
            {navigation.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </div>

        {/* Content Area */}
        <div className="min-w-0 flex-1">
          {/* Admin Sections */}
          {isOwner && activeSection === 'appointments' && <AppointmentConfigSection />}
          {isOwner && activeSection === 'integrations' && <IntegrationsSection />}
          {isOwner && activeSection === 'payment' && <PaymentGatewaySection />}
          {isOwner && activeSection === 'email' && <EmailConfigSection />}
          {isOwner && activeSection === 'whatsapp' && <WhatsAppConfigSection />}
          {isOwner && activeSection === 'notifications' && <NotificationTemplatesSection />}
          {isOwner && activeSection === 'security' && <SecuritySettingsSection />}

          {/* Practitioner Sections */}
          {activeSection === 'profile' && <ProfileSection auth={auth} />}
          {activeSection === 'availability' && <AvailabilitySettings />}
          {activeSection === 'calendar' && <CalendarIntegrationSection />}
          {(activeSection === 'notifications' && !isOwner) && <NotificationPreferencesSection />}
          {activeSection === 'public-profile' && <PublicProfileSection />}
          {(activeSection === 'security' && !isOwner) && <PractitionerSecuritySection />}
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN SETTINGS SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════



function AppointmentConfigSection() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const data = await api.getAppointmentConfig()
      setConfig(data)
    } catch (err) {
      setError('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await api.updateAppointmentConfig(config)
      setConfig(data)
      setHasChanges(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const toggleDay = (dayIndex) => {
    const current = config.default_working_days || []
    const newDays = current.includes(dayIndex)
      ? current.filter((d) => d !== dayIndex)
      : [...current, dayIndex].sort()
    handleChange('default_working_days', newDays)
  }

  return (
    <>
      <SettingsSection
        title="Appointment Configuration"
        description="Default settings for appointments and scheduling"
        loading={loading}
      >
        {config && (
          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Default Session Duration" description="In minutes">
                <select
                  value={config.default_duration_minutes || 50}
                  onChange={(e) => handleChange('default_duration_minutes', parseInt(e.target.value))}
                  className="input-field"
                >
                  {[30, 45, 50, 60, 90, 120].map((d) => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Buffer Between Appointments" description="In minutes">
                <select
                  value={config.buffer_time_minutes || 10}
                  onChange={(e) => handleChange('buffer_time_minutes', parseInt(e.target.value))}
                  className="input-field"
                >
                  {[0, 5, 10, 15, 20, 30].map((d) => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Max Advance Booking" description="Days in advance">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={config.max_advance_booking_days || 30}
                  onChange={(e) => handleChange('max_advance_booking_days', parseInt(e.target.value))}
                  className="input-field"
                />
              </FormField>

              <FormField label="Minimum Booking Notice" description="Hours notice required">
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={config.min_booking_notice_hours || 24}
                  onChange={(e) => handleChange('min_booking_notice_hours', parseInt(e.target.value))}
                  className="input-field"
                />
              </FormField>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 font-medium text-gray-900">Default Working Days</h3>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day, index) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(index)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      (config.default_working_days || []).includes(index)
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 font-medium text-gray-900">Default Working Hours</h3>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Start Time">
                  <input
                    type="time"
                    value={config.default_work_start_time || '09:00'}
                    onChange={(e) => handleChange('default_work_start_time', e.target.value)}
                    className="input-field"
                  />
                </FormField>
                <FormField label="End Time">
                  <input
                    type="time"
                    value={config.default_work_end_time || '18:00'}
                    onChange={(e) => handleChange('default_work_end_time', e.target.value)}
                    className="input-field"
                  />
                </FormField>
                <FormField label="Break Start">
                  <input
                    type="time"
                    value={config.default_break_start_time || '13:00'}
                    onChange={(e) => handleChange('default_break_start_time', e.target.value)}
                    className="input-field"
                  />
                </FormField>
                <FormField label="Break End">
                  <input
                    type="time"
                    value={config.default_break_end_time || '14:00'}
                    onChange={(e) => handleChange('default_break_end_time', e.target.value)}
                    className="input-field"
                  />
                </FormField>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SaveBar
        show={hasChanges}
        saving={saving}
        saved={saved}
        error={error}
        onSave={handleSave}
        onCancel={() => loadConfig().then(() => setHasChanges(false))}
      />
    </>
  )
}


function IntegrationsSection() {
  const [calendarIntegration, setCalendarIntegration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  useEffect(() => {
    loadIntegrations()
  }, [])

  const loadIntegrations = async () => {
    try {
      const data = await api.getCalendarIntegration()
      setCalendarIntegration(data)
    } catch (err) {
      console.error('Failed to load integrations:', err)
    } finally {
      setLoading(false)
    }
  }

  // Google Meet links are created via the Calendar API (there's no separate
  // "Meet API"), so one Google OAuth connection powers both the Calendar and
  // Meet cards below — connecting either one connects both.
  const handleConnectGoogle = async () => {
    setConnectError('')
    setConnecting(true)
    try {
      const redirectUri = `${window.location.origin}/settings/google-callback`
      const { auth_url } = await api.getGoogleAuthUrl(redirectUri)
      window.location.href = auth_url
    } catch (err) {
      setConnecting(false)
      setConnectError(err.userMessage || 'Failed to start Google connection. Is GOOGLE_CLIENT_ID configured?')
    }
  }

  const handleDisconnectGoogle = async () => {
    await api.disconnectGoogleCalendar()
    loadIntegrations()
  }

  const googleConnected = calendarIntegration?.google_connected || false

  return (
    <div className="space-y-6">
      {connectError && (
        <div className="alert-error px-4 py-3">{connectError}</div>
      )}

      <SettingsSection
        title="Calendar Integration"
        description="Connect external calendars to sync appointments"
        loading={loading}
      >
        <div className="space-y-4">
          <IntegrationCard
            name="Google Calendar"
            description="Sync appointments with your Google Calendar"
            icon={Calendar}
            connected={googleConnected}
            loading={connecting}
            lastSyncAt={calendarIntegration?.google_last_sync_at}
            syncError={calendarIntegration?.google_sync_error}
            onConnect={handleConnectGoogle}
            onDisconnect={handleDisconnectGoogle}
            onTest={async () => {
              await api.syncCalendar()
              loadIntegrations()
            }}
          />

          <IntegrationCard
            name="Microsoft Outlook"
            description="Sync appointments with Outlook Calendar"
            icon={Calendar}
            connected={false}
            comingSoon
          />

          <IntegrationCard
            name="Apple Calendar"
            description="Sync appointments with Apple Calendar"
            icon={Calendar}
            connected={false}
            comingSoon
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Meeting Integration"
        description="Configure video conferencing providers"
      >
        <div className="space-y-4">
          <IntegrationCard
            name="Google Meet"
            description={googleConnected
              ? "Connected via your Google account — Meet links are added automatically to online appointments"
              : "Automatically create Google Meet links for online appointments (uses the same connection as Google Calendar)"}
            icon={Plug}
            connected={googleConnected}
            loading={connecting}
            onConnect={handleConnectGoogle}
            onDisconnect={handleDisconnectGoogle}
          />

          <IntegrationCard
            name="Zoom"
            description="Integrate with Zoom for video consultations"
            icon={Plug}
            connected={false}
            comingSoon
          />

          <IntegrationCard
            name="Microsoft Teams"
            description="Create Teams meetings for online sessions"
            icon={Plug}
            connected={false}
            comingSoon
          />
        </div>
      </SettingsSection>
    </div>
  )
}


function PaymentGatewaySection() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const data = await api.getPaymentGatewayConfig()
      setConfig(data)
    } catch (err) {
      setError('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await api.updatePaymentGatewayConfig(config)
      setConfig(data)
      setHasChanges(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const result = await api.testPaymentGateway()
      if (result.success) {
        alert('Connection successful!')
      } else {
        alert(`Connection failed: ${result.error || result.message}`)
      }
    } catch (err) {
      alert('Test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <SettingsSection
        title="Payment Gateway Configuration"
        description="Configure payment processing for your clinic"
        loading={loading}
      >
        {config && (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div>
                <h3 className="font-medium text-gray-900">Enable Payment Gateway</h3>
                <p className="text-sm text-gray-500">Accept online payments from patients</p>
              </div>
              <ToggleControl
                checked={config.is_enabled || false}
                onChange={(checked) => handleChange('is_enabled', checked)}
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="Payment Provider">
                <select
                  value={config.provider || 'razorpay'}
                  onChange={(e) => handleChange('provider', e.target.value)}
                  className="input-field"
                >
                  {PAYMENT_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Currency">
                <select
                  value={config.currency || 'INR'}
                  onChange={(e) => handleChange('currency', e.target.value)}
                  className="input-field"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 font-medium text-gray-900">API Credentials</h3>
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField label="API Key">
                  <input
                    type="password"
                    value={config.api_key || ''}
                    onChange={(e) => handleChange('api_key', e.target.value)}
                    placeholder={config.has_api_key ? '••••••••' : 'Enter API key'}
                    className="input-field"
                  />
                  {config.has_api_key && !config.api_key && (
                    <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> API key is set
                    </p>
                  )}
                </FormField>

                <FormField label="API Secret">
                  <input
                    type="password"
                    value={config.api_secret || ''}
                    onChange={(e) => handleChange('api_secret', e.target.value)}
                    placeholder={config.has_api_secret ? '••••••••' : 'Enter API secret'}
                    className="input-field"
                  />
                  {config.has_api_secret && !config.api_secret && (
                    <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> API secret is set
                    </p>
                  )}
                </FormField>
              </div>

              <div className="mt-4">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="btn-secondary"
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </button>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 font-medium text-gray-900">Invoice Settings</h3>
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField label="Invoice Prefix">
                  <input
                    type="text"
                    value={config.invoice_prefix || 'INV'}
                    onChange={(e) => handleChange('invoice_prefix', e.target.value)}
                    className="input-field"
                  />
                </FormField>

                <FormField label="Receipt Prefix">
                  <input
                    type="text"
                    value={config.receipt_prefix || 'RCP'}
                    onChange={(e) => handleChange('receipt_prefix', e.target.value)}
                    className="input-field"
                  />
                </FormField>
              </div>
            </div>

            <div className="border-t pt-6">
              <ToggleControl
                label="Enable Tax"
                description="Apply tax to payments"
                checked={config.tax_enabled || false}
                onChange={(checked) => handleChange('tax_enabled', checked)}
              />

              {config.tax_enabled && (
                <div className="mt-4 max-w-xs">
                  <FormField label="Default Tax Percentage">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={(config.default_tax_percentage || 0) / 100}
                      onChange={(e) => handleChange('default_tax_percentage', Math.round(parseFloat(e.target.value) * 100))}
                      className="input-field"
                    />
                  </FormField>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-4">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <ToggleControl
                  label="Test Mode"
                  description="Use sandbox/test environment for payments"
                  checked={config.is_test_mode || false}
                  onChange={(checked) => handleChange('is_test_mode', checked)}
                />
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SaveBar
        show={hasChanges}
        saving={saving}
        saved={saved}
        error={error}
        onSave={handleSave}
        onCancel={() => loadConfig().then(() => setHasChanges(false))}
      />
    </>
  )
}


function EmailConfigSection() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const data = await api.getEmailConfig()
      // The Port field falls back to displaying 587 when nothing is stored yet;
      // write that default into state too, so what's shown is what actually gets saved.
      setConfig({ ...data, smtp_port: data.smtp_port ?? 587 })
    } catch (err) {
      setError('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await api.updateEmailConfig(config)
      setConfig(data)
      setHasChanges(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testEmail) {
      alert('Please enter a test email address')
      return
    }
    setTesting(true)
    try {
      // The test endpoint reads the saved configuration from the database,
      // so unsaved edits (e.g. a freshly typed SMTP Host) must be persisted first.
      if (hasChanges) {
        try {
          const saved = await api.updateEmailConfig(config)
          setConfig(saved)
          setHasChanges(false)
        } catch (err) {
          alert('Failed to save configuration before testing')
          return
        }
      }
      const result = await api.testEmailConfig(testEmail)
      if (result.success) {
        alert('Test email sent successfully!')
      } else {
        alert(`Failed: ${result.error || result.message}`)
      }
    } catch (err) {
      alert('Test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <SettingsSection
        title="Email Configuration"
        description="Configure email settings for notifications"
        loading={loading}
      >
        {config && (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div>
                <h3 className="font-medium text-gray-900">Enable Email Notifications</h3>
                <p className="text-sm text-gray-500">Send appointment and payment notifications via email</p>
              </div>
              <ToggleControl
                checked={config.is_enabled || false}
                onChange={(checked) => handleChange('is_enabled', checked)}
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="Email Provider">
                <select
                  value={config.provider || 'smtp'}
                  onChange={(e) => handleChange('provider', e.target.value)}
                  className="input-field"
                >
                  {EMAIL_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Sender Name">
                <input
                  type="text"
                  value={config.sender_name || ''}
                  onChange={(e) => handleChange('sender_name', e.target.value)}
                  placeholder="My Practice"
                  className="input-field"
                />
              </FormField>

              <FormField label="Sender Email">
                <input
                  type="email"
                  value={config.sender_email || ''}
                  onChange={(e) => handleChange('sender_email', e.target.value)}
                  placeholder="noreply@example.com"
                  className="input-field"
                />
              </FormField>

              <FormField label="Reply-To Email">
                <input
                  type="email"
                  value={config.reply_to_email || ''}
                  onChange={(e) => handleChange('reply_to_email', e.target.value)}
                  placeholder="support@example.com"
                  className="input-field"
                />
              </FormField>
            </div>

            {config.provider === 'smtp' && (
              <div className="border-t pt-6">
                <h3 className="mb-4 font-medium text-gray-900">SMTP Settings</h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField label="SMTP Host">
                    <input
                      type="text"
                      value={config.smtp_host || ''}
                      onChange={(e) => handleChange('smtp_host', e.target.value)}
                      placeholder="smtp.example.com"
                      className="input-field"
                    />
                  </FormField>

                  <FormField label="SMTP Port">
                    <input
                      type="number"
                      value={config.smtp_port || 587}
                      onChange={(e) => handleChange('smtp_port', parseInt(e.target.value))}
                      className="input-field"
                    />
                  </FormField>

                  <FormField label="Username">
                    <input
                      type="text"
                      value={config.smtp_username || ''}
                      onChange={(e) => handleChange('smtp_username', e.target.value)}
                      className="input-field"
                    />
                  </FormField>

                  <FormField label="Password">
                    <input
                      type="password"
                      value={config.smtp_password || ''}
                      onChange={(e) => handleChange('smtp_password', e.target.value)}
                      placeholder="••••••••"
                      className="input-field"
                    />
                  </FormField>
                </div>

                <div className="mt-4">
                  <ToggleControl
                    label="Use TLS"
                    description="Use TLS encryption for SMTP connection"
                    checked={config.smtp_use_tls !== false}
                    onChange={(checked) => handleChange('smtp_use_tls', checked)}
                  />
                </div>
              </div>
            )}

            <div className="border-t pt-6">
              <h3 className="mb-4 font-medium text-gray-900">Test Email</h3>
              <div className="flex gap-4">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="input-field max-w-xs"
                />
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="btn-secondary"
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Test'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SaveBar
        show={hasChanges}
        saving={saving}
        saved={saved}
        error={error}
        onSave={handleSave}
        onCancel={() => loadConfig().then(() => setHasChanges(false))}
      />
    </>
  )
}


function WhatsAppConfigSection() {
  return (
    <SettingsSection
      title="WhatsApp Configuration"
      description="Configure WhatsApp Business API for notifications"
    >
      <div className="space-y-6">
        <IntegrationCard
          name="WhatsApp Business API"
          description="Send appointment reminders and notifications via WhatsApp"
          icon={MessageCircle}
          connected={false}
          onConnect={() => {/* Implement */}}
        />

        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            WhatsApp Business API requires approval from Meta. Once approved, you can configure your business account credentials here to send notifications to patients.
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}


function NotificationTemplatesSection() {
  return (
    <SettingsSection
      title="Notification Templates"
      description="Customize notification messages sent to patients"
    >
      <div className="space-y-4">
        {[
          { id: 'appointment_confirmation', name: 'Appointment Confirmation', description: 'Sent when an appointment is confirmed' },
          { id: 'payment_request', name: 'Payment Request', description: 'Sent when payment is required' },
          { id: 'payment_confirmation', name: 'Payment Confirmation', description: 'Sent after successful payment' },
          { id: 'appointment_reminder', name: 'Appointment Reminder', description: 'Sent before scheduled appointments' },
          { id: 'cancellation', name: 'Cancellation Notice', description: 'Sent when appointment is cancelled' },
          { id: 'reschedule', name: 'Reschedule Notice', description: 'Sent when appointment is rescheduled' },
        ].map((template) => (
          <div key={template.id} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="font-medium text-gray-900">{template.name}</h3>
              <p className="text-sm text-gray-500">{template.description}</p>
            </div>
            <button className="btn-secondary text-sm">
              Edit Template
            </button>
          </div>
        ))}
      </div>
    </SettingsSection>
  )
}




function SecuritySettingsSection() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const data = await api.getSecuritySettings()
      setSettings(data)
    } catch (err) {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await api.updateSecuritySettings(settings)
      setSettings(data)
      setHasChanges(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SettingsSection
        title="Security Settings"
        description="Configure password policy and security options"
        loading={loading}
      >
        {settings && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-4 font-medium text-gray-900">Password Policy</h3>
              <div className="space-y-4">
                <FormField label="Minimum Password Length">
                  <input
                    type="number"
                    min={6}
                    max={32}
                    value={settings.min_password_length || 8}
                    onChange={(e) => handleChange('min_password_length', parseInt(e.target.value))}
                    className="input-field max-w-32"
                  />
                </FormField>

                <div className="space-y-3">
                  <ToggleControl
                    label="Require uppercase letters"
                    checked={settings.require_uppercase !== false}
                    onChange={(checked) => handleChange('require_uppercase', checked)}
                  />
                  <ToggleControl
                    label="Require lowercase letters"
                    checked={settings.require_lowercase !== false}
                    onChange={(checked) => handleChange('require_lowercase', checked)}
                  />
                  <ToggleControl
                    label="Require numbers"
                    checked={settings.require_numbers !== false}
                    onChange={(checked) => handleChange('require_numbers', checked)}
                  />
                  <ToggleControl
                    label="Require special characters"
                    checked={settings.require_special_chars || false}
                    onChange={(checked) => handleChange('require_special_chars', checked)}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 font-medium text-gray-900">Session Settings</h3>
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField label="Session Timeout" description="Minutes of inactivity before logout">
                  <input
                    type="number"
                    min={5}
                    value={settings.session_timeout_minutes || 1440}
                    onChange={(e) => handleChange('session_timeout_minutes', parseInt(e.target.value))}
                    className="input-field"
                  />
                </FormField>

                <FormField label="Max Login Attempts" description="Before account lockout">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.max_login_attempts || 5}
                    onChange={(e) => handleChange('max_login_attempts', parseInt(e.target.value))}
                    className="input-field"
                  />
                </FormField>

                <FormField label="Lockout Duration" description="Minutes after failed attempts">
                  <input
                    type="number"
                    min={1}
                    value={settings.lockout_duration_minutes || 30}
                    onChange={(e) => handleChange('lockout_duration_minutes', parseInt(e.target.value))}
                    className="input-field"
                  />
                </FormField>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 font-medium text-gray-900">Two-Factor Authentication</h3>
              <div className="space-y-3">
                <ToggleControl
                  label="Enable Two-Factor Authentication"
                  description="Allow users to enable 2FA for their accounts"
                  checked={settings.two_factor_enabled || false}
                  onChange={(checked) => handleChange('two_factor_enabled', checked)}
                />
                <ToggleControl
                  label="Require Two-Factor Authentication"
                  description="Require all users to enable 2FA"
                  checked={settings.two_factor_required || false}
                  onChange={(checked) => handleChange('two_factor_required', checked)}
                  disabled={!settings.two_factor_enabled}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Two-factor authentication will be available in a future update.
              </p>
            </div>
          </div>
        )}
      </SettingsSection>

      <SaveBar
        show={hasChanges}
        saving={saving}
        saved={saved}
        error={error}
        onSave={handleSave}
        onCancel={() => loadSettings().then(() => setHasChanges(false))}
      />
    </>
  )
}




// ═══════════════════════════════════════════════════════════════════════════════
//  PRACTITIONER SETTINGS SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileSection({ auth }) {
  return (
    <SettingsSection
      title="Personal Profile"
      description="Your account information"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
            <User className="h-8 w-8 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{auth?.name || 'User'}</h3>
            <p className="text-sm text-gray-500 capitalize">{auth?.role}</p>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            To update your account details, please contact your administrator.
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}


function CalendarIntegrationSection() {
  const [integration, setIntegration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  useEffect(() => {
    loadIntegration()
  }, [])

  const loadIntegration = async () => {
    try {
      const data = await api.getCalendarIntegration()
      setIntegration(data)
    } catch (err) {
      console.error('Failed to load calendar integration:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.syncCalendar()
      await loadIntegration()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Calendar?')) return
    try {
      await api.disconnectGoogleCalendar()
      await loadIntegration()
    } catch (err) {
      console.error('Disconnect failed:', err)
    }
  }

  const handleConnect = async () => {
    setConnectError('')
    setConnecting(true)
    try {
      const redirectUri = `${window.location.origin}/settings/google-callback`
      const { auth_url } = await api.getGoogleAuthUrl(redirectUri)
      window.location.href = auth_url
    } catch (err) {
      setConnecting(false)
      setConnectError(err.userMessage || 'Failed to start Google connection. Is GOOGLE_CLIENT_ID configured?')
    }
  }

  return (
    <SettingsSection
      title="Calendar Integration"
      description="Sync your appointments with external calendars"
      loading={loading}
    >
      {connectError && (
        <div className="alert-error px-4 py-3 mb-4">{connectError}</div>
      )}
      {integration && (
        <div className="space-y-4">
          <IntegrationCard
            name="Google Calendar"
            description="Sync appointments with your Google Calendar"
            icon={Calendar}
            connected={integration.google_connected}
            lastSyncAt={integration.google_last_sync_at}
            syncError={integration.google_sync_error}
            loading={syncing || connecting}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            actions={
              integration.google_connected && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="btn-secondary text-sm"
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              )
            }
          />

          {integration.google_connected && (
            <div className="mt-4">
              <FormField label="Sync Direction">
                <select
                  value={integration.google_sync_direction || 'two_way'}
                  onChange={async (e) => {
                    await api.updateCalendarIntegration({ google_sync_direction: e.target.value })
                    loadIntegration()
                  }}
                  className="input-field max-w-xs"
                >
                  <option value="two_way">Two-way sync</option>
                  <option value="one_way_to_google">Only push to Google</option>
                  <option value="one_way_from_google">Only pull from Google</option>
                </select>
              </FormField>
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  )
}


function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPrefs()
  }, [])

  const loadPrefs = async () => {
    try {
      const data = await api.getNotificationPreferences()
      setPrefs(data)
    } catch (err) {
      console.error('Failed to load preferences:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = async (field, value) => {
    setPrefs((prev) => ({ ...prev, [field]: value }))
    setSaving(true)
    try {
      await api.updateNotificationPreferences({ [field]: value })
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Notification Preferences"
      description="Choose how you want to be notified"
      loading={loading}
    >
      {prefs && (
        <div className="space-y-8">
          <div>
            <h3 className="mb-4 font-medium text-gray-900">Email Notifications</h3>
            <div className="space-y-4">
              <ToggleControl
                label="New booking request"
                description="When a patient books an appointment"
                checked={prefs.email_new_booking}
                onChange={(v) => handleChange('email_new_booking', v)}
              />
              <ToggleControl
                label="Booking cancelled"
                description="When a patient cancels their appointment"
                checked={prefs.email_booking_cancelled}
                onChange={(v) => handleChange('email_booking_cancelled', v)}
              />
              <ToggleControl
                label="Booking rescheduled"
                description="When an appointment is rescheduled"
                checked={prefs.email_booking_rescheduled}
                onChange={(v) => handleChange('email_booking_rescheduled', v)}
              />
              <ToggleControl
                label="Payment received"
                description="When a patient completes payment"
                checked={prefs.email_payment_received}
                onChange={(v) => handleChange('email_payment_received', v)}
              />
              <ToggleControl
                label="Daily summary"
                description="Receive a daily summary of your schedule"
                checked={prefs.email_daily_summary}
                onChange={(v) => handleChange('email_daily_summary', v)}
              />
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="mb-4 font-medium text-gray-900">In-App Notifications</h3>
            <div className="space-y-4">
              <ToggleControl
                label="New booking request"
                checked={prefs.inapp_new_booking}
                onChange={(v) => handleChange('inapp_new_booking', v)}
              />
              <ToggleControl
                label="Booking cancelled"
                checked={prefs.inapp_booking_cancelled}
                onChange={(v) => handleChange('inapp_booking_cancelled', v)}
              />
              <ToggleControl
                label="Booking rescheduled"
                checked={prefs.inapp_booking_rescheduled}
                onChange={(v) => handleChange('inapp_booking_rescheduled', v)}
              />
              <ToggleControl
                label="Payment received"
                checked={prefs.inapp_payment_received}
                onChange={(v) => handleChange('inapp_payment_received', v)}
              />
              <ToggleControl
                label="Upcoming appointment reminders"
                checked={prefs.inapp_reminder_upcoming}
                onChange={(v) => handleChange('inapp_reminder_upcoming', v)}
              />
            </div>
          </div>

          {saving && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  )
}


function PublicProfileSection() {
  return (
    <SettingsSection
      title="Public Profile Settings"
      description="Manage your public practice profile"
    >
      <div className="text-center py-8">
        <Globe className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-4 text-sm text-gray-500">
          Go to <a href="/public-profile" className="text-primary-600 hover:text-primary-700 font-medium">Public Profile</a> to manage your public practice profile.
        </p>
      </div>
    </SettingsSection>
  )
}


function PractitionerSecuritySection() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const data = await api.getActiveSessions()
      setSessions(data.sessions)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTerminate = async (sessionId) => {
    if (!confirm('Are you sure you want to terminate this session?')) return
    try {
      await api.terminateSession(sessionId)
      loadSessions()
    } catch (err) {
      console.error('Failed to terminate session:', err)
    }
  }

  const handleLogoutAll = async () => {
    if (!confirm('Are you sure you want to log out of all other sessions?')) return
    try {
      await api.logoutAllSessions()
      loadSessions()
    } catch (err) {
      console.error('Failed to logout sessions:', err)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Change Password"
        description="Update your account password"
      >
        <div className="text-center py-4">
          <a href="/change-password" className="btn-primary">
            Change Password
          </a>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Active Sessions"
        description="Manage your logged-in devices"
        loading={loading}
        actions={
          sessions.length > 1 && (
            <button onClick={handleLogoutAll} className="text-sm text-red-600 hover:text-red-700">
              Logout all other devices
            </button>
          )
        }
      >
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center justify-between rounded-lg border p-4 ${
                session.is_current ? 'border-green-200 bg-green-50' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {session.device_info || 'Unknown device'}
                  </span>
                  {session.is_current && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {session.ip_address && `${session.ip_address} • `}
                  Last active: {new Date(session.last_active_at).toLocaleString()}
                </p>
              </div>
              {!session.is_current && (
                <button
                  onClick={() => handleTerminate(session.id)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Logout
                </button>
              )}
            </div>
          ))}

          {sessions.length === 0 && (
            <p className="text-center text-gray-500 py-4">No active sessions</p>
          )}
        </div>
      </SettingsSection>
    </div>
  )
}
