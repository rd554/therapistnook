import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mmpi_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const data = err.response?.data
    
    if (status === 401) {
      const isProtectedRoute = ['/home', '/patients', '/calendar', '/payments', '/settings', '/practitioners', '/analytics', '/inbox', '/assessments'].some(
        path => window.location.pathname.startsWith(path)
      )
      
      if (isProtectedRoute) {
        localStorage.removeItem('mmpi_token')
        localStorage.removeItem('mmpi_role')
        localStorage.removeItem('mmpi_prac_name')
        window.location.href = '/login?session_expired=true'
        return Promise.reject(err)
      }
    }
    
    if (status === 429) {
      const retryAfter = data?.retry_after || 60
      err.userMessage = `Too many requests. Please wait ${retryAfter} seconds and try again.`
    } else if (status === 403) {
      err.userMessage = data?.message || 'You do not have permission to perform this action.'
    } else if (status === 404) {
      err.userMessage = data?.message || 'The requested resource was not found.'
    } else if (status === 422) {
      const errors = data?.details?.errors
      if (errors && errors.length > 0) {
        err.userMessage = errors.map(e => e.message).join('. ')
        err.fieldErrors = errors.reduce((acc, e) => {
          if (e.field) acc[e.field] = e.message
          return acc
        }, {})
      } else {
        err.userMessage = data?.message || 'Please check your input and try again.'
      }
    } else if (status >= 500) {
      err.userMessage = 'An unexpected error occurred. Please try again later.'
    } else if (data?.message) {
      err.userMessage = data.message
    } else if (data?.detail) {
      err.userMessage = data.detail
    } else if (!err.response) {
      err.userMessage = 'Unable to connect to the server. Please check your internet connection.'
    }
    
    return Promise.reject(err)
  },
)

export function getErrorMessage(err) {
  return err.userMessage || err.message || 'An unexpected error occurred'
}

export function getFieldErrors(err) {
  return err.fieldErrors || {}
}

// ─── Auth ───────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password })
  return res.data
}

export async function getMe() {
  const res = await api.get('/auth/me')
  return res.data
}

export async function changePassword(currentPassword, newPassword) {
  const res = await api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return res.data
}

// ─── Admin ──────────────────────────────────────────────────────────────────────

export async function listPractitioners() {
  const res = await api.get('/admin/practitioners')
  return res.data
}

export async function createPractitioner(data) {
  const res = await api.post('/admin/practitioners', data)
  return res.data
}

export async function updatePractitioner(id, data) {
  const res = await api.patch(`/admin/practitioners/${id}`, data)
  return res.data
}

export async function deletePractitioner(id) {
  const res = await api.delete(`/admin/practitioners/${id}`)
  return res.data
}

// ─── Patient-facing ─────────────────────────────────────────────────────────────

export async function getPractitionerByRef(refCode) {
  const res = await api.get(`/practitioner/by-ref/${refCode}`)
  return res.data
}

export async function createPatientSession(data) {
  const res = await api.post('/patient/sessions', data)
  return res.data
}

export async function resumeSession(resumeCode) {
  const res = await api.post('/patient/resume', { resume_code: resumeCode })
  return res.data
}

export async function getQuestions(page = 1, perPage = 20) {
  const res = await api.get('/questions', { params: { page, per_page: perPage } })
  return res.data
}

export async function saveAnswers(sessionId, answers) {
  const res = await api.post(`/patient/sessions/${sessionId}/answers`, { answers })
  return res.data
}

export async function getAnswers(sessionId) {
  const res = await api.get(`/patient/sessions/${sessionId}/answers`)
  return res.data
}

export async function finishSession(sessionId) {
  const res = await api.post(`/patient/sessions/${sessionId}/finish`)
  return res.data
}

// ─── Dashboard (practitioner) ───────────────────────────────────────────────────

export async function listMySessions() {
  const res = await api.get('/dashboard/sessions')
  return res.data
}

export async function getSessionResults(sessionId) {
  const res = await api.get(`/dashboard/sessions/${sessionId}`)
  return res.data
}

export async function interpretResults(sessionId) {
  const res = await api.post(`/dashboard/sessions/${sessionId}/interpret`)
  return res.data
}

export function getPdfUrl(sessionId) {
  const token = localStorage.getItem('mmpi_token')
  return `/api/dashboard/sessions/${sessionId}/report/pdf?token=${token}`
}

// ─── Patient Management ──────────────────────────────────────────────────────

export async function listPatients({ search, status, sortBy, sortOrder } = {}) {
  const params = {}
  if (search) params.search = search
  if (status) params.status = status
  if (sortBy) params.sort_by = sortBy
  if (sortOrder) params.sort_order = sortOrder
  const res = await api.get('/patients', { params })
  return res.data
}

export async function getPatient(patientId) {
  const res = await api.get(`/patients/${patientId}`)
  return res.data
}

export async function createPatient(data) {
  const res = await api.post('/patients', data)
  return res.data
}

export async function updatePatient(patientId, data) {
  const res = await api.patch(`/patients/${patientId}`, data)
  return res.data
}

export async function archivePatient(patientId) {
  const res = await api.post(`/patients/${patientId}/archive`)
  return res.data
}

export async function restorePatient(patientId) {
  const res = await api.post(`/patients/${patientId}/restore`)
  return res.data
}

// ─── Bulk Patient Import ────────────────────────────────────────────────────

// Fetched as a blob (via the normal axios instance, so the auth header goes
// through the usual interceptor) rather than a `?token=` URL for `<a href>`,
// since this is a generated file rather than something already stored server-side.
export async function downloadPatientBulkTemplate() {
  const res = await api.get('/patients/bulk-template', { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = 'patient_bulk_upload_template.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function bulkImportPatients(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/patients/bulk-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

// ─── Intake Submissions (public "Start Intake" leads) ─────────────────────────

export async function listIntakeSubmissions(status = 'pending') {
  const res = await api.get('/intake-submissions', { params: { status } })
  return res.data
}

export async function acceptIntakeSubmission(submissionId) {
  const res = await api.post(`/intake-submissions/${submissionId}/accept`)
  return res.data
}

export async function declineIntakeSubmission(submissionId) {
  const res = await api.post(`/intake-submissions/${submissionId}/decline`)
  return res.data
}

// ─── Clinical History ────────────────────────────────────────────────────────

export async function getClinicalHistory(patientId) {
  const res = await api.get(`/patients/${patientId}/clinical-history`)
  return res.data
}

export async function updateClinicalHistory(patientId, data) {
  const res = await api.patch(`/patients/${patientId}/clinical-history`, data)
  return res.data
}

export async function getClinicalHistorySummary(patientId) {
  const res = await api.get(`/patients/${patientId}/clinical-history/summary`)
  return res.data
}

// ─── Clinical Documents ──────────────────────────────────────────────────────

export async function uploadDocument(patientId, file, category, notes = null, parentDocumentId = null, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', category)
  if (notes) formData.append('notes', notes)
  if (parentDocumentId) formData.append('parent_document_id', parentDocumentId)
  
  const res = await api.post(`/patients/${patientId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function listDocumentsAndAssessments(patientId, { search, category, fileType, assessmentType } = {}) {
  const params = {}
  if (search) params.search = search
  if (category) params.category = category
  if (fileType) params.file_type = fileType
  if (assessmentType) params.assessment_type = assessmentType
  const res = await api.get(`/patients/${patientId}/documents`, { params })
  return res.data
}

export async function getDocument(patientId, documentId) {
  const res = await api.get(`/patients/${patientId}/documents/${documentId}`)
  return res.data
}

export async function updateDocument(patientId, documentId, data) {
  const res = await api.patch(`/patients/${patientId}/documents/${documentId}`, data)
  return res.data
}

export async function deleteDocument(patientId, documentId) {
  const res = await api.delete(`/patients/${patientId}/documents/${documentId}`)
  return res.data
}

export async function getDocumentVersions(patientId, documentId) {
  const res = await api.get(`/patients/${patientId}/documents/${documentId}/versions`)
  return res.data
}

export function getDocumentDownloadUrl(patientId, documentId) {
  const token = localStorage.getItem('mmpi_token')
  return `/api/patients/${patientId}/documents/${documentId}/download?token=${token}`
}

export function getDocumentPreviewUrl(patientId, documentId) {
  const token = localStorage.getItem('mmpi_token')
  return `/api/patients/${patientId}/documents/${documentId}/preview?token=${token}`
}

// ─── Assessments ─────────────────────────────────────────────────────────────

export async function listAllAssessments({ status, assessmentType, search } = {}) {
  const params = {}
  if (status) params.status = status
  if (assessmentType) params.assessment_type = assessmentType
  if (search) params.search = search
  const res = await api.get('/assessments', { params })
  return res.data
}

export async function createAssessment(patientId, data) {
  const res = await api.post(`/patients/${patientId}/assessments`, data)
  return res.data
}

export async function listAssessments(patientId, assessmentType = null) {
  const params = {}
  if (assessmentType) params.assessment_type = assessmentType
  const res = await api.get(`/patients/${patientId}/assessments`, { params })
  return res.data
}

export async function getAssessment(patientId, assessmentId) {
  const res = await api.get(`/patients/${patientId}/assessments/${assessmentId}`)
  return res.data
}

export async function updateAssessment(patientId, assessmentId, data) {
  const res = await api.patch(`/patients/${patientId}/assessments/${assessmentId}`, data)
  return res.data
}

export async function deleteAssessment(patientId, assessmentId) {
  const res = await api.delete(`/patients/${patientId}/assessments/${assessmentId}`)
  return res.data
}

// ─── Voice Profile ────────────────────────────────────────────────────────────

export async function getVoiceProfileStatus() {
  const res = await api.get('/practitioner/voice-profile/status')
  return res.data
}

export async function uploadVoiceProfile(file, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  
  const res = await api.post('/practitioner/voice-profile', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function deleteVoiceProfile() {
  const res = await api.delete('/practitioner/voice-profile')
  return res.data
}

// ─── Therapy Sessions ─────────────────────────────────────────────────────────

export async function uploadTherapySession(patientId, file, sessionDate, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('session_date', sessionDate)
  
  const res = await api.post(`/patients/${patientId}/therapy-sessions`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function processTherapySession(patientId, sessionId) {
  // Summary/SOAP generation (session_intelligence) uses a 180s upstream
  // timeout for long transcripts, same as uploadTherapySessionTranscript
  // below — match it here so this doesn't time out client-side first.
  const res = await api.post(`/patients/${patientId}/therapy-sessions/${sessionId}/process`, null, {
    timeout: 180000,
  })
  return res.data
}

// Transcript-based sessions run summary + SOAP generation synchronously in
// one request (no audio to transcribe), which can take a while for a full
// 50-60 min session transcript — override the default 30s client timeout.
export async function uploadTherapySessionTranscript(patientId, transcriptText, sessionDate) {
  const res = await api.post(
    `/patients/${patientId}/therapy-sessions/transcript`,
    { transcript_text: transcriptText, session_date: sessionDate },
    { timeout: 180000 }
  )
  return res.data
}

// Same summary/SOAP pipeline as uploadTherapySessionTranscript, but for an
// uploaded PDF/DOCX/TXT transcript instead of pasted text — server extracts
// the text, so this also gets the longer timeout.
export async function uploadTherapySessionTranscriptFile(patientId, file, sessionDate, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('session_date', sessionDate)

  const res = await api.post(`/patients/${patientId}/therapy-sessions/transcript/file`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000,
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function listTherapySessions(patientId, { language, startDate, endDate } = {}) {
  const params = {}
  if (language) params.language = language
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await api.get(`/patients/${patientId}/therapy-sessions`, { params })
  return res.data
}

export async function getTherapySession(patientId, sessionId) {
  const res = await api.get(`/patients/${patientId}/therapy-sessions/${sessionId}`)
  return res.data
}

export async function updateSOAPNotes(patientId, sessionId, data) {
  const res = await api.patch(`/patients/${patientId}/therapy-sessions/${sessionId}/soap-notes`, data)
  return res.data
}

export async function deleteTherapySession(patientId, sessionId) {
  const res = await api.delete(`/patients/${patientId}/therapy-sessions/${sessionId}`)
  return res.data
}

export function getTherapySessionAudioUrl(patientId, sessionId) {
  const token = localStorage.getItem('mmpi_token')
  return `/api/patients/${patientId}/therapy-sessions/${sessionId}/audio?token=${token}`
}

export function getTranscriptDownloadUrl(patientId, sessionId, format = 'txt') {
  const token = localStorage.getItem('mmpi_token')
  return `/api/patients/${patientId}/therapy-sessions/${sessionId}/transcript/download?format=${format}&token=${token}`
}

// ─── Clinical Intelligence ─────────────────────────────────────────────────────

export async function getClinicalIntelligence(patientId) {
  const res = await api.get(`/patients/${patientId}/clinical-intelligence`)
  return res.data
}

export async function getClinicalIntelligenceStats(patientId) {
  const res = await api.get(`/patients/${patientId}/clinical-intelligence/stats`)
  return res.data
}

export async function processClinicalIntelligence(patientId, sourceType = null, sourceId = null) {
  const params = {}
  if (sourceType) params.source_type = sourceType
  if (sourceId) params.source_id = sourceId
  const res = await api.post(`/patients/${patientId}/clinical-intelligence/process`, null, { params })
  return res.data
}

export async function listPendingUpdates(patientId, status = 'pending') {
  const res = await api.get(`/patients/${patientId}/clinical-intelligence/updates`, { params: { status } })
  return res.data
}

export async function reviewUpdate(patientId, updateId, action, notes = null) {
  const res = await api.post(`/patients/${patientId}/clinical-intelligence/updates/${updateId}/review`, {
    action,
    notes,
  })
  return res.data
}

export async function bulkReviewUpdates(patientId, action, updateIds = null) {
  const params = { action }
  if (updateIds && updateIds.length > 0) {
    params.update_ids = updateIds
  }
  const res = await api.post(`/patients/${patientId}/clinical-intelligence/updates/bulk-review`, null, { params })
  return res.data
}

export async function listClinicalIntelligenceVersions(patientId) {
  const res = await api.get(`/patients/${patientId}/clinical-intelligence/versions`)
  return res.data
}

export async function getVersionSnapshot(patientId, versionId) {
  const res = await api.get(`/patients/${patientId}/clinical-intelligence/versions/${versionId}`)
  return res.data
}

export async function restoreVersion(patientId, versionId) {
  const res = await api.post(`/patients/${patientId}/clinical-intelligence/versions/${versionId}/restore`)
  return res.data
}

export async function getClinicalIntelligenceChat(patientId) {
  const res = await api.get(`/patients/${patientId}/clinical-intelligence/chat`)
  return res.data
}

export async function askClinicalIntelligenceChat(patientId, message) {
  const res = await api.post(`/patients/${patientId}/clinical-intelligence/chat`, { message })
  return res.data
}

// ─── Calendar & Scheduling ───────────────────────────────────────────────────

export async function listAppointments({ startDate, endDate, patientId, practitionerId, status, sessionType, sessionMode } = {}) {
  const params = {}
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  if (patientId) params.patient_id = patientId
  if (practitionerId) params.practitioner_id = practitionerId
  if (status) params.status = status
  if (sessionType) params.session_type = sessionType
  if (sessionMode) params.session_mode = sessionMode
  const res = await api.get('/appointments', { params })
  return res.data
}

export async function getCalendarEvents(startDate, endDate, practitionerId = null) {
  const params = { start_date: startDate, end_date: endDate }
  if (practitionerId) params.practitioner_id = practitionerId
  const res = await api.get('/appointments/calendar', { params })
  return res.data
}

export async function getTodaySchedule(date) {
  const res = await api.get('/appointments/today', { params: date ? { date } : {} })
  return res.data
}

export async function getUpcomingAppointments(limit = 10) {
  const res = await api.get('/appointments/upcoming', { params: { limit } })
  return res.data
}

export async function getAppointment(appointmentId) {
  const res = await api.get(`/appointments/${appointmentId}`)
  return res.data
}

export async function createAppointment(data, forPractitionerId = null) {
  const params = forPractitionerId ? { for_practitioner_id: forPractitionerId } : {}
  const res = await api.post('/appointments', data, { params })
  return res.data
}

export async function updateAppointment(appointmentId, data) {
  const res = await api.patch(`/appointments/${appointmentId}`, data)
  return res.data
}

export async function rescheduleAppointment(appointmentId, data) {
  const res = await api.post(`/appointments/${appointmentId}/reschedule`, data)
  return res.data
}

export async function cancelAppointment(appointmentId, reason = null) {
  const params = reason ? { reason } : {}
  const res = await api.post(`/appointments/${appointmentId}/cancel`, null, { params })
  return res.data
}

export async function generateMeetingLink(appointmentId) {
  const res = await api.post(`/appointments/${appointmentId}/meeting-link`)
  return res.data
}

export async function deleteAppointment(appointmentId) {
  const res = await api.delete(`/appointments/${appointmentId}`)
  return res.data
}

export async function getPatientAppointments(patientId, { status, upcomingOnly } = {}) {
  const params = {}
  if (status) params.status = status
  if (upcomingOnly) params.upcoming_only = upcomingOnly
  const res = await api.get(`/patients/${patientId}/appointments`, { params })
  return res.data
}

// ─── Availability ────────────────────────────────────────────────────────────

export async function getAvailability() {
  const res = await api.get('/availability')
  return res.data
}

export async function updateAvailability(data) {
  const res = await api.put('/availability', data)
  return res.data
}

export async function listUnavailableDates(startDate = null, endDate = null) {
  const params = {}
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await api.get('/unavailable-dates', { params })
  return res.data
}

export async function addUnavailableDate(data) {
  const res = await api.post('/unavailable-dates', data)
  return res.data
}

export async function removeUnavailableDate(dateId) {
  const res = await api.delete(`/unavailable-dates/${dateId}`)
  return res.data
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getPaymentDashboard() {
  const res = await api.get('/payments/dashboard')
  return res.data
}

export async function getRecentTransactions(limit = 10) {
  const res = await api.get('/payments/recent', { params: { limit } })
  return res.data
}

export async function listPayments({ status, practitionerId, patientId, startDate, endDate, paymentMethod, search, page, perPage } = {}) {
  const params = {}
  if (status) params.status = status
  if (practitionerId) params.practitioner_id = practitionerId
  if (patientId) params.patient_id = patientId
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  if (paymentMethod) params.payment_method = paymentMethod
  if (search) params.search = search
  if (page) params.page = page
  if (perPage) params.per_page = perPage
  const res = await api.get('/payments', { params })
  return res.data
}

export async function getPayment(paymentId) {
  const res = await api.get(`/payments/${paymentId}`)
  return res.data
}

export async function updatePayment(paymentId, data) {
  const res = await api.patch(`/payments/${paymentId}`, data)
  return res.data
}

export async function markPaymentPaid(paymentId, data) {
  const res = await api.post(`/payments/${paymentId}/mark-paid`, data)
  return res.data
}

export async function regeneratePaymentLink(paymentId) {
  const res = await api.post(`/payments/${paymentId}/regenerate-link`)
  return res.data
}

export async function sendPaymentReminder(paymentId) {
  const res = await api.post(`/payments/${paymentId}/send-reminder`)
  return res.data
}

export async function initiateRefund(paymentId, data) {
  const res = await api.post(`/payments/${paymentId}/refund/initiate`, data)
  return res.data
}

export async function completeRefund(paymentId, data = {}) {
  const res = await api.post(`/payments/${paymentId}/refund/complete`, data)
  return res.data
}

export async function getPaymentReceipt(paymentId) {
  const res = await api.get(`/payments/${paymentId}/receipt`)
  return res.data
}

export function getInvoicePdfUrl(paymentId) {
  const token = localStorage.getItem('mmpi_token')
  return `/api/payments/${paymentId}/invoice.pdf?token=${token}`
}

// Same PDF, served with Content-Disposition: inline so it can render in an
// <iframe> preview instead of forcing a download.
export function getInvoicePdfPreviewUrl(paymentId) {
  const token = localStorage.getItem('mmpi_token')
  return `/api/payments/${paymentId}/invoice.pdf?token=${token}&inline=true`
}

export async function getPatientPaymentHistory(patientId) {
  const res = await api.get(`/patients/${patientId}/payments`)
  return res.data
}

export async function createAppointmentWithPayment(data, forPractitionerId = null) {
  const params = forPractitionerId ? { for_practitioner_id: forPractitionerId } : {}
  const res = await api.post('/appointments/with-payment', data, { params })
  return res.data
}

export async function getAppointmentPayment(appointmentId) {
  const res = await api.get(`/appointments/${appointmentId}/payment`)
  return res.data
}

export async function createAppointmentPayment(appointmentId, data) {
  const res = await api.post(`/appointments/${appointmentId}/payment`, data)
  return res.data
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function listNotifications({ unreadOnly, limit } = {}) {
  const params = {}
  if (unreadOnly !== undefined) params.unread_only = unreadOnly
  if (limit) params.limit = limit
  const res = await api.get('/notifications', { params })
  return res.data
}

export async function markNotificationRead(notificationId) {
  const res = await api.post(`/notifications/${notificationId}/read`)
  return res.data
}

export async function markAllNotificationsRead() {
  const res = await api.post('/notifications/read-all')
  return res.data
}

// ─── Public Profile (No Auth Required) ────────────────────────────────────────

export async function getPublicProfile(slug) {
  const res = await api.get(`/public/profile/${slug}`)
  return res.data
}

export async function getPublicOnboarding(slug) {
  const res = await api.get(`/public/profile/${slug}/onboarding`)
  return res.data
}

export async function getPublicResources(slug) {
  const res = await api.get(`/public/profile/${slug}/resources`)
  return res.data
}

export async function getPublicTestimonials(slug) {
  const res = await api.get(`/public/profile/${slug}/testimonials`)
  return res.data
}

export async function getPublicAvailability(slug, days = 14) {
  const res = await api.get(`/public/profile/${slug}/availability`, { params: { days } })
  return res.data
}

export async function submitPublicIntake(slug, data) {
  const res = await api.post(`/public/profile/${slug}/intake`, data)
  return res.data
}

// ─── Practitioner Profile Management ──────────────────────────────────────────

export async function getMyProfile() {
  const res = await api.get('/profile/me')
  return res.data
}

export async function updateMyProfile(data) {
  const res = await api.put('/profile/me', data)
  return res.data
}

export async function uploadProfilePhoto(file, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  
  const res = await api.post('/profile/me/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function uploadCoverImage(file, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  
  const res = await api.post('/profile/me/cover', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function uploadClinicLogo(file, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  
  const res = await api.post('/profile/me/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function uploadSignatureImage(file, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await api.post('/profile/me/signature', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function deleteSignatureImage() {
  const res = await api.delete('/profile/me/signature')
  return res.data
}

export async function uploadStampImage(file, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await api.post('/profile/me/stamp', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function deleteStampImage() {
  const res = await api.delete('/profile/me/stamp')
  return res.data
}

// ─── Profile Resources ────────────────────────────────────────────────────────

export async function listMyResources() {
  const res = await api.get('/profile/me/resources')
  return res.data
}

export async function createResource(data) {
  const res = await api.post('/profile/me/resources', data)
  return res.data
}

export async function uploadResource(file, metadata, onProgress = null) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('resource_type', metadata.resource_type)
  formData.append('title', metadata.title)
  if (metadata.description) formData.append('description', metadata.description)
  if (metadata.is_public !== undefined) formData.append('is_public', metadata.is_public)
  if (metadata.display_order !== undefined) formData.append('display_order', metadata.display_order)
  
  const res = await api.post('/profile/me/resources/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
  })
  return res.data
}

export async function updateResource(resourceId, data) {
  const res = await api.put(`/profile/me/resources/${resourceId}`, data)
  return res.data
}

export async function deleteResource(resourceId) {
  const res = await api.delete(`/profile/me/resources/${resourceId}`)
  return res.data
}

// ─── Profile Testimonials ─────────────────────────────────────────────────────

export async function listMyTestimonials() {
  const res = await api.get('/profile/me/testimonials')
  return res.data
}

export async function createTestimonial(data) {
  const res = await api.post('/profile/me/testimonials', data)
  return res.data
}

export async function updateTestimonial(testimonialId, data) {
  const res = await api.put(`/profile/me/testimonials/${testimonialId}`, data)
  return res.data
}

export async function deleteTestimonial(testimonialId) {
  const res = await api.delete(`/profile/me/testimonials/${testimonialId}`)
  return res.data
}

// ─── Admin Profile Management ─────────────────────────────────────────────────

export async function listAllProfiles() {
  const res = await api.get('/admin/profiles')
  return res.data
}

export async function getProfileAdmin(profileId) {
  const res = await api.get(`/admin/profiles/${profileId}`)
  return res.data
}

export async function updateProfileAdmin(profileId, data) {
  const res = await api.put(`/admin/profiles/${profileId}`, data)
  return res.data
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 5 — Public Booking
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Public Booking (No Auth Required) ───────────────────────────────────────────

export async function getPublicBookingSlots(slug, startDate = null, days = 14) {
  const params = { days }
  if (startDate) params.start_date = startDate
  const res = await api.get(`/public/profile/${slug}/booking/slots`, { params })
  return res.data
}

export async function createPublicBooking(slug, data) {
  const res = await api.post(`/public/profile/${slug}/booking`, data)
  return res.data
}

export async function getPublicBookingStatus(bookingToken) {
  const res = await api.get(`/public/booking/${bookingToken}`)
  return res.data
}

export async function cancelPublicBooking(bookingToken, reason = null) {
  const params = reason ? { reason } : {}
  const res = await api.post(`/public/booking/${bookingToken}/cancel`, null, { params })
  return res.data
}

export async function getPublicBookingReceipt(bookingToken) {
  const res = await api.get(`/public/booking/${bookingToken}/receipt`)
  return res.data
}

// ─── Public Payment (No Auth Required) ───────────────────────────────────────────

export async function getPaymentDetails(paymentToken) {
  const res = await api.get(`/public/pay/${paymentToken}`)
  return res.data
}

export async function confirmPayment(paymentToken, paymentMethod = 'payment_link') {
  const res = await api.post(`/public/pay/${paymentToken}/confirm`, null, {
    params: { payment_method: paymentMethod }
  })
  return res.data
}

// ─── Therapist Booking Management ────────────────────────────────────────────────

export async function listBookingRequests(filters = {}) {
  const res = await api.get('/bookings', { params: filters })
  return res.data
}

export async function getBookingRequest(bookingId) {
  const res = await api.get(`/bookings/${bookingId}`)
  return res.data
}

export async function cancelBookingRequest(bookingId, reason = null) {
  const params = reason ? { reason } : {}
  const res = await api.post(`/bookings/${bookingId}/cancel`, null, { params })
  return res.data
}

export async function confirmBookingManually(bookingId, paymentMethod = 'cash') {
  const res = await api.post(`/bookings/${bookingId}/confirm-manual`, null, {
    params: { payment_method: paymentMethod }
  })
  return res.data
}

// ─── Inbox / Extended Notifications ──────────────────────────────────────────────

export async function getInboxNotifications(filters = {}) {
  const res = await api.get('/inbox', { params: filters })
  return res.data
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 6 — Practice Analytics & Reporting
// ═══════════════════════════════════════════════════════════════════════════════

export async function getAnalyticsOverview() {
  const res = await api.get('/analytics/overview')
  return res.data
}

export async function getPatientAnalytics({ period = 'this_year', startDate, endDate } = {}) {
  const params = { period }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await api.get('/analytics/patients', { params })
  return res.data
}

export async function getAppointmentAnalytics({ period = 'this_month', startDate, endDate } = {}) {
  const params = { period }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await api.get('/analytics/appointments', { params })
  return res.data
}

export async function getRevenueAnalytics({ period = 'this_year', startDate, endDate } = {}) {
  const params = { period }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await api.get('/analytics/revenue', { params })
  return res.data
}

export async function getAssessmentAnalytics({ period = 'this_year', startDate, endDate } = {}) {
  const params = { period }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await api.get('/analytics/assessments', { params })
  return res.data
}

export async function getPractitionerAnalytics({ period = 'this_month', startDate, endDate } = {}) {
  const params = { period }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await api.get('/analytics/practitioners', { params })
  return res.data
}

export async function getHomeDashboardSummary() {
  const res = await api.get('/analytics/home-summary')
  return res.data
}

// ─── Therapist Daily Notes (Dashboard) ───────────────────────────────────────

export async function getTherapistNote(date) {
  const params = date ? { date } : {}
  const res = await api.get('/therapist-notes', { params })
  return res.data
}

export async function saveTherapistNote({ date, content }) {
  const res = await api.put('/therapist-notes', { date, content })
  return res.data
}

export function getAnalyticsExportUrl(reportType, { period = 'this_month', startDate, endDate, format = 'csv' } = {}) {
  const token = localStorage.getItem('mmpi_token')
  const params = new URLSearchParams({
    report_type: reportType,
    period,
    format,
    token,
  })
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  return `/api/analytics/export?${params.toString()}`
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 7 — Settings & Configuration
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Settings Navigation ───────────────────────────────────────────────────────

export async function getSettingsNavigation() {
  const res = await api.get('/settings/navigation')
  return res.data
}

// ─── Clinic Settings (Admin Only) ──────────────────────────────────────────────

export async function getClinicSettings() {
  const res = await api.get('/settings/clinic')
  return res.data
}

export async function updateClinicSettings(data) {
  const res = await api.put('/settings/clinic', data)
  return res.data
}

export async function uploadClinicSettingsLogo(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/settings/clinic/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data
}

// ─── Appointment Configuration (Admin Only) ────────────────────────────────────

export async function getAppointmentConfig() {
  const res = await api.get('/settings/appointments')
  return res.data
}

export async function updateAppointmentConfig(data) {
  const res = await api.put('/settings/appointments', data)
  return res.data
}

// ─── Email Configuration (Admin Only) ──────────────────────────────────────────

export async function getEmailConfig() {
  const res = await api.get('/settings/email')
  return res.data
}

export async function updateEmailConfig(data) {
  const res = await api.put('/settings/email', data)
  return res.data
}

export async function testEmailConfig(recipientEmail) {
  const res = await api.post('/settings/email/test', { recipient_email: recipientEmail })
  return res.data
}

// ─── Payment Gateway Configuration (Admin Only) ────────────────────────────────

export async function getPaymentGatewayConfig() {
  const res = await api.get('/settings/payment-gateway')
  return res.data
}

export async function updatePaymentGatewayConfig(data) {
  const res = await api.put('/settings/payment-gateway', data)
  return res.data
}

export async function testPaymentGateway() {
  const res = await api.post('/settings/payment-gateway/test')
  return res.data
}

// ─── Branding (Admin Only) ─────────────────────────────────────────────────────

export async function getBranding() {
  const res = await api.get('/settings/branding')
  return res.data
}

export async function updateBranding(data) {
  const res = await api.put('/settings/branding', data)
  return res.data
}

export async function uploadBrandingLogo(file, logoType = 'logo') {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post(`/settings/branding/logo?logo_type=${logoType}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data
}

// ─── Security Settings (Admin Only) ────────────────────────────────────────────

export async function getSecuritySettings() {
  const res = await api.get('/settings/security')
  return res.data
}

export async function updateSecuritySettings(data) {
  const res = await api.put('/settings/security', data)
  return res.data
}

// ─── Roles & Permissions (Admin Only) ──────────────────────────────────────────

export async function getRoles() {
  const res = await api.get('/settings/roles')
  return res.data
}

export async function getRole(roleId) {
  const res = await api.get(`/settings/roles/${roleId}`)
  return res.data
}

export async function createRole(data) {
  const res = await api.post('/settings/roles', data)
  return res.data
}

export async function updateRole(roleId, data) {
  const res = await api.put(`/settings/roles/${roleId}`, data)
  return res.data
}

export async function deleteRole(roleId) {
  const res = await api.delete(`/settings/roles/${roleId}`)
  return res.data
}

// ─── Audit Logs (Admin Only) ───────────────────────────────────────────────────

export async function getAuditLogs(filters = {}) {
  const res = await api.get('/settings/audit-logs', { params: filters })
  return res.data
}

// ─── System Preferences (Admin Only) ───────────────────────────────────────────

export async function getSystemPreferences() {
  const res = await api.get('/settings/system')
  return res.data
}

export async function updateSystemPreferences(data) {
  const res = await api.put('/settings/system', data)
  return res.data
}

// ─── Calendar Integration (Practitioner) ───────────────────────────────────────

export async function getCalendarIntegration() {
  const res = await api.get('/settings/calendar-integration')
  return res.data
}

export async function updateCalendarIntegration(data) {
  const res = await api.put('/settings/calendar-integration', data)
  return res.data
}

export async function getGoogleAuthUrl(redirectUri) {
  const res = await api.get('/settings/calendar-integration/google/auth-url', {
    params: { redirect_uri: redirectUri }
  })
  return res.data
}

export async function connectGoogleCalendar(authorizationCode, redirectUri) {
  const res = await api.post('/settings/calendar-integration/google/connect', {
    authorization_code: authorizationCode,
    redirect_uri: redirectUri
  })
  return res.data
}

export async function disconnectGoogleCalendar() {
  const res = await api.post('/settings/calendar-integration/google/disconnect')
  return res.data
}

export async function syncCalendar() {
  const res = await api.post('/settings/calendar-integration/sync')
  return res.data
}

// ─── Notification Preferences (Practitioner) ───────────────────────────────────

export async function getNotificationPreferences() {
  const res = await api.get('/settings/notification-preferences')
  return res.data
}

export async function updateNotificationPreferences(data) {
  const res = await api.put('/settings/notification-preferences', data)
  return res.data
}

// ─── Active Sessions (Practitioner Security) ───────────────────────────────────

export async function getActiveSessions() {
  const res = await api.get('/settings/sessions')
  return res.data
}

export async function terminateSession(sessionId) {
  const res = await api.delete(`/settings/sessions/${sessionId}`)
  return res.data
}

export async function logoutAllSessions() {
  const res = await api.post('/settings/sessions/logout-all')
  return res.data
}

// ─── Data Management (Admin Only) ──────────────────────────────────────────────

export async function exportData(exportType, format = 'csv', includeArchived = false) {
  const res = await api.post('/settings/data/export', {
    export_type: exportType,
    format,
    include_archived: includeArchived
  })
  return res.data
}

export async function importData(file, importType) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post(`/settings/data/import?import_type=${importType}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data
}
