import { useState } from 'react'
import { Trash2, AlertCircle } from 'lucide-react'
import { addUnavailableDate, removeUnavailableDate } from '../../api/client'
import Modal from '../../components/ui/Modal'

// Ports AvailabilitySettings.jsx's unavailable-dates CRUD onto the new Modal
// wrapper and Clinical Ink form classes. Each add/remove is its own request
// (not part of the Scheduling save bar) — this list is server-truth the
// instant it changes, same as the old component's loadData()-after-mutate.
export default function BlockDatesModal({ open, onClose, unavailableDates, onChange }) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!date) return
    setSaving(true)
    setError('')
    try {
      const created = await addUnavailableDate({ date, reason: reason || null })
      onChange([...unavailableDates, created].sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setReason('')
    } catch (err) {
      setError(err.userMessage || 'Failed to block that date.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (dateId) => {
    setError('')
    try {
      await removeUnavailableDate(dateId)
      onChange(unavailableDates.filter((d) => d.id !== dateId))
    } catch (err) {
      setError(err.userMessage || 'Failed to remove that date.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Block dates" subtitle="Patients won't be able to book on these days.">
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--error)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleAdd} className="form-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <div>
          <div className="field-head"><label htmlFor="block-date">Date</label></div>
          <input
            id="block-date"
            type="date"
            className="input"
            min={new Date().toISOString().split('T')[0]}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <div className="field-head">
            <label htmlFor="block-reason">Reason</label>
            <span className="field-optional">Optional</span>
          </div>
          <input
            id="block-reason"
            type="text"
            className="input"
            placeholder="e.g. Holiday, Leave"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="span-2">
          <button type="submit" className="btn btn-primary" disabled={!date || saving}>
            {saving ? 'Adding…' : 'Add date'}
          </button>
        </div>
      </form>

      {unavailableDates.length === 0 ? (
        <p className="t-caption">No dates blocked.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {unavailableDates.map((d) => (
            <li
              key={d.id}
              className="settings-row"
              style={{ padding: '10px 0', borderTop: 'var(--border-width, 1px) solid var(--hairline)' }}
            >
              <span>
                {new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                {d.reason && <span className="t-caption" style={{ marginLeft: '8px' }}>— {d.reason}</span>}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={`Remove ${d.date}`}
                onClick={() => handleRemove(d.id)}
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
