// Builds the .settings-nav-status lines (spec: "built from SAVED settings, never
// unsaved form state") from each section's already-loaded API response. Pure
// string functions only — the fetching itself lives in SettingsShell.jsx.
import { formatTimeLabel, formatWorkingDaysCompact } from './schedulingReadback'

export function schedulingStatus(availability) {
  if (!availability) return ''
  const days = formatWorkingDaysCompact(availability.working_days)
  if (!availability.working_days || availability.working_days.length === 0) return days
  return `${days} · ${formatTimeLabel(availability.work_start_time)}–${formatTimeLabel(availability.work_end_time)}`
}

export function messagingStatus({ email, whatsapp }) {
  const emailOn = email?.is_enabled ? 'on' : 'off'
  const waOn = whatsapp?.is_enabled ? 'on' : 'off'
  return `Email ${emailOn} · WhatsApp ${waOn}`
}

export function paymentsStatus(paymentGateway) {
  return `Online payments ${paymentGateway?.is_enabled ? 'on' : 'off'}`
}

export function integrationsStatus(calendarIntegration) {
  return `Google Calendar ${calendarIntegration?.google_connected ? 'connected' : 'not connected'}`
}

export function securityStatus(security) {
  if (!security) return ''
  const minutes = security.session_timeout_minutes
  const label = minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`
  return `Sign out after ${label} idle`
}
