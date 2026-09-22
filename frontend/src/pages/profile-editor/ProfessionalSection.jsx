import { Plus, Trash2, X, Check } from 'lucide-react'

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

const LANGUAGES = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi',
  'Gujarati', 'Bengali', 'Punjabi', 'Urdu', 'Spanish', 'French', 'German',
]

export { THERAPY_APPROACHES, SPECIALIZATIONS, LANGUAGES }

function ChipGroup({ title, options, selected, onToggle }) {
  const count = selected?.length || 0
  return (
    <div className="tn-field-group">
      <div className="field-head" style={{ marginBottom: 'var(--space-3)' }}>
        <p className="t-h4" style={{ margin: 0 }}>{title}</p>
        <span className="field-optional">{count} selected</span>
      </div>
      <div className="tn-chip-group">
        {options.map((opt) => {
          const isSelected = selected?.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              className="tn-chip"
              aria-pressed={isSelected}
              onClick={() => onToggle(opt.value)}
            >
              {isSelected && <Check size={13} strokeWidth={2} />}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ProfessionalSection({
  formData,
  newQualification, setNewQualification, addQualification, removeQualification,
  newCertification, setNewCertification, addCertification, removeCertification,
  newMembership, setNewMembership, addMembership, removeMembership,
  newLanguage, setNewLanguage, addLanguage, removeLanguage,
  toggleSpecialization, toggleTherapyApproach,
}) {
  return (
    <div className="tn-field-group">
      {/* Education & qualifications */}
      <div className="tn-field-group">
        <p className="t-h4" style={{ marginBottom: 'var(--space-3)' }}>Education & qualifications</p>
        {formData.qualifications?.length > 0 && (
          <div className="card-flush" style={{ marginBottom: 'var(--space-3)' }}>
            {formData.qualifications.map((qual, i) => (
              <div key={i} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-cell-key" style={{ margin: 0 }}>{qual.degree}</p>
                  <p className="t-cell-muted" style={{ margin: 0 }}>{qual.institution}{qual.year && ` · ${qual.year}`}</p>
                </div>
                <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Remove qualification" onClick={() => removeQualification(i)}>
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="tn-add-row" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input type="text" className="input" style={{ flex: '1 1 160px' }} placeholder="Degree" value={newQualification.degree} onChange={(e) => setNewQualification((p) => ({ ...p, degree: e.target.value }))} />
          <input type="text" className="input" style={{ flex: '1 1 160px' }} placeholder="Institution" value={newQualification.institution} onChange={(e) => setNewQualification((p) => ({ ...p, institution: e.target.value }))} />
          <input type="number" className="input" style={{ width: 90 }} placeholder="Year" value={newQualification.year} onChange={(e) => setNewQualification((p) => ({ ...p, year: e.target.value }))} />
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Add qualification" disabled={!newQualification.degree || !newQualification.institution} onClick={addQualification}>
            <Plus size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Certifications */}
      <div className="tn-field-group">
        <p className="t-h4" style={{ marginBottom: 'var(--space-3)' }}>Certifications</p>
        {formData.certifications?.length > 0 && (
          <div className="card-flush" style={{ marginBottom: 'var(--space-3)' }}>
            {formData.certifications.map((cert, i) => (
              <div key={i} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-cell-key" style={{ margin: 0 }}>{cert.name}</p>
                  <p className="t-cell-muted" style={{ margin: 0 }}>{cert.issuer}{cert.year && ` · ${cert.year}`}</p>
                </div>
                <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Remove certification" onClick={() => removeCertification(i)}>
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input type="text" className="input" style={{ flex: '1 1 160px' }} placeholder="Certification name" value={newCertification.name} onChange={(e) => setNewCertification((p) => ({ ...p, name: e.target.value }))} />
          <input type="text" className="input" style={{ flex: '1 1 160px' }} placeholder="Issuer" value={newCertification.issuer} onChange={(e) => setNewCertification((p) => ({ ...p, issuer: e.target.value }))} />
          <input type="number" className="input" style={{ width: 90 }} placeholder="Year" value={newCertification.year} onChange={(e) => setNewCertification((p) => ({ ...p, year: e.target.value }))} />
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Add certification" disabled={!newCertification.name} onClick={addCertification}>
            <Plus size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Professional memberships */}
      <div className="tn-field-group">
        <p className="t-h4" style={{ marginBottom: 'var(--space-3)' }}>Professional memberships</p>
        {formData.professional_memberships?.length > 0 && (
          <div className="card-flush" style={{ marginBottom: 'var(--space-3)' }}>
            {formData.professional_memberships.map((mem, i) => (
              <div key={i} className="list-row">
                <p className="t-cell" style={{ margin: 0, flex: 1 }}>{mem.organization}{mem.membership_id && ` (${mem.membership_id})`}</p>
                <button type="button" className="btn btn-ghost btn-icon-sm" aria-label="Remove membership" onClick={() => removeMembership(i)}>
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input type="text" className="input" style={{ flex: '1 1 200px' }} placeholder="Organization" value={newMembership.organization} onChange={(e) => setNewMembership((p) => ({ ...p, organization: e.target.value }))} />
          <input type="text" className="input" style={{ width: 140 }} placeholder="ID (optional)" value={newMembership.membership_id} onChange={(e) => setNewMembership((p) => ({ ...p, membership_id: e.target.value }))} />
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Add membership" disabled={!newMembership.organization} onClick={addMembership}>
            <Plus size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Languages */}
      <div className="tn-field-group">
        <p className="t-h4" style={{ marginBottom: 'var(--space-3)' }}>Languages</p>
        {formData.languages?.length > 0 && (
          <div className="tn-chip-group" style={{ marginBottom: 'var(--space-3)' }}>
            {formData.languages.map((lang, i) => (
              <span key={i} className="tn-chip" aria-pressed="true">
                {lang.language} ({lang.proficiency})
                <button type="button" aria-label={`Remove ${lang.language}`} onClick={() => removeLanguage(i)} style={{ background: 'none', border: 0, padding: 0, display: 'flex', cursor: 'pointer', color: 'inherit' }}>
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <select className="select" style={{ flex: '1 1 160px' }} value={newLanguage.language} onChange={(e) => setNewLanguage((p) => ({ ...p, language: e.target.value }))}>
            <option value="">Select language</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} value={newLanguage.proficiency} onChange={(e) => setNewLanguage((p) => ({ ...p, proficiency: e.target.value }))}>
            <option value="native">Native</option>
            <option value="fluent">Fluent</option>
            <option value="intermediate">Intermediate</option>
            <option value="basic">Basic</option>
          </select>
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Add language" disabled={!newLanguage.language} onClick={addLanguage}>
            <Plus size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <ChipGroup title="Specializations" options={SPECIALIZATIONS} selected={formData.specializations} onToggle={toggleSpecialization} />
      <ChipGroup title="Therapy approaches" options={THERAPY_APPROACHES} selected={formData.therapy_approaches} onToggle={toggleTherapyApproach} />
    </div>
  )
}
