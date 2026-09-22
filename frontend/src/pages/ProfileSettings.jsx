import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Copy, Check, ExternalLink, Loader2, AlertCircle, X, Star, Plus,
} from 'lucide-react'
import {
  getMyProfile, updateMyProfile, uploadProfilePhoto,
  uploadSignatureImage, deleteSignatureImage, uploadStampImage, deleteStampImage,
  listMyResources, createResource, uploadResource,
  deleteResource, listMyTestimonials, createTestimonial,
  updateTestimonial, deleteTestimonial,
} from '../api/client'
import { getOnboardingDefaults } from '../constants/onboardingDefaults'
import { useProfileEditorLayout } from './profile-editor/useMediaQuery'
import SectionNav, { PROFILE_SECTIONS } from './profile-editor/SectionNav'
import ProfilePreview from './profile-editor/ProfilePreview'
import Switch from './profile-editor/Switch'
import BasicInfoSection from './profile-editor/BasicInfoSection'
import ProfessionalSection from './profile-editor/ProfessionalSection'
import ContactSection from './profile-editor/ContactSection'
import OnboardingSection from './profile-editor/OnboardingSection'
import ResourcesSection, { RESOURCE_TYPES } from './profile-editor/ResourcesSection'
import AccountPrivacySection from './profile-editor/AccountPrivacySection'

// Testimonials raise a therapy/patient-consent question the founder wants to
// review before this ships to the public profile — editor tab stays hidden
// (data collection/storage untouched) until this flips to true.
const TESTIMONIALS_ENABLED = false

const REQUIRED_FIELDS = [
  { key: 'slug', label: 'Public link' },
  { key: 'title', label: 'Title' },
  { key: 'display_name', label: 'Display name' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'bio', label: 'Bio' },
]

const PUBLIC_HOST = 'therapistnook.com'

export default function ProfileSettings({ onProfileSetupComplete } = {}) {
  const { isXl, isMobile, previewVariant } = useProfileEditorLayout()

  const [profile, setProfile] = useState(null)
  const [resources, setResources] = useState([])
  const [testimonials, setTestimonials] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [activeSection, setActiveSection] = useState('basic')
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [focusFieldKey, setFocusFieldKey] = useState(null)
  const previewTriggerRef = useRef(null)

  const photoInputRef = useRef(null)
  const signatureInputRef = useRef(null)
  const stampInputRef = useRef(null)
  const resourceFileInputRef = useRef(null)

  // Form state — single source of truth for both the desktop and mobile
  // layouts (one component tree, one form state; see useProfileEditorLayout).
  const [formData, setFormData] = useState({})
  const savedSnapshotRef = useRef(null)

  const [newQualification, setNewQualification] = useState({ degree: '', institution: '', year: '' })
  const [newCertification, setNewCertification] = useState({ name: '', issuer: '', year: '' })
  const [newLanguage, setNewLanguage] = useState({ language: '', proficiency: 'fluent' })
  const [newMembership, setNewMembership] = useState({ organization: '', membership_id: '' })

  const [showResourceModal, setShowResourceModal] = useState(false)
  const [resourceForm, setResourceForm] = useState({ resource_type: 'consent_form', title: '', description: '', content: '' })
  const [resourceFile, setResourceFile] = useState(null)

  const [showTestimonialModal, setShowTestimonialModal] = useState(false)
  const [editingTestimonial, setEditingTestimonial] = useState(null)
  const [testimonialForm, setTestimonialForm] = useState({ display_name: '', feedback: '', rating: null })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [profileData, resourcesData, testimonialsData] = await Promise.all([
        getMyProfile(),
        listMyResources().catch(() => []),
        listMyTestimonials().catch(() => []),
      ])
      setProfile(profileData)
      const onboardingDefaults = getOnboardingDefaults(profileData.display_name)
      const next = {
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
      }
      setFormData(next)
      savedSnapshotRef.current = next
      setResources(resourcesData)
      setTestimonials(testimonialsData)
    } catch (err) {
      console.error('Failed to load profile:', err)
      setError('Failed to load profile settings')
    } finally {
      setLoading(false)
    }
  }

  const dirty = savedSnapshotRef.current != null && JSON.stringify(formData) !== JSON.stringify(savedSnapshotRef.current)

  // native prompt on tab close/navigation with unsaved edits
  useEffect(() => {
    function handler(e) {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

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
        profession: formData.profession,
        location_short: formData.location_short,
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
      const nextSnapshot = { ...formData, ...updated, consultation_fee: updated.consultation_fee ? updated.consultation_fee / 100 : '' }
      setFormData(nextSnapshot)
      savedSnapshotRef.current = nextSnapshot
      setSuccess('Changes saved')
      setTimeout(() => setSuccess(null), 3000)

      const mandatoryFilled = REQUIRED_FIELDS.every(({ key }) => formData[key] && String(formData[key]).trim())
      if (mandatoryFilled) onProfileSetupComplete?.()
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError(err.response?.data?.detail || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    if (!savedSnapshotRef.current) return
    setFormData(JSON.parse(JSON.stringify(savedSnapshotRef.current)))
    setError(null)
  }

  async function handleCopyLink() {
    const url = `https://${PUBLIC_HOST}/p/${formData.slug || ''}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API unavailable — link is still visible/selectable in the field
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await uploadProfilePhoto(file)
      setFormData((prev) => ({ ...prev, profile_photo_url: result.url }))
    } catch { setError('Failed to upload photo') }
  }

  async function handleSignatureUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await uploadSignatureImage(file)
      setFormData((prev) => ({ ...prev, signature_image_url: result.url }))
    } catch { setError('Failed to upload signature') }
  }

  async function handleRemoveSignature() {
    try { await deleteSignatureImage(); setFormData((prev) => ({ ...prev, signature_image_url: null })) }
    catch { setError('Failed to remove signature') }
  }

  async function handleStampUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await uploadStampImage(file)
      setFormData((prev) => ({ ...prev, stamp_image_url: result.url }))
    } catch { setError('Failed to upload stamp') }
  }

  async function handleRemoveStamp() {
    try { await deleteStampImage(); setFormData((prev) => ({ ...prev, stamp_image_url: null })) }
    catch { setError('Failed to remove stamp') }
  }

  async function handleAddResource() {
    try {
      let result
      if (resourceFile) {
        result = await uploadResource(resourceFile, {
          resource_type: resourceForm.resource_type, title: resourceForm.title, description: resourceForm.description,
        })
      } else {
        result = await createResource({
          resource_type: resourceForm.resource_type, title: resourceForm.title,
          description: resourceForm.description, content: resourceForm.content,
        })
      }
      setResources((prev) => [...prev, result])
      setShowResourceModal(false)
      setResourceForm({ resource_type: 'consent_form', title: '', description: '', content: '' })
      setResourceFile(null)
    } catch { setError('Failed to add resource') }
  }

  async function handleDeleteResource(resourceId) {
    if (!confirm('Delete this resource?')) return
    try {
      await deleteResource(resourceId)
      setResources((prev) => prev.filter((r) => r.id !== resourceId))
    } catch { setError('Failed to delete resource') }
  }

  async function handleSaveTestimonial() {
    try {
      if (editingTestimonial) {
        const result = await updateTestimonial(editingTestimonial.id, testimonialForm)
        setTestimonials((prev) => prev.map((t) => (t.id === result.id ? result : t)))
      } else {
        const result = await createTestimonial(testimonialForm)
        setTestimonials((prev) => [...prev, result])
      }
      setShowTestimonialModal(false)
      setEditingTestimonial(null)
      setTestimonialForm({ display_name: '', feedback: '', rating: null })
    } catch { setError('Failed to save testimonial') }
  }

  async function handleDeleteTestimonial(testimonialId) {
    if (!confirm('Delete this testimonial?')) return
    try {
      await deleteTestimonial(testimonialId)
      setTestimonials((prev) => prev.filter((t) => t.id !== testimonialId))
    } catch { setError('Failed to delete testimonial') }
  }

  function addQualification() {
    if (!newQualification.degree || !newQualification.institution) return
    setFormData((prev) => ({
      ...prev,
      qualifications: [...(prev.qualifications || []), { ...newQualification, year: newQualification.year ? parseInt(newQualification.year) : null }],
    }))
    setNewQualification({ degree: '', institution: '', year: '' })
  }
  function removeQualification(index) {
    setFormData((prev) => ({ ...prev, qualifications: prev.qualifications.filter((_, i) => i !== index) }))
  }

  function addCertification() {
    if (!newCertification.name) return
    setFormData((prev) => ({
      ...prev,
      certifications: [...(prev.certifications || []), { ...newCertification, year: newCertification.year ? parseInt(newCertification.year) : null }],
    }))
    setNewCertification({ name: '', issuer: '', year: '' })
  }
  function removeCertification(index) {
    setFormData((prev) => ({ ...prev, certifications: prev.certifications.filter((_, i) => i !== index) }))
  }

  function addLanguage() {
    if (!newLanguage.language) return
    setFormData((prev) => ({ ...prev, languages: [...(prev.languages || []), newLanguage] }))
    setNewLanguage({ language: '', proficiency: 'fluent' })
  }
  function removeLanguage(index) {
    setFormData((prev) => ({ ...prev, languages: prev.languages.filter((_, i) => i !== index) }))
  }

  function addMembership() {
    if (!newMembership.organization) return
    setFormData((prev) => ({ ...prev, professional_memberships: [...(prev.professional_memberships || []), newMembership] }))
    setNewMembership({ organization: '', membership_id: '' })
  }
  function removeMembership(index) {
    setFormData((prev) => ({ ...prev, professional_memberships: prev.professional_memberships.filter((_, i) => i !== index) }))
  }

  function toggleSpecialization(value) {
    setFormData((prev) => {
      const current = prev.specializations || []
      return current.includes(value)
        ? { ...prev, specializations: current.filter((s) => s !== value) }
        : { ...prev, specializations: [...current, value] }
    })
  }
  function toggleTherapyApproach(value) {
    setFormData((prev) => {
      const current = prev.therapy_approaches || []
      return current.includes(value)
        ? { ...prev, therapy_approaches: current.filter((s) => s !== value) }
        : { ...prev, therapy_approaches: [...current, value] }
    })
  }

  const missingRequired = REQUIRED_FIELDS.filter(({ key }) => !(formData[key] && String(formData[key]).trim()))
  const isMissing = (key) => missingRequired.some((m) => m.key === key)

  function handleFillInNow() {
    const first = missingRequired[0]
    if (!first) return
    setActiveSection('basic')
    setFocusFieldKey(first.key)
  }

  // Runs after `activeSection` has actually committed/rendered — a plain
  // requestAnimationFrame after setActiveSection can fire before React
  // paints the new section, silently missing the target element.
  useEffect(() => {
    if (!focusFieldKey || activeSection !== 'basic') return
    const el = document.getElementById(`field-${focusFieldKey}`)
    el?.focus()
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFocusFieldKey(null)
  }, [activeSection, focusFieldKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  const sectionsList = TESTIMONIALS_ENABLED
    ? [...PROFILE_SECTIONS.slice(0, 5), { id: 'testimonials', label: 'Testimonials', group: 'public' }, ...PROFILE_SECTIONS.slice(5)]
    : PROFILE_SECTIONS

  return (
    <div className="clinical-ink">
      <div className="tn-profile">
        {/* Header */}
        <div className="tn-header">
          <div className="tn-header-title">
            <div>
              <h1 className="t-h1">Public profile</h1>
              <p className="t-body-s">Manage your public-facing therapist profile</p>
            </div>
            {success && (
              <span className="tn-saved-pill">
                <Check size={13} strokeWidth={2} />
                {success}
              </span>
            )}
          </div>
          <div className="tn-header-actions">
            <div className="tn-link-field">
              <div className="copy-field">
                <input
                  type="text" readOnly className="input"
                  value={`${PUBLIC_HOST}/p/${formData.slug || ''}`}
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" className="btn btn-secondary" onClick={handleCopyLink} disabled={!formData.slug}>
                  {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <Switch
              id="is-public-switch"
              checked={formData.is_public}
              onChange={(v) => setFormData((prev) => ({ ...prev, is_public: v }))}
              label={formData.is_public ? 'Public' : 'Hidden'}
            />
            {formData.slug && (
              <Link to={`/p/${formData.slug}`} target="_blank" className="btn btn-secondary btn-sm">
                View page
                <ExternalLink size={14} strokeWidth={1.5} />
              </Link>
            )}
            {!isXl && (
              <button
                ref={previewTriggerRef}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPreviewOpen(true)}
              >
                Preview
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <AlertCircle size={16} strokeWidth={1.5} />
            {error}
          </div>
        )}

        {/* Setup status */}
        {missingRequired.length > 0 ? (
          <div className="tn-setup-status">
            <div className="tn-setup-status-text">
              <span className="tn-setup-dot" aria-hidden="true" />
              <span className="t-body-s" style={{ color: 'var(--text-primary)' }}>
                {missingRequired.length} required field{missingRequired.length > 1 ? 's' : ''} left
                {missingRequired.length === 1 ? ` — ${missingRequired[0].label}` : ''}
              </span>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleFillInNow}>Fill in now</button>
          </div>
        ) : (
          <div className="tn-setup-status is-complete">
            <div className="tn-setup-status-text">
              <span className="tn-setup-dot" aria-hidden="true" />
              <span className="t-body-s">Setup complete</span>
            </div>
          </div>
        )}

        {/* Body: rail + form (+ inline preview at xl) */}
        <div className="tn-body">
          <SectionNav
            variant={isMobile ? 'dropdown' : 'rail'}
            active={activeSection}
            onChange={setActiveSection}
            missingCount={missingRequired.length}
            sections={sectionsList}
          />

          <div className="tn-form">
            {activeSection === 'basic' && (
              <BasicInfoSection
                formData={formData} setFormData={setFormData} isMissing={isMissing}
                photoInputRef={photoInputRef} onPhotoUpload={handlePhotoUpload}
                signatureInputRef={signatureInputRef} onSignatureUpload={handleSignatureUpload} onRemoveSignature={handleRemoveSignature}
                stampInputRef={stampInputRef} onStampUpload={handleStampUpload} onRemoveStamp={handleRemoveStamp}
              />
            )}
            {activeSection === 'professional' && (
              <ProfessionalSection
                formData={formData}
                newQualification={newQualification} setNewQualification={setNewQualification} addQualification={addQualification} removeQualification={removeQualification}
                newCertification={newCertification} setNewCertification={setNewCertification} addCertification={addCertification} removeCertification={removeCertification}
                newMembership={newMembership} setNewMembership={setNewMembership} addMembership={addMembership} removeMembership={removeMembership}
                newLanguage={newLanguage} setNewLanguage={setNewLanguage} addLanguage={addLanguage} removeLanguage={removeLanguage}
                toggleSpecialization={toggleSpecialization} toggleTherapyApproach={toggleTherapyApproach}
              />
            )}
            {activeSection === 'contact' && <ContactSection formData={formData} setFormData={setFormData} />}
            {activeSection === 'onboarding' && <OnboardingSection formData={formData} setFormData={setFormData} />}
            {activeSection === 'resources' && (
              <ResourcesSection resources={resources} onAdd={() => setShowResourceModal(true)} onDelete={handleDeleteResource} />
            )}
            {TESTIMONIALS_ENABLED && activeSection === 'testimonials' && (
              <TestimonialsSection
                testimonials={testimonials}
                onAdd={() => { setEditingTestimonial(null); setTestimonialForm({ display_name: '', feedback: '', rating: null }); setShowTestimonialModal(true) }}
                onEdit={(t) => { setEditingTestimonial(t); setTestimonialForm({ display_name: t.display_name, feedback: t.feedback, rating: t.rating }); setShowTestimonialModal(true) }}
                onDelete={handleDeleteTestimonial}
              />
            )}
            {activeSection === 'account' && <AccountPrivacySection />}
          </div>

          {isXl && <ProfilePreview formData={formData} variant="inline" />}
        </div>

        {/* Unsaved-changes bar */}
        {dirty && (
          <div className="tn-savebar">
            <span className="t-body-s tn-savebar-text">You have unsaved changes</span>
            <div className="tn-savebar-actions">
              <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={saving}>Discard</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={1.5} />}
                Save changes
              </button>
            </div>
          </div>
        )}

        {/* Nested inside .tn-profile (not as siblings of it) so the sheet/
            dialog preview and both modals below stay in scope for the
            .tn-profile .input/.select/.textarea iOS-zoom fix in tokens.css. */}
        {!isXl && (
          <ProfilePreview
            formData={formData}
            variant={previewVariant === 'sheet' ? 'sheet' : 'dialog'}
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            triggerRef={previewTriggerRef}
          />
        )}

      {/* Resource modal */}
      {showResourceModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 'var(--space-4)' }}>
          <div className="modal" style={{ width: '100%' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
              <h3 className="modal-title">Add resource</h3>
              <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Close" onClick={() => setShowResourceModal(false)}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="tn-field-group">
              <div className="field">
                <label htmlFor="res-type">Type</label>
                <select id="res-type" className="select" value={resourceForm.resource_type} onChange={(e) => setResourceForm((prev) => ({ ...prev, resource_type: e.target.value }))}>
                  {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="res-title">Title</label>
                <input id="res-title" type="text" className="input" value={resourceForm.title} onChange={(e) => setResourceForm((prev) => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="res-desc">Description (optional)</label>
                <input id="res-desc" type="text" className="input" value={resourceForm.description} onChange={(e) => setResourceForm((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="field">
                <label>Upload file or add content</label>
                <div style={{ border: 'var(--border-width) dashed var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'center' }}>
                  {resourceFile ? (
                    <div className="flex items-center justify-between">
                      <span className="t-body-s">{resourceFile.name}</span>
                      <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Remove file" onClick={() => setResourceFile(null)}>
                        <X size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input ref={resourceFileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setResourceFile(e.target.files?.[0] || null)} className="hidden" />
                      <button type="button" className="link" onClick={() => resourceFileInputRef.current?.click()}>Upload file</button>
                      <p className="t-caption" style={{ marginTop: 4 }}>PDF, DOC, DOCX, TXT (max 10MB)</p>
                    </>
                  )}
                </div>
              </div>
              {!resourceFile && (
                <div className="field">
                  <label htmlFor="res-content">Or add text content</label>
                  <textarea id="res-content" className="textarea" rows={4} value={resourceForm.content} onChange={(e) => setResourceForm((prev) => ({ ...prev, content: e.target.value }))} placeholder="Enter content here…" />
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowResourceModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!resourceForm.title} onClick={handleAddResource}>Add resource</button>
            </div>
          </div>
        </div>
      )}

      {/* Testimonial modal */}
      {showTestimonialModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 'var(--space-4)' }}>
          <div className="modal" style={{ width: '100%' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
              <h3 className="modal-title">{editingTestimonial ? 'Edit testimonial' : 'Add testimonial'}</h3>
              <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Close" onClick={() => setShowTestimonialModal(false)}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="tn-field-group">
              <div className="field">
                <label htmlFor="test-name">Display name</label>
                <input id="test-name" type="text" className="input" placeholder="e.g., A.B. or Anonymous" value={testimonialForm.display_name} onChange={(e) => setTestimonialForm((prev) => ({ ...prev, display_name: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="test-feedback">Feedback</label>
                <textarea id="test-feedback" className="textarea" rows={4} value={testimonialForm.feedback} onChange={(e) => setTestimonialForm((prev) => ({ ...prev, feedback: e.target.value }))} />
              </div>
              <div className="field">
                <label>Rating (optional)</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star} type="button"
                      aria-label={`${star} star${star > 1 ? 's' : ''}`}
                      onClick={() => setTestimonialForm((prev) => ({ ...prev, rating: prev.rating === star ? null : star }))}
                      style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer' }}
                    >
                      <Star size={22} strokeWidth={1.5} color={testimonialForm.rating && star <= testimonialForm.rating ? 'var(--warning)' : 'var(--border)'} fill={testimonialForm.rating && star <= testimonialForm.rating ? 'var(--warning)' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowTestimonialModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!testimonialForm.display_name || !testimonialForm.feedback} onClick={handleSaveTestimonial}>
                {editingTestimonial ? 'Save changes' : 'Add testimonial'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

// Kept as a page-local component (not mounted while TESTIMONIALS_ENABLED is
// false) so the founder's consent-review decision only has to flip one flag.
function TestimonialsSection({ testimonials, onAdd, onEdit, onDelete }) {
  return (
    <div className="tn-field-group">
      <div className="section-head" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="t-h4" style={{ margin: 0 }}>Patient testimonials</p>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} strokeWidth={1.5} />
          Add testimonial
        </button>
      </div>
      {testimonials.length > 0 ? (
        <div className="card-flush">
          {testimonials.map((t) => (
            <div key={t.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="t-cell-key">{t.display_name}</span>
                  {t.rating && (
                    <span style={{ display: 'flex', gap: 1 }}>
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={13} strokeWidth={1.5} color={i < t.rating ? 'var(--warning)' : 'var(--border)'} fill={i < t.rating ? 'var(--warning)' : 'none'} />
                      ))}
                    </span>
                  )}
                  {!t.is_public && <span className="t-caption">(Hidden)</span>}
                </div>
                <p className="t-body-s" style={{ margin: 0 }}>{t.feedback}</p>
              </div>
              <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                <button type="button" className="link" onClick={() => onEdit(t)}>Edit</button>
                <button type="button" className="btn btn-ghost btn-icon-sm" aria-label={`Delete testimonial from ${t.display_name}`} onClick={() => onDelete(t.id)}>
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Star size={32} strokeWidth={1.5} color="var(--icon-muted)" style={{ margin: '0 auto 10px' }} />
          <p className="empty-title">No testimonials yet</p>
          <p className="empty-body">Add patient feedback to build trust.</p>
        </div>
      )}
    </div>
  )
}
