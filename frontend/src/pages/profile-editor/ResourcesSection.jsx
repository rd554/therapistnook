import { FileText, Plus, Trash2 } from 'lucide-react'

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

export { RESOURCE_TYPES }

export default function ResourcesSection({ resources, onAdd, onDelete }) {
  return (
    <div className="tn-field-group">
      <div className="section-head" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="t-h4" style={{ margin: 0 }}>Documents & resources</p>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} strokeWidth={1.5} />
          Add resource
        </button>
      </div>

      {resources.length > 0 ? (
        <div className="card-flush">
          {resources.map((resource) => (
            <div key={resource.id} className="list-row">
              <FileText size={18} strokeWidth={1.5} color="var(--icon-muted)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-cell-key" style={{ margin: 0 }}>{resource.title}</p>
                <p className="t-cell-muted" style={{ margin: 0 }}>
                  {RESOURCE_TYPES.find((t) => t.value === resource.resource_type)?.label || resource.resource_type}
                  {!resource.is_public && ' · Hidden'}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon-sm" aria-label={`Delete ${resource.title}`} onClick={() => onDelete(resource.id)}>
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ border: 'var(--border-width) dashed var(--border)', background: 'transparent' }}>
          <FileText size={32} strokeWidth={1.5} color="var(--icon-muted)" style={{ margin: '0 auto 10px' }} />
          <p className="empty-title">No resources yet</p>
          <p className="empty-body">Add consent forms, policies, and other documents patients can find on your page.</p>
        </div>
      )}
    </div>
  )
}
