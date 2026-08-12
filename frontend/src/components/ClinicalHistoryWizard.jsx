import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Save, Check, Loader2, Clock, AlertCircle,
  User, MessageSquare, History, Heart, Users, Briefcase, Home, Wine, Shield, FileText,
  ChevronDown,
} from 'lucide-react'
import { getClinicalHistory, updateClinicalHistory } from '../api/client'

const STEPS = [
  { value: 1, label: 'Basic Information', icon: User },
  { value: 2, label: 'Presenting Complaint', icon: MessageSquare },
  { value: 3, label: 'History of Present Illness', icon: History },
  { value: 4, label: 'Medical History', icon: Heart },
  { value: 5, label: 'Family History', icon: Users },
  { value: 6, label: 'Personal History', icon: Briefcase },
  { value: 7, label: 'Relationship History', icon: Home },
  { value: 8, label: 'Substance Use', icon: Wine },
  { value: 9, label: 'Trauma History', icon: AlertCircle },
  { value: 10, label: 'Risk Assessment', icon: Shield },
  { value: 11, label: 'Therapist Notes', icon: FileText },
]

export default function ClinicalHistoryWizard({ patientId, patient, onComplete }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastSaved, setLastSaved] = useState(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [data, setData] = useState({
    basic_info: {},
    presenting_complaint: {},
    history_present_illness: {},
    medical_history: {},
    family_history: {},
    personal_history: {},
    relationship_history: {},
    substance_use: {},
    trauma_history: {},
    risk_assessment: {},
    therapist_notes: '',
  })
  const [status, setStatus] = useState('not_started')
  const autoSaveTimeout = useRef(null)
  const hasChanges = useRef(false)

  useEffect(() => {
    loadData()
    return () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    }
  }, [patientId])

  const loadData = async () => {
    try {
      const ch = await getClinicalHistory(patientId)
      setData({
        basic_info: ch.basic_info || {},
        presenting_complaint: ch.presenting_complaint || {},
        history_present_illness: ch.history_present_illness || {},
        medical_history: ch.medical_history || {},
        family_history: ch.family_history || {},
        personal_history: ch.personal_history || {},
        relationship_history: ch.relationship_history || {},
        substance_use: ch.substance_use || {},
        trauma_history: ch.trauma_history || {},
        risk_assessment: ch.risk_assessment || {},
        therapist_notes: ch.therapist_notes || '',
      })
      setCurrentStep(ch.current_step || 1)
      setStatus(ch.status)
      setLastSaved(new Date(ch.updated_at))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load clinical history')
    } finally {
      setLoading(false)
    }
  }

  const saveData = useCallback(async (newData, newStep, newStatus) => {
    setSaving(true)
    try {
      const payload = {
        current_step: newStep,
        ...newData,
      }
      if (newStatus) payload.status = newStatus
      
      await updateClinicalHistory(patientId, payload)
      setLastSaved(new Date())
      hasChanges.current = false
      if (newStatus) setStatus(newStatus)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [patientId])

  const handleFieldChange = (section, field, value) => {
    setData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      }
    }))
    hasChanges.current = true
    
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    autoSaveTimeout.current = setTimeout(() => {
      saveData({ [section]: { ...data[section], [field]: value } }, currentStep, null)
    }, 2000)
  }

  const handleNotesChange = (value) => {
    setData(prev => ({ ...prev, therapist_notes: value }))
    hasChanges.current = true
    
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    autoSaveTimeout.current = setTimeout(() => {
      saveData({ therapist_notes: value }, currentStep, null)
    }, 2000)
  }

  const handleNext = async () => {
    if (currentStep < 11) {
      const nextStep = currentStep + 1
      setCurrentStep(nextStep)
      await saveData(data, nextStep, status === 'not_started' ? 'in_progress' : null)
    }
  }

  const handlePrev = async () => {
    if (currentStep > 1) {
      const prevStep = currentStep - 1
      setCurrentStep(prevStep)
      await saveData(data, prevStep, null)
    }
  }

  const handleSaveDraft = async () => {
    await saveData(data, currentStep, 'in_progress')
  }

  const handleComplete = async () => {
    await saveData(data, currentStep, 'completed')
    if (onComplete) onComplete()
  }

  const goToStep = async (step) => {
    if (step !== currentStep) {
      setCurrentStep(step)
      await saveData(data, step, status === 'not_started' ? 'in_progress' : null)
    }
  }

  const getDropdownOptions = () => {
    return STEPS.map(step => ({
      ...step,
      completed: step.value < currentStep || status === 'completed'
    }))
  }

  const formatRelativeTime = (date) => {
    if (!date) return ''
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !data.basic_info) {
    return (
      <div className="card text-center py-8">
        <AlertCircle className="mx-auto h-12 w-12 text-error-text" />
        <p className="mt-4 text-content-secondary">{error}</p>
      </div>
    )
  }

  const StepComponent = getStepComponent(currentStep)

  return (
    <div className="space-y-6 pt-2">
      {/* Header: Title | Dropdown | Save Draft */}
      <div className="flex items-center gap-4">
        <h2 className="text-section-title text-content-primary">Clinical History</h2>

        {/* Section Dropdown */}
        <div className="relative" style={{ maxWidth: '200px' }}>
          <select
            value={currentStep}
            onChange={(e) => goToStep(Number(e.target.value))}
            className="input-field-sm section-dropdown-cream w-full pr-8 font-medium text-content-primary appearance-none cursor-pointer truncate"
          >
            {getDropdownOptions().map(step => (
              <option key={step.value} value={step.value}>
                {step.completed ? '✓ ' : ''}{step.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted pointer-events-none" />
        </div>

        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="btn-secondary-sm ml-auto"
        >
          <Save className="h-3.5 w-3.5" />
          Save Draft
        </button>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="h-2 flex-1 max-w-xs bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
            />
          </div>
          <span className="text-sm text-content-secondary whitespace-nowrap">
            Step {currentStep} of {STEPS.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {saving ? (
            <span className="flex items-center gap-1.5 text-warning-text">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving...
            </span>
          ) : lastSaved && (
            <span className="flex items-center gap-1.5 text-content-muted">
              <Clock className="h-3.5 w-3.5" />
              Saved {formatRelativeTime(lastSaved)}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            status === 'completed' ? 'bg-success-bg text-success-text' :
            status === 'in_progress' ? 'bg-warning-bg text-warning-text' :
            'bg-slate-100 text-content-secondary'
          }`}>
            {status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : 'Not Started'}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-xl border border-error bg-error-bg p-3 text-sm text-error-text">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="card">
        <h3 className="text-card-title text-content-primary mb-6">
          {STEPS[currentStep - 1].label}
        </h3>
        <StepComponent
          data={data}
          patient={patient}
          onChange={handleFieldChange}
          onNotesChange={handleNotesChange}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-end gap-3">
        {currentStep > 1 && (
          <button
            onClick={handlePrev}
            disabled={saving}
            className="btn-secondary"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
        )}
        
        {currentStep === STEPS.length ? (
          <button
            onClick={handleComplete}
            disabled={saving}
            className="btn-primary"
          >
            <Check className="h-4 w-4" />
            Complete Intake
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={saving}
            className="btn-primary"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function getStepComponent(step) {
  switch (step) {
    case 1: return Step1BasicInfo
    case 2: return Step2PresentingComplaint
    case 3: return Step3HistoryPresentIllness
    case 4: return Step4MedicalHistory
    case 5: return Step5FamilyHistory
    case 6: return Step6PersonalHistory
    case 7: return Step7RelationshipHistory
    case 8: return Step8SubstanceUse
    case 9: return Step9TraumaHistory
    case 10: return Step10RiskAssessment
    case 11: return Step11TherapistNotes
    default: return Step1BasicInfo
  }
}

function FormField({ label, hint, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {hint && <p className="mb-1.5 text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  )
}

function Step1BasicInfo({ data, patient, onChange }) {
  const info = data.basic_info || {}
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Review and update basic patient information. Some fields are pre-filled from the patient record.</p>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="Full Name" required>
          <input
            type="text"
            className="input-field"
            value={info.full_name || ''}
            onChange={(e) => onChange('basic_info', 'full_name', e.target.value)}
            placeholder="Patient's full name"
          />
        </FormField>
        
        <FormField label="Date of Birth" required>
          <input
            type="date"
            className="input-field"
            value={info.date_of_birth || ''}
            onChange={(e) => onChange('basic_info', 'date_of_birth', e.target.value)}
          />
        </FormField>
        
        <FormField label="Age">
          <input
            type="number"
            className="input-field"
            value={info.age || ''}
            onChange={(e) => onChange('basic_info', 'age', e.target.value)}
            placeholder="Age"
          />
        </FormField>
        
        <FormField label="Gender" required>
          <select
            className="input-field"
            value={info.gender || ''}
            onChange={(e) => onChange('basic_info', 'gender', e.target.value)}
          >
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </FormField>
        
        <FormField label="Phone">
          <input
            type="tel"
            className="input-field"
            value={info.phone || ''}
            onChange={(e) => onChange('basic_info', 'phone', e.target.value)}
            placeholder="+91 98765 43210"
          />
        </FormField>
        
        <FormField label="Email">
          <input
            type="email"
            className="input-field"
            value={info.email || ''}
            onChange={(e) => onChange('basic_info', 'email', e.target.value)}
            placeholder="patient@example.com"
          />
        </FormField>
        
        <FormField label="Address" hint="Full residential address">
          <input
            type="text"
            className="input-field"
            value={info.address || ''}
            onChange={(e) => onChange('basic_info', 'address', e.target.value)}
            placeholder="Street, City, State, PIN"
          />
        </FormField>
        
        <FormField label="Emergency Contact" hint="Name and phone number">
          <input
            type="text"
            className="input-field"
            value={info.emergency_contact || ''}
            onChange={(e) => onChange('basic_info', 'emergency_contact', e.target.value)}
            placeholder="Name - Phone"
          />
        </FormField>
        
        <FormField label="Referral Source">
          <input
            type="text"
            className="input-field"
            value={info.referral_source || ''}
            onChange={(e) => onChange('basic_info', 'referral_source', e.target.value)}
            placeholder="e.g., Dr. Smith, Self-referral"
          />
        </FormField>
      </div>
    </div>
  )
}

function Step2PresentingComplaint({ data, onChange }) {
  const complaint = data.presenting_complaint || {}
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document the patient's primary concerns and symptoms.</p>
      
      <div className="space-y-4">
        <FormField label="Chief Complaint" required hint="What brings the patient here? Use their own words when possible.">
          <textarea
            className="input-field min-h-[100px]"
            value={complaint.chief_complaint || ''}
            onChange={(e) => onChange('presenting_complaint', 'chief_complaint', e.target.value)}
            placeholder="e.g., 'I've been feeling really down and can't seem to enjoy anything anymore...'"
          />
        </FormField>
        
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Duration" hint="How long have symptoms been present?">
            <div className="flex gap-2">
              <input
                type="number"
                className="input-field w-20"
                value={complaint.duration_value || ''}
                onChange={(e) => onChange('presenting_complaint', 'duration_value', e.target.value)}
                placeholder="0"
              />
              <select
                className="input-field flex-1"
                value={complaint.duration_unit || ''}
                onChange={(e) => onChange('presenting_complaint', 'duration_unit', e.target.value)}
              >
                <option value="">Unit</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
            </div>
          </FormField>
          
          <FormField label="Severity" hint="1 (mild) to 10 (severe)">
            <input
              type="range"
              min="1"
              max="10"
              className="w-full"
              value={complaint.severity || 5}
              onChange={(e) => onChange('presenting_complaint', 'severity', parseInt(e.target.value))}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Mild (1)</span>
              <span className="font-semibold text-primary-600">{complaint.severity || 5}</span>
              <span>Severe (10)</span>
            </div>
          </FormField>
          
          <FormField label="Onset Pattern">
            <select
              className="input-field"
              value={complaint.onset_pattern || ''}
              onChange={(e) => onChange('presenting_complaint', 'onset_pattern', e.target.value)}
            >
              <option value="">Select pattern</option>
              <option value="sudden">Sudden onset</option>
              <option value="gradual">Gradual onset</option>
              <option value="episodic">Episodic</option>
              <option value="chronic">Chronic</option>
            </select>
          </FormField>
        </div>
        
        <FormField label="Trigger" hint="What seems to trigger or worsen the symptoms?">
          <textarea
            className="input-field min-h-[80px]"
            value={complaint.trigger || ''}
            onChange={(e) => onChange('presenting_complaint', 'trigger', e.target.value)}
            placeholder="e.g., Work stress, relationship conflicts, specific events..."
          />
        </FormField>
        
        <FormField label="Functional Impact" hint="How are symptoms affecting daily life, work, relationships?">
          <textarea
            className="input-field min-h-[80px]"
            value={complaint.functional_impact || ''}
            onChange={(e) => onChange('presenting_complaint', 'functional_impact', e.target.value)}
            placeholder="e.g., Unable to concentrate at work, withdrawing from friends, sleep disturbances..."
          />
        </FormField>
      </div>
    </div>
  )
}

function Step3HistoryPresentIllness({ data, onChange }) {
  const history = data.history_present_illness || {}
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document the course and progression of the current illness.</p>
      
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Onset Date" hint="When did symptoms first appear?">
            <input
              type="date"
              className="input-field"
              value={history.onset_date || ''}
              onChange={(e) => onChange('history_present_illness', 'onset_date', e.target.value)}
            />
          </FormField>
          
          <FormField label="Previous Episodes" hint="Has the patient experienced this before?">
            <select
              className="input-field"
              value={history.previous_episodes || ''}
              onChange={(e) => onChange('history_present_illness', 'previous_episodes', e.target.value)}
            >
              <option value="">Select</option>
              <option value="none">No previous episodes</option>
              <option value="one">One previous episode</option>
              <option value="few">Few episodes (2-5)</option>
              <option value="multiple">Multiple episodes (5+)</option>
              <option value="chronic">Chronic/ongoing</option>
            </select>
          </FormField>
        </div>
        
        <FormField label="Course" hint="How have symptoms progressed over time?">
          <textarea
            className="input-field min-h-[80px]"
            value={history.course || ''}
            onChange={(e) => onChange('history_present_illness', 'course', e.target.value)}
            placeholder="e.g., Symptoms started mildly and have progressively worsened over the past 6 months..."
          />
        </FormField>
        
        <FormField label="Previous Diagnoses" hint="Any previous mental health diagnoses">
          <textarea
            className="input-field min-h-[80px]"
            value={history.previous_diagnoses || ''}
            onChange={(e) => onChange('history_present_illness', 'previous_diagnoses', e.target.value)}
            placeholder="e.g., Major Depressive Disorder diagnosed in 2020, Generalized Anxiety..."
          />
        </FormField>
        
        <FormField label="Previous Treatment" hint="Past mental health treatments">
          <textarea
            className="input-field min-h-[80px]"
            value={history.previous_treatment || ''}
            onChange={(e) => onChange('history_present_illness', 'previous_treatment', e.target.value)}
            placeholder="e.g., CBT therapy for 6 months in 2021, tried Sertraline 50mg..."
          />
        </FormField>
        
        <FormField label="Hospitalisations" hint="Any psychiatric hospitalisations">
          <textarea
            className="input-field min-h-[60px]"
            value={history.hospitalisations || ''}
            onChange={(e) => onChange('history_present_illness', 'hospitalisations', e.target.value)}
            placeholder="e.g., None, or describe with dates and reasons..."
          />
        </FormField>
      </div>
    </div>
  )
}

function Step4MedicalHistory({ data, onChange }) {
  const medical = data.medical_history || {}
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document relevant medical conditions and medications.</p>
      
      <div className="space-y-4">
        <FormField label="Medical Conditions" hint="Current and past medical conditions">
          <textarea
            className="input-field min-h-[80px]"
            value={medical.medical_conditions || ''}
            onChange={(e) => onChange('medical_history', 'medical_conditions', e.target.value)}
            placeholder="e.g., Hypertension, Diabetes Type 2, Thyroid disorder..."
          />
        </FormField>
        
        <FormField label="Neurological Conditions" hint="Any neurological diagnoses or symptoms">
          <textarea
            className="input-field min-h-[80px]"
            value={medical.neurological_conditions || ''}
            onChange={(e) => onChange('medical_history', 'neurological_conditions', e.target.value)}
            placeholder="e.g., Migraines, Epilepsy, Head injuries, Concussions..."
          />
        </FormField>
        
        <FormField label="Current Medications" hint="All current medications with dosages">
          <textarea
            className="input-field min-h-[80px]"
            value={medical.current_medications || ''}
            onChange={(e) => onChange('medical_history', 'current_medications', e.target.value)}
            placeholder="e.g., Metformin 500mg twice daily, Amlodipine 5mg daily..."
          />
        </FormField>
        
        <FormField label="Previous Medications" hint="Relevant past medications, especially psychiatric">
          <textarea
            className="input-field min-h-[80px]"
            value={medical.previous_medications || ''}
            onChange={(e) => onChange('medical_history', 'previous_medications', e.target.value)}
            placeholder="e.g., Tried Escitalopram 10mg (discontinued due to side effects)..."
          />
        </FormField>
        
        <FormField label="Allergies" hint="Drug allergies and other allergies">
          <textarea
            className="input-field min-h-[60px]"
            value={medical.allergies || ''}
            onChange={(e) => onChange('medical_history', 'allergies', e.target.value)}
            placeholder="e.g., Penicillin (rash), Sulfa drugs, NKDA (No Known Drug Allergies)..."
          />
        </FormField>
      </div>
    </div>
  )
}

function Step5FamilyHistory({ data, onChange }) {
  const family = data.family_history || {}
  const conditions = ['depression', 'anxiety', 'bipolar', 'schizophrenia', 'suicide', 'substance_abuse']
  const conditionLabels = {
    depression: 'Depression',
    anxiety: 'Anxiety',
    bipolar: 'Bipolar Disorder',
    schizophrenia: 'Schizophrenia',
    suicide: 'Suicide/Attempts',
    substance_abuse: 'Substance Abuse',
  }
  const relations = ['mother', 'father', 'siblings', 'grandparents', 'other']
  
  const toggleCondition = (relation, condition) => {
    const current = family[relation]?.conditions || []
    const updated = current.includes(condition)
      ? current.filter(c => c !== condition)
      : [...current, condition]
    onChange('family_history', relation, { ...family[relation], conditions: updated })
  }
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document family psychiatric history and relationship quality.</p>
      
      <div className="space-y-6">
        {relations.map(relation => (
          <div key={relation} className="rounded-lg border border-gray-200 p-4">
            <h4 className="mb-3 font-medium text-gray-800 capitalize">
              {relation === 'other' ? 'Other Relatives' : relation}
            </h4>
            
            <div className="mb-3">
              <p className="mb-2 text-sm text-gray-600">History of:</p>
              <div className="flex flex-wrap gap-2">
                {conditions.map(condition => {
                  const isSelected = (family[relation]?.conditions || []).includes(condition)
                  return (
                    <button
                      key={condition}
                      type="button"
                      onClick={() => toggleCondition(relation, condition)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {conditionLabels[condition]}
                    </button>
                  )
                })}
              </div>
            </div>
            
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Relationship Quality</label>
                <select
                  className="input-field text-sm"
                  value={family[relation]?.quality || ''}
                  onChange={(e) => onChange('family_history', relation, { ...family[relation], quality: e.target.value })}
                >
                  <option value="">Select</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                  <option value="estranged">Estranged</option>
                  <option value="deceased">Deceased</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  value={family[relation]?.notes || ''}
                  onChange={(e) => onChange('family_history', relation, { ...family[relation], notes: e.target.value })}
                  placeholder="Additional details..."
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step6PersonalHistory({ data, onChange }) {
  const personal = data.personal_history || {}
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document developmental and life history.</p>
      
      <div className="space-y-4">
        <FormField label="Childhood" hint="Early developmental history, family environment">
          <textarea
            className="input-field min-h-[80px]"
            value={personal.childhood || ''}
            onChange={(e) => onChange('personal_history', 'childhood', e.target.value)}
            placeholder="e.g., Raised in nuclear family, parents divorced at age 10, no significant developmental delays..."
          />
        </FormField>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Education" hint="Educational background">
            <input
              type="text"
              className="input-field"
              value={personal.education || ''}
              onChange={(e) => onChange('personal_history', 'education', e.target.value)}
              placeholder="e.g., Bachelor's in Engineering"
            />
          </FormField>
          
          <FormField label="Occupation">
            <input
              type="text"
              className="input-field"
              value={personal.occupation || ''}
              onChange={(e) => onChange('personal_history', 'occupation', e.target.value)}
              placeholder="e.g., Software Engineer"
            />
          </FormField>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Employment Status">
            <select
              className="input-field"
              value={personal.employment_status || ''}
              onChange={(e) => onChange('personal_history', 'employment_status', e.target.value)}
            >
              <option value="">Select</option>
              <option value="employed_full">Employed (Full-time)</option>
              <option value="employed_part">Employed (Part-time)</option>
              <option value="self_employed">Self-employed</option>
              <option value="unemployed">Unemployed</option>
              <option value="student">Student</option>
              <option value="retired">Retired</option>
              <option value="homemaker">Homemaker</option>
              <option value="disabled">Disabled/Unable to work</option>
            </select>
          </FormField>
          
          <FormField label="Financial Situation">
            <select
              className="input-field"
              value={personal.financial_situation || ''}
              onChange={(e) => onChange('personal_history', 'financial_situation', e.target.value)}
            >
              <option value="">Select</option>
              <option value="stable">Stable</option>
              <option value="comfortable">Comfortable</option>
              <option value="struggling">Struggling</option>
              <option value="severe_stress">Severe financial stress</option>
              <option value="dependent">Financially dependent</option>
            </select>
          </FormField>
        </div>
        
        <FormField label="Living Arrangement" hint="Current living situation">
          <textarea
            className="input-field min-h-[60px]"
            value={personal.living_arrangement || ''}
            onChange={(e) => onChange('personal_history', 'living_arrangement', e.target.value)}
            placeholder="e.g., Lives alone in rented apartment, lives with spouse and 2 children..."
          />
        </FormField>
      </div>
    </div>
  )
}

function Step7RelationshipHistory({ data, onChange }) {
  const relationship = data.relationship_history || {}
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document relationship patterns and social support.</p>
      
      <div className="space-y-4">
        <FormField label="Marital Status">
          <select
            className="input-field"
            value={relationship.marital_status || ''}
            onChange={(e) => onChange('relationship_history', 'marital_status', e.target.value)}
          >
            <option value="">Select</option>
            <option value="single">Single (never married)</option>
            <option value="married">Married</option>
            <option value="partnered">In a relationship/Partnered</option>
            <option value="separated">Separated</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
          </select>
        </FormField>
        
        <FormField label="Romantic Relationships" hint="History and quality of romantic relationships">
          <textarea
            className="input-field min-h-[80px]"
            value={relationship.romantic_relationships || ''}
            onChange={(e) => onChange('relationship_history', 'romantic_relationships', e.target.value)}
            placeholder="e.g., Married for 10 years, describes relationship as supportive. History of one prior long-term relationship..."
          />
        </FormField>
        
        <FormField label="Family Relationships" hint="Quality of current family relationships">
          <textarea
            className="input-field min-h-[80px]"
            value={relationship.family_relationships || ''}
            onChange={(e) => onChange('relationship_history', 'family_relationships', e.target.value)}
            placeholder="e.g., Close with mother, strained relationship with father since childhood..."
          />
        </FormField>
        
        <FormField label="Social Support" hint="Friends, community, support network">
          <textarea
            className="input-field min-h-[80px]"
            value={relationship.social_support || ''}
            onChange={(e) => onChange('relationship_history', 'social_support', e.target.value)}
            placeholder="e.g., Has 2-3 close friends, active in local community group, feels isolated at times..."
          />
        </FormField>
      </div>
    </div>
  )
}

function Step8SubstanceUse({ data, onChange }) {
  const substance = data.substance_use || {}
  const substances = ['alcohol', 'smoking', 'tobacco', 'drugs']
  const substanceLabels = {
    alcohol: 'Alcohol',
    smoking: 'Smoking',
    tobacco: 'Tobacco (non-smoking)',
    drugs: 'Recreational Drugs',
  }
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document current and past substance use patterns.</p>
      
      <div className="space-y-4">
        {substances.map(sub => (
          <div key={sub} className="rounded-lg border border-gray-200 p-4">
            <h4 className="mb-3 font-medium text-gray-800">{substanceLabels[sub]}</h4>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Use</label>
                <select
                  className="input-field text-sm"
                  value={substance[sub]?.use || ''}
                  onChange={(e) => onChange('substance_use', sub, { ...substance[sub], use: e.target.value })}
                >
                  <option value="">Select</option>
                  <option value="never">Never</option>
                  <option value="past">Past use only</option>
                  <option value="current">Current use</option>
                </select>
              </div>
              
              {(substance[sub]?.use === 'current' || substance[sub]?.use === 'past') && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Frequency</label>
                    <select
                      className="input-field text-sm"
                      value={substance[sub]?.frequency || ''}
                      onChange={(e) => onChange('substance_use', sub, { ...substance[sub], frequency: e.target.value })}
                    >
                      <option value="">Select</option>
                      <option value="rarely">Rarely</option>
                      <option value="occasionally">Occasionally</option>
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                      <option value="multiple_daily">Multiple times daily</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Duration</label>
                    <input
                      type="text"
                      className="input-field text-sm"
                      value={substance[sub]?.duration || ''}
                      onChange={(e) => onChange('substance_use', sub, { ...substance[sub], duration: e.target.value })}
                      placeholder="e.g., 5 years"
                    />
                  </div>
                  
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Previous Treatment</label>
                    <select
                      className="input-field text-sm"
                      value={substance[sub]?.treatment || ''}
                      onChange={(e) => onChange('substance_use', sub, { ...substance[sub], treatment: e.target.value })}
                    >
                      <option value="">Select</option>
                      <option value="none">None</option>
                      <option value="attempted">Attempted to quit</option>
                      <option value="treatment">Formal treatment</option>
                      <option value="ongoing">Currently in treatment</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            
            {sub === 'drugs' && (substance[sub]?.use === 'current' || substance[sub]?.use === 'past') && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-gray-600">Substances Used</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  value={substance[sub]?.substances || ''}
                  onChange={(e) => onChange('substance_use', sub, { ...substance[sub], substances: e.target.value })}
                  placeholder="e.g., Cannabis, Cocaine..."
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Step9TraumaHistory({ data, onChange }) {
  const trauma = data.trauma_history || {}
  const traumaTypes = [
    { key: 'physical_abuse', label: 'Physical Abuse' },
    { key: 'sexual_abuse', label: 'Sexual Abuse' },
    { key: 'emotional_abuse', label: 'Emotional Abuse' },
    { key: 'neglect', label: 'Neglect' },
    { key: 'domestic_violence', label: 'Domestic Violence' },
    { key: 'accidents', label: 'Accidents/Injuries' },
    { key: 'bereavement', label: 'Bereavement/Loss' },
    { key: 'bullying', label: 'Bullying' },
    { key: 'medical_trauma', label: 'Medical Trauma' },
    { key: 'natural_disaster', label: 'Natural Disaster' },
  ]
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document significant traumatic experiences. Handle with sensitivity.</p>
      
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <strong>Note:</strong> This section should be approached with sensitivity. Allow the patient to share at their own pace.
      </div>
      
      <FormField label="Major Life Events" hint="Significant life events that may have impacted mental health">
        <textarea
          className="input-field min-h-[80px]"
          value={trauma.major_life_events || ''}
          onChange={(e) => onChange('trauma_history', 'major_life_events', e.target.value)}
          placeholder="e.g., Parent's divorce at age 8, relocation to new city, job loss..."
        />
      </FormField>
      
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Trauma Types (check all that apply):</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {traumaTypes.map(({ key, label }) => (
            <div key={key} className="rounded-lg border border-gray-200 p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={trauma[key]?.present || false}
                  onChange={(e) => onChange('trauma_history', key, { ...trauma[key], present: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </label>
              
              {trauma[key]?.present && (
                <textarea
                  className="input-field mt-2 text-sm min-h-[50px]"
                  value={trauma[key]?.details || ''}
                  onChange={(e) => onChange('trauma_history', key, { ...trauma[key], details: e.target.value })}
                  placeholder="Details (when, context, impact)..."
                />
              )}
            </div>
          ))}
        </div>
      </div>
      
      <FormField label="Other Trauma" hint="Any other traumatic experiences not listed above">
        <textarea
          className="input-field min-h-[80px]"
          value={trauma.other || ''}
          onChange={(e) => onChange('trauma_history', 'other', e.target.value)}
          placeholder="Describe any other significant traumatic experiences..."
        />
      </FormField>
    </div>
  )
}

function Step10RiskAssessment({ data, onChange }) {
  const risk = data.risk_assessment || {}
  const riskAreas = [
    { key: 'suicide', label: 'Suicide Risk', description: 'Suicidal ideation, plans, or intent' },
    { key: 'self_harm', label: 'Self-Harm Risk', description: 'Non-suicidal self-injury' },
    { key: 'violence', label: 'Violence Risk', description: 'Risk of harm to others' },
    { key: 'abuse', label: 'Abuse', description: 'Current or recent abuse (victim or perpetrator)' },
    { key: 'neglect', label: 'Neglect', description: 'Self-neglect or neglect of dependents' },
  ]
  
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Document current risk factors and safety concerns.</p>
      
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <strong>Important:</strong> If immediate risk is identified, follow appropriate safety protocols and crisis intervention procedures.
      </div>
      
      <div className="space-y-4">
        {riskAreas.map(({ key, label, description }) => (
          <div key={key} className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h4 className="font-medium text-gray-800">{label}</h4>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Present</label>
                <select
                  className="input-field text-sm"
                  value={risk[key]?.present || ''}
                  onChange={(e) => onChange('risk_assessment', key, { ...risk[key], present: e.target.value })}
                >
                  <option value="">Select</option>
                  <option value="no">No</option>
                  <option value="past">Past only</option>
                  <option value="current">Current</option>
                </select>
              </div>
              
              {(risk[key]?.present === 'current' || risk[key]?.present === 'past') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Risk Level</label>
                  <select
                    className="input-field text-sm"
                    value={risk[key]?.level || ''}
                    onChange={(e) => onChange('risk_assessment', key, { ...risk[key], level: e.target.value })}
                  >
                    <option value="">Select</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              )}
              
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
                <textarea
                  className="input-field text-sm min-h-[60px]"
                  value={risk[key]?.notes || ''}
                  onChange={(e) => onChange('risk_assessment', key, { ...risk[key], notes: e.target.value })}
                  placeholder="Additional details, safety plan, protective factors..."
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step11TherapistNotes({ data, onNotesChange }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Add any additional observations, impressions, or notes that don't fit in other sections.</p>
      
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <strong>Suggestions:</strong> Clinical impressions, mental status observations, rapport, treatment considerations, diagnostic impressions, recommended assessments.
      </div>
      
      <textarea
        className="input-field min-h-[300px]"
        value={data.therapist_notes || ''}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Enter your clinical observations and notes here...

For example:
- Mental Status: Patient presents as well-groomed, cooperative, with good eye contact...
- Clinical Impression: Patient appears to meet criteria for...
- Treatment Considerations: Recommend starting with...
- Additional Assessments Needed: Consider MMPI-2 for personality assessment..."
      />
      
      <p className="text-xs text-gray-400">
        These notes are for clinical documentation purposes and will be part of the patient's record.
      </p>
    </div>
  )
}
