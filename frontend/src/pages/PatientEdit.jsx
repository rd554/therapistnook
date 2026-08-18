import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save } from 'lucide-react'
import { getPatient, updatePatient } from '../api/client'
import {
  FormCard,
  FormField,
  FormGrid,
  FormActions,
  PageLoader,
  Alert,
  Button,
  PhoneInput,
} from '../components/ui'

export default function PatientEdit() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const baseUrl = '/patients'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    emergency_contact: '',
    referral_source: '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPatient(patientId)
        setForm({
          full_name: data.full_name,
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          phone: data.phone || '',
          email: data.email || '',
          emergency_contact: data.emergency_contact || '',
          referral_source: data.referral_source || '',
        })
      } catch (err) {
        setLoadError(err.response?.data?.detail || 'Failed to load patient')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patientId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updatePatient(patientId, {
        full_name: form.full_name,
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        phone: form.phone || null,
        email: form.email || null,
        emergency_contact: form.emergency_contact || null,
        referral_source: form.referral_source || null,
      })
      navigate(`${baseUrl}/${patientId}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update patient')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <PageLoader />
  }

  if (loadError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card w-full max-w-md text-center">
          <Alert variant="error" className="mb-4">{loadError}</Alert>
          <Button onClick={() => navigate(baseUrl)}>
            Back to Patients
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <FormCard
        title="Edit Patient"
        subtitle="Update patient information"
        onBack={() => navigate(`${baseUrl}/${patientId}`)}
      >
        {error && (
          <Alert variant="error" className="mb-6">{error}</Alert>
        )}
        <form onSubmit={handleSubmit}>
          <FormGrid cols={2}>
            <FormField label="Full Name" required>
              <input
                type="text"
                className="input-field"
                placeholder="John Doe"
                required
                value={form.full_name}
                onChange={(e) => setForm(p => ({ ...p, full_name: e.target.value }))}
              />
            </FormField>
            <FormField label="Date of Birth" required>
              <input
                type="date"
                className="input-field"
                required
                max={new Date().toISOString().split('T')[0]}
                value={form.date_of_birth}
                onChange={(e) => setForm(p => ({ ...p, date_of_birth: e.target.value }))}
              />
            </FormField>
            <FormField label="Gender" required>
              <select
                className="input-field"
                required
                value={form.gender}
                onChange={(e) => setForm(p => ({ ...p, gender: e.target.value }))}
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </FormField>
            <FormField label="Phone">
              <PhoneInput
                value={form.phone}
                onChange={(phone) => setForm(p => ({ ...p, phone }))}
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                className="input-field"
                placeholder="patient@example.com"
                value={form.email}
                onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
              />
            </FormField>
            <FormField label="Emergency Contact">
              <input
                type="text"
                className="input-field"
                placeholder="Name - Phone"
                value={form.emergency_contact}
                onChange={(e) => setForm(p => ({ ...p, emergency_contact: e.target.value }))}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Referral Source">
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Dr. Smith, Self-referral, Hospital"
                  value={form.referral_source}
                  onChange={(e) => setForm(p => ({ ...p, referral_source: e.target.value }))}
                />
              </FormField>
            </div>
          </FormGrid>

          <FormActions>
            <Button type="submit" isLoading={saving} leftIcon={Save}>
              Save Changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`${baseUrl}/${patientId}`)}
            >
              Cancel
            </Button>
          </FormActions>
        </form>
      </FormCard>
    </div>
  )
}
