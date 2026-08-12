import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  User, Camera, Save, Globe, Eye, EyeOff, Plus, Trash2, GripVertical,
  ExternalLink, Upload, X, Check, AlertCircle, FileText, Star, Loader2, Instagram
} from 'lucide-react'
import {
  getMyProfile, updateMyProfile, uploadProfilePhoto, uploadCoverImage,
  listMyResources, createResource, uploadResource,
  updateResource, deleteResource, listMyTestimonials, createTestimonial,
  updateTestimonial, deleteTestimonial
} from '../api/client'
import { getOnboardingDefaults } from '../constants/onboardingDefaults'

const THERAPY_APPROACHES = [
  { value: 'cognitive_behavioral', label: 'Cognitive Behavioral Therapy (CBT)' },
  { value: 'psychodynamic', label: 'Psychodynamic Therapy' },
  { value: 'humanistic', label: 'Humanistic Therapy' },
  { value: 'integrative', label: 'Integrative Therapy' },
  { value: 'mindfulness_based', label: 'Mindfulness-Based Therapy' },
  { value: 'dialectical_behavior', label: 'Dialectical Behavior Therapy (DBT)' },
  { value: 'solution_focused', label: 'Solution-Focused Therapy' },
  { value: 'narrative', label: 'Narrative Therapy' },
  { value: 'family_systems', label: 'Family Systems Therapy' },
  { value: 'trauma_informed', label: 'Trauma-Informed Therapy' },
  { value: 'acceptance_commitment', label: 'Acceptance and Commitment Therapy (ACT)' },
  { value: 'interpersonal', label: 'Interpersonal Therapy' },
  { value: 'gestalt', label: 'Gestalt Therapy' },
  { value: 'emdr', label: 'EMDR' },
  { value: 'art_therapy', label: 'Art Therapy' },
  { value: 'play_therapy', label: 'Play Therapy' },
]

const SPECIALIZATIONS = [
  { value: 'anxiety', label: 'Anxiety' },
  { value: 'depression', label: 'Depression' },
  { value: 'trauma_ptsd', label: 'Trauma & PTSD' },
  { value: 'relationship_issues', label: 'Relationship Issues' },
  { value: 'grief_loss', label: 'Grief & Loss' },
  { value: 'stress_management', label: 'Stress Management' },
  { value: 'self_esteem', label: 'Self-Esteem' },
  { value: 'anger_management', label: 'Anger Management' },
  { value: 'ocd', label: 'OCD' },
  { value: 'addiction', label: 'Addiction' },
  { value: 'eating_disorders', label: 'Eating Disorders' },
  { value: 'bipolar_disorder', label: 'Bipolar Disorder' },
  { value: 'child_adolescent', label: 'Child & Adolescent' },
  { value: 'couples_therapy', label: 'Couples Therapy' },
  { value: 'family_therapy', label: 'Family Therapy' },
  { value: 'lgbtq', label: 'LGBTQ+' },
  { value: 'life_transitions', label: 'Life Transitions' },
  { value: 'career_counseling', label: 'Career Counseling' },
]

const RESOURCE_TYPES = [
  { value: 'consent_form', label: 'Consent Form' },
  { value: 'therapy_guidelines', label: 'Therapy Guidelines' },
  { value: 'cancellation_policy', label: 'Cancellation Policy' },
  { value: 'privacy_policy', label: 'Privacy Policy' },
  { value: 'faq', label: 'FAQ' },
  { value: 'emergency_info', label: 'Emergency Information' },
  { value: 'welcome_packet', label: 'Welcome Packet' },
  { value: 'intake_instructions', label: 'Intake Instructions' },
  { value: 'other', label: 'Other' },
]

const LANGUAGES = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi',
  'Gujarati', 'Bengali', 'Punjabi', 'Urdu', 'Spanish', 'French', 'German',
]

export default function ProfileSettings({ onProfileSetupComplete } = {}) {
  const [profile, setProfile] = useState(null)
  const [resources, setResources] = useState([])
  const [testimonials, setTestimonials] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [activeTab, setActiveTab] = useState('basic')
  
  const photoInputRef = useRef(null)
  const coverInputRef = useRef(null)
  const resourceFileInputRef = useRef(null)

  // Form state
  const [formData, setFormData] = useState({})
  const [newQualification, setNewQualification] = useState({ degree: '', institution: '', year: '' })
  const [newCertification, setNewCertification] = useState({ name: '', issuer: '', year: '' })
  const [newLanguage, setNewLanguage] = useState({ language: '', proficiency: 'fluent' })
  const [newMembership, setNewMembership] = useState({ organization: '', membership_id: '' })
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' })
  const [newExpertise, setNewExpertise] = useState('')
  
  // Resource modal state
  const [showResourceModal, setShowResourceModal] = useState(false)
  const [resourceForm, setResourceForm] = useState({ resource_type: 'consent_form', title: '', description: '', content: '' })
  const [resourceFile, setResourceFile] = useState(null)
  
  // Testimonial modal state
  const [showTestimonialModal, setShowTestimonialModal] = useState(false)
  const [editingTestimonial, setEditingTestimonial] = useState(null)
  const [testimonialForm, setTestimonialForm] = useState({ display_name: '', feedback: '', rating: null })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [profileData, resourcesData, testimonialsData] = await Promise.all([
        getMyProfile(),
        listMyResources().catch(() => []),
        listMyTestimonials().catch(() => []),
      ])
      setProfile(profileData)
      // Pre-fill onboarding copy with sensible defaults so practitioners aren't starting from a
      // blank page — they can edit or replace any of it before saving.
      const onboardingDefaults = getOnboardingDefaults(profileData.display_name)
      setFormData({
        ...profileData,
        consultation_fee: profileData.consultation_fee ? profileData.consultation_fee / 100 : '',
        qualifications: profileData.qualifications || [],
        certifications: profileData.certifications || [],
        languages: profileData.languages || [],
        professional_memberships: profileData.professional_memberships || [],
        specializations: profileData.specializations || [],
        therapy_approaches: profileData.therapy_approaches || [],
        areas_of_expertise: profileData.areas_of_expertise || [],
        welcome_message: profileData.welcome_message || onboardingDefaults.welcome_message,
        what_to_expect: profileData.what_to_expect || onboardingDefaults.what_to_expect,
        preparation_guidelines: profileData.preparation_guidelines || onboardingDefaults.preparation_guidelines,
        emergency_disclaimer: profileData.emergency_disclaimer || onboardingDefaults.emergency_disclaimer,
        faq_content: profileData.faq_content?.length > 0 ? profileData.faq_content : onboardingDefaults.faq_content,
      })
      setResources(resourcesData)
      setTestimonials(testimonialsData)
    } catch (err) {
      console.error('Failed to load profile:', err)
      setError('Failed to load profile settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      
      const updateData = {
        is_public: formData.is_public,
        slug: formData.slug,
        display_name: formData.display_name,
        title: formData.title,
        tagline: formData.tagline,
        bio: formData.bio,
        qualifications: formData.qualifications,
        certifications: formData.certifications,
        license_number: formData.license_number,
        professional_memberships: formData.professional_memberships,
        years_of_experience: formData.years_of_experience ? parseInt(formData.years_of_experience) : null,
        areas_of_expertise: formData.areas_of_expertise,
        specializations: formData.specializations,
        therapy_approaches: formData.therapy_approaches,
        languages: formData.languages,
        consultation_fee: formData.consultation_fee ? Math.round(parseFloat(formData.consultation_fee) * 100) : null,
        fee_notes: formData.fee_notes,
        public_email: formData.public_email,
        public_phone: formData.public_phone,
        clinic_address: formData.clinic_address,
        instagram_handle: formData.instagram_handle,
        welcome_message: formData.welcome_message,
        what_to_expect: formData.what_to_expect,
        how_therapy_works: formData.how_therapy_works,
        preparation_guidelines: formData.preparation_guidelines,
        faq_content: formData.faq_content,
        emergency_disclaimer: formData.emergency_disclaimer,
        consent_info: formData.consent_info,
      }
      
      const updated = await updateMyProfile(updateData)
      setProfile(updated)
      setSuccess('Profile saved successfully')
      setTimeout(() => setSuccess(null), 3000)

      // Mirrors the backend's completion check (models.py: profile_setup_complete)
      // so the sidebar/dashboard unlock immediately, without needing a fresh login.
      const mandatoryFilled = [formData.slug, formData.title, formData.display_name, formData.tagline, formData.bio]
        .every(v => v && v.trim())
      if (mandatoryFilled) {
        onProfileSetupComplete?.()
      }
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError(err.response?.data?.detail || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const result = await uploadProfilePhoto(file)
      setFormData(prev => ({ ...prev, profile_photo_url: result.url }))
      setSuccess('Photo uploaded')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to upload photo')
    }
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const result = await uploadCoverImage(file)
      setFormData(prev => ({ ...prev, cover_image_url: result.url }))
      setSuccess('Cover image uploaded')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to upload cover image')
    }
  }

  async function handleAddResource() {
    try {
      let result
      if (resourceFile) {
        result = await uploadResource(resourceFile, {
          resource_type: resourceForm.resource_type,
          title: resourceForm.title,
          description: resourceForm.description,
        })
      } else {
        result = await createResource({
          resource_type: resourceForm.resource_type,
          title: resourceForm.title,
          description: resourceForm.description,
          content: resourceForm.content,
        })
      }
      setResources(prev => [...prev, result])
      setShowResourceModal(false)
      setResourceForm({ resource_type: 'consent_form', title: '', description: '', content: '' })
      setResourceFile(null)
      setSuccess('Resource added')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to add resource')
    }
  }

  async function handleDeleteResource(resourceId) {
    if (!confirm('Delete this resource?')) return
    try {
      await deleteResource(resourceId)
      setResources(prev => prev.filter(r => r.id !== resourceId))
      setSuccess('Resource deleted')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to delete resource')
    }
  }

  async function handleSaveTestimonial() {
    try {
      if (editingTestimonial) {
        const result = await updateTestimonial(editingTestimonial.id, testimonialForm)
        setTestimonials(prev => prev.map(t => t.id === result.id ? result : t))
      } else {
        const result = await createTestimonial(testimonialForm)
        setTestimonials(prev => [...prev, result])
      }
      setShowTestimonialModal(false)
      setEditingTestimonial(null)
      setTestimonialForm({ display_name: '', feedback: '', rating: null })
      setSuccess('Testimonial saved')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to save testimonial')
    }
  }

  async function handleDeleteTestimonial(testimonialId) {
    if (!confirm('Delete this testimonial?')) return
    try {
      await deleteTestimonial(testimonialId)
      setTestimonials(prev => prev.filter(t => t.id !== testimonialId))
      setSuccess('Testimonial deleted')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to delete testimonial')
    }
  }

  function addQualification() {
    if (!newQualification.degree || !newQualification.institution) return
    setFormData(prev => ({
      ...prev,
      qualifications: [...(prev.qualifications || []), { ...newQualification, year: newQualification.year ? parseInt(newQualification.year) : null }]
    }))
    setNewQualification({ degree: '', institution: '', year: '' })
  }

  function removeQualification(index) {
    setFormData(prev => ({
      ...prev,
      qualifications: prev.qualifications.filter((_, i) => i !== index)
    }))
  }

  function addCertification() {
    if (!newCertification.name) return
    setFormData(prev => ({
      ...prev,
      certifications: [...(prev.certifications || []), { ...newCertification, year: newCertification.year ? parseInt(newCertification.year) : null }]
    }))
    setNewCertification({ name: '', issuer: '', year: '' })
  }

  function removeCertification(index) {
    setFormData(prev => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index)
    }))
  }

  function addLanguage() {
    if (!newLanguage.language) return
    setFormData(prev => ({
      ...prev,
      languages: [...(prev.languages || []), newLanguage]
    }))
    setNewLanguage({ language: '', proficiency: 'fluent' })
  }

  function removeLanguage(index) {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== index)
    }))
  }

  function addMembership() {
    if (!newMembership.organization) return
    setFormData(prev => ({
      ...prev,
      professional_memberships: [...(prev.professional_memberships || []), newMembership]
    }))
    setNewMembership({ organization: '', membership_id: '' })
  }

  function removeMembership(index) {
    setFormData(prev => ({
      ...prev,
      professional_memberships: prev.professional_memberships.filter((_, i) => i !== index)
    }))
  }

  function addFaq() {
    if (!newFaq.question || !newFaq.answer) return
    setFormData(prev => ({
      ...prev,
      faq_content: [...(prev.faq_content || []), newFaq]
    }))
    setNewFaq({ question: '', answer: '' })
  }

  function removeFaq(index) {
    setFormData(prev => ({
      ...prev,
      faq_content: prev.faq_content.filter((_, i) => i !== index)
    }))
  }

  function addExpertise() {
    if (!newExpertise.trim()) return
    setFormData(prev => ({
      ...prev,
      areas_of_expertise: [...(prev.areas_of_expertise || []), newExpertise.trim()]
    }))
    setNewExpertise('')
  }

  function removeExpertise(index) {
    setFormData(prev => ({
      ...prev,
      areas_of_expertise: prev.areas_of_expertise.filter((_, i) => i !== index)
    }))
  }

  function toggleSpecialization(value) {
    setFormData(prev => {
      const current = prev.specializations || []
      if (current.includes(value)) {
        return { ...prev, specializations: current.filter(s => s !== value) }
      } else {
        return { ...prev, specializations: [...current, value] }
      }
    })
  }

  function toggleTherapyApproach(value) {
    setFormData(prev => {
      const current = prev.therapy_approaches || []
      if (current.includes(value)) {
        return { ...prev, therapy_approaches: current.filter(s => s !== value) }
      } else {
        return { ...prev, therapy_approaches: [...current, value] }
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  const tabs = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'professional', label: 'Professional' },
    { id: 'contact', label: 'Contact' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'resources', label: 'Resources' },
    { id: 'testimonials', label: 'Testimonials' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Public Profile</h1>
          <p className="text-slate-500">Manage your public-facing therapist profile</p>
        </div>
        <div className="flex items-center gap-3">
          {profile?.slug && (
            <Link
              to={`/p/${profile.slug}`}
              target="_blank"
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800"
            >
              <Eye className="w-4 h-4" />
              Preview
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {success}
        </div>
      )}
      {![formData.slug, formData.title, formData.display_name, formData.tagline, formData.bio].every(v => v && v.trim()) && (
        <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Fill required fields marked * to finish setup
        </div>
      )}

      {/* Profile Visibility Toggle */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.is_public ? 'bg-green-100' : 'bg-slate-100'}`}>
              {formData.is_public ? <Globe className="w-5 h-5 text-green-600" /> : <EyeOff className="w-5 h-5 text-slate-400" />}
            </div>
            <div>
              <p className="font-medium text-slate-800">Public Profile</p>
              <p className="text-sm text-slate-500">
                {formData.is_public ? 'Your profile is visible to everyone' : 'Your profile is hidden from public'}
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_public || false}
              onChange={(e) => setFormData(prev => ({ ...prev, is_public: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="flex border-b overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Photos */}
              <div className="mb-14">
                <label className="block text-sm font-medium text-slate-700 mb-2">Cover & Profile Photo</label>
                <div className="relative">
                  {/* Cover Image */}
                  {formData.cover_image_url ? (
                    <img src={formData.cover_image_url} alt="Cover" className="w-full h-44 rounded-2xl object-cover" />
                  ) : (
                    <div className="w-full h-44 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-600 relative">
                      <span className="absolute bottom-3 right-3 text-[10px] font-medium tracking-wide text-white/80 bg-black/20 backdrop-blur-sm px-2 py-1 rounded-full">
                        Recommended 1200 × 400px
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md hover:bg-slate-50"
                  >
                    <Camera className="w-4 h-4 text-slate-600" />
                  </button>
                  <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />

                  {/* Profile Photo, overlapping the cover's bottom-left corner */}
                  <div className="absolute -bottom-10 left-6">
                    <div className="relative w-24 h-24">
                      {formData.profile_photo_url ? (
                        <img src={formData.profile_photo_url} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md" />
                      ) : (
                        <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-md flex flex-col items-center justify-center gap-0.5">
                          <User className="w-8 h-8 text-slate-300" />
                          <span className="text-[9px] font-medium tracking-wide text-slate-400">400 × 400</span>
                        </div>
                      )}
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        className="absolute bottom-0 right-0 p-1.5 bg-white rounded-full shadow-md hover:bg-slate-50 border border-slate-100"
                      >
                        <Camera className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                      <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Basic Fields */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">URL Slug <span className="text-red-500">*</span></label>
                  <div className="flex items-center">
                    <span className="text-slate-400 text-sm mr-1">/p/</span>
                    <input
                      type="text"
                      value={formData.slug || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                      className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Dr., Mr., Ms., etc."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Display Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.display_name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tagline <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.tagline || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
                    placeholder="Brief professional tagline"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bio <span className="text-red-500">*</span></label>
                <textarea
                  value={formData.bio || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  rows={5}
                  placeholder="Tell patients about yourself, your approach, and what makes your practice unique..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Years of Experience</label>
                  <input
                    type="number"
                    value={formData.years_of_experience || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, years_of_experience: e.target.value }))}
                    min="0"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">License Number</label>
                  <input
                    type="text"
                    value={formData.license_number || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, license_number: e.target.value }))}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Consultation Fee */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    value={formData.consultation_fee || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, consultation_fee: e.target.value }))}
                    placeholder="e.g., 2000"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Professional Tab */}
          {activeTab === 'professional' && (
            <div className="space-y-8">
              {/* Qualifications */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Education & Qualifications</h3>
                <div className="space-y-2 mb-4">
                  {formData.qualifications?.map((qual, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-800">{qual.degree}</p>
                        <p className="text-sm text-slate-500">{qual.institution}{qual.year && ` • ${qual.year}`}</p>
                      </div>
                      <button onClick={() => removeQualification(i)} className="text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQualification.degree}
                    onChange={(e) => setNewQualification(prev => ({ ...prev, degree: e.target.value }))}
                    placeholder="Degree"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={newQualification.institution}
                    onChange={(e) => setNewQualification(prev => ({ ...prev, institution: e.target.value }))}
                    placeholder="Institution"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    value={newQualification.year}
                    onChange={(e) => setNewQualification(prev => ({ ...prev, year: e.target.value }))}
                    placeholder="Year"
                    className="w-20 px-3 py-2 border rounded-lg text-sm"
                  />
                  <button onClick={addQualification} className="px-3 py-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Certifications */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Certifications</h3>
                <div className="space-y-2 mb-4">
                  {formData.certifications?.map((cert, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-800">{cert.name}</p>
                        <p className="text-sm text-slate-500">{cert.issuer}{cert.year && ` • ${cert.year}`}</p>
                      </div>
                      <button onClick={() => removeCertification(i)} className="text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCertification.name}
                    onChange={(e) => setNewCertification(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Certification Name"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={newCertification.issuer}
                    onChange={(e) => setNewCertification(prev => ({ ...prev, issuer: e.target.value }))}
                    placeholder="Issuer"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    value={newCertification.year}
                    onChange={(e) => setNewCertification(prev => ({ ...prev, year: e.target.value }))}
                    placeholder="Year"
                    className="w-20 px-3 py-2 border rounded-lg text-sm"
                  />
                  <button onClick={addCertification} className="px-3 py-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Professional Memberships */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Professional Memberships</h3>
                <div className="space-y-2 mb-4">
                  {formData.professional_memberships?.map((mem, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <p className="text-slate-800">{mem.organization}{mem.membership_id && ` (${mem.membership_id})`}</p>
                      <button onClick={() => removeMembership(i)} className="text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMembership.organization}
                    onChange={(e) => setNewMembership(prev => ({ ...prev, organization: e.target.value }))}
                    placeholder="Organization"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={newMembership.membership_id}
                    onChange={(e) => setNewMembership(prev => ({ ...prev, membership_id: e.target.value }))}
                    placeholder="ID (optional)"
                    className="w-32 px-3 py-2 border rounded-lg text-sm"
                  />
                  <button onClick={addMembership} className="px-3 py-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Languages */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Languages</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {formData.languages?.map((lang, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-full text-sm">
                      {lang.language} ({lang.proficiency})
                      <button onClick={() => removeLanguage(i)} className="text-slate-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select
                    value={newLanguage.language}
                    onChange={(e) => setNewLanguage(prev => ({ ...prev, language: e.target.value }))}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Select language</option>
                    {LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                  <select
                    value={newLanguage.proficiency}
                    onChange={(e) => setNewLanguage(prev => ({ ...prev, proficiency: e.target.value }))}
                    className="w-32 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="native">Native</option>
                    <option value="fluent">Fluent</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="basic">Basic</option>
                  </select>
                  <button onClick={addLanguage} className="px-3 py-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Specializations */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Specializations</h3>
                <div className="flex flex-wrap gap-2">
                  {SPECIALIZATIONS.map(spec => (
                    <button
                      key={spec.value}
                      onClick={() => toggleSpecialization(spec.value)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        formData.specializations?.includes(spec.value)
                          ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {spec.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Therapy Approaches */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Therapy Approaches</h3>
                <div className="flex flex-wrap gap-2">
                  {THERAPY_APPROACHES.map(approach => (
                    <button
                      key={approach.value}
                      onClick={() => toggleTherapyApproach(approach.value)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        formData.therapy_approaches?.includes(approach.value)
                          ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {approach.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Areas of Expertise */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Areas of Expertise</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {formData.areas_of_expertise?.map((area, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-full text-sm">
                      {area}
                      <button onClick={() => removeExpertise(i)} className="text-slate-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newExpertise}
                    onChange={(e) => setNewExpertise(e.target.value)}
                    placeholder="Add area of expertise"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExpertise())}
                  />
                  <button onClick={addExpertise} className="px-3 py-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Contact Tab */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Public Email</label>
                  <input
                    type="email"
                    value={formData.public_email || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, public_email: e.target.value }))}
                    placeholder="contact@example.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Public Phone</label>
                  <input
                    type="tel"
                    value={formData.public_phone || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, public_phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Instagram Handle</label>
                  <div className="relative">
                    <Instagram className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formData.instagram_handle || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, instagram_handle: e.target.value }))}
                      placeholder="yourhandle"
                      className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Clinic Address</label>
                <textarea
                  value={formData.clinic_address || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, clinic_address: e.target.value }))}
                  rows={3}
                  placeholder="Full clinic address"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          )}

          {/* Onboarding Tab */}
          {activeTab === 'onboarding' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Welcome Message</label>
                <textarea
                  value={formData.welcome_message || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, welcome_message: e.target.value }))}
                  rows={4}
                  placeholder="Welcome new patients to your practice..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">What to Expect</label>
                <textarea
                  value={formData.what_to_expect || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, what_to_expect: e.target.value }))}
                  rows={4}
                  placeholder="Describe what patients can expect from therapy..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">How Therapy Works</label>
                <textarea
                  value={formData.how_therapy_works || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, how_therapy_works: e.target.value }))}
                  rows={4}
                  placeholder="Explain your therapeutic process..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Preparation Guidelines</label>
                <textarea
                  value={formData.preparation_guidelines || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, preparation_guidelines: e.target.value }))}
                  rows={4}
                  placeholder="How patients should prepare for their first session..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Disclaimer</label>
                <textarea
                  value={formData.emergency_disclaimer || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, emergency_disclaimer: e.target.value }))}
                  rows={3}
                  placeholder="Important disclaimer about emergency situations..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Consent Information</label>
                <textarea
                  value={formData.consent_info || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, consent_info: e.target.value }))}
                  rows={3}
                  placeholder="Information about consent and privacy..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* FAQ */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Frequently Asked Questions</h3>
                <div className="space-y-2 mb-4">
                  {formData.faq_content?.map((faq, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-slate-800">{faq.question}</p>
                          <p className="text-sm text-slate-500 mt-1">{faq.answer}</p>
                        </div>
                        <button onClick={() => removeFaq(i)} className="text-red-500 hover:text-red-600 ml-2">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newFaq.question}
                    onChange={(e) => setNewFaq(prev => ({ ...prev, question: e.target.value }))}
                    placeholder="Question"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                  <textarea
                    value={newFaq.answer}
                    onChange={(e) => setNewFaq(prev => ({ ...prev, answer: e.target.value }))}
                    placeholder="Answer"
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                  <button
                    onClick={addFaq}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200"
                  >
                    <Plus className="w-4 h-4" />
                    Add FAQ
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Resources Tab */}
          {activeTab === 'resources' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Documents & Resources</h3>
                <button
                  onClick={() => setShowResourceModal(true)}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Resource
                </button>
              </div>
              
              {resources.length > 0 ? (
                <div className="space-y-2">
                  {resources.map((resource) => (
                    <div key={resource.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="font-medium text-slate-800">{resource.title}</p>
                          <p className="text-sm text-slate-500">
                            {RESOURCE_TYPES.find(t => t.value === resource.resource_type)?.label || resource.resource_type}
                            {!resource.is_public && ' • Hidden'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteResource(resource.id)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No resources yet</p>
                  <p className="text-sm">Add consent forms, policies, and other documents</p>
                </div>
              )}
            </div>
          )}

          {/* Testimonials Tab */}
          {activeTab === 'testimonials' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Patient Testimonials</h3>
                <button
                  onClick={() => {
                    setEditingTestimonial(null)
                    setTestimonialForm({ display_name: '', feedback: '', rating: null })
                    setShowTestimonialModal(true)
                  }}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Testimonial
                </button>
              </div>
              
              {testimonials.length > 0 ? (
                <div className="space-y-3">
                  {testimonials.map((testimonial) => (
                    <div key={testimonial.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-800">{testimonial.display_name}</span>
                            {testimonial.rating && (
                              <div className="flex items-center gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-4 h-4 ${i < testimonial.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
                                  />
                                ))}
                              </div>
                            )}
                            {!testimonial.is_public && (
                              <span className="text-xs text-slate-400">(Hidden)</span>
                            )}
                          </div>
                          <p className="text-slate-600">{testimonial.feedback}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingTestimonial(testimonial)
                              setTestimonialForm({
                                display_name: testimonial.display_name,
                                feedback: testimonial.feedback,
                                rating: testimonial.rating,
                              })
                              setShowTestimonialModal(true)
                            }}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTestimonial(testimonial.id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Star className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No testimonials yet</p>
                  <p className="text-sm">Add patient feedback to build trust</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resource Modal */}
      {showResourceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-800">Add Resource</h3>
              <button onClick={() => setShowResourceModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={resourceForm.resource_type}
                  onChange={(e) => setResourceForm(prev => ({ ...prev, resource_type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {RESOURCE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={resourceForm.title}
                  onChange={(e) => setResourceForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={resourceForm.description}
                  onChange={(e) => setResourceForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload File or Add Content</label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {resourceFile ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{resourceFile.name}</span>
                      <button onClick={() => setResourceFile(null)} className="text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={resourceFileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={(e) => setResourceFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <button
                        onClick={() => resourceFileInputRef.current?.click()}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                      >
                        <Upload className="w-5 h-5 mx-auto mb-1" />
                        Upload File
                      </button>
                      <p className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX, TXT (max 10MB)</p>
                    </>
                  )}
                </div>
              </div>
              {!resourceFile && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Or add text content</label>
                  <textarea
                    value={resourceForm.content}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, content: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Enter content here..."
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => setShowResourceModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddResource}
                disabled={!resourceForm.title}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50"
              >
                Add Resource
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Testimonial Modal */}
      {showTestimonialModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-800">
                {editingTestimonial ? 'Edit Testimonial' : 'Add Testimonial'}
              </h3>
              <button onClick={() => setShowTestimonialModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={testimonialForm.display_name}
                  onChange={(e) => setTestimonialForm(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="e.g., A.B. or Anonymous"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Feedback</label>
                <textarea
                  value={testimonialForm.feedback}
                  onChange={(e) => setTestimonialForm(prev => ({ ...prev, feedback: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rating (optional)</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setTestimonialForm(prev => ({
                        ...prev,
                        rating: prev.rating === star ? null : star
                      }))}
                      className="p-1"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          testimonialForm.rating && star <= testimonialForm.rating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-200'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => setShowTestimonialModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTestimonial}
                disabled={!testimonialForm.display_name || !testimonialForm.feedback}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50"
              >
                {editingTestimonial ? 'Save Changes' : 'Add Testimonial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
