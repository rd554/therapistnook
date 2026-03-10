import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
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
    if (err.response?.status === 401 && window.location.pathname.startsWith('/dashboard')) {
      localStorage.removeItem('mmpi_token')
      localStorage.removeItem('mmpi_role')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// ─── Auth ───────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password })
  return res.data
}

export async function getMe() {
  const res = await api.get('/auth/me')
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
