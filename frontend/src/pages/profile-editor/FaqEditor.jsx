// Public Profile → Onboarding → FAQ editor.
//
// Part 1 of the profile revamp: no defect was found in the pre-existing
// addFaq()/persistence chain (schemas.py's FAQItem → models.py's JSON column
// → main.py's update_my_profile all round-trip correctly — verified by
// reading, not just by this rewrite). The most likely explanation for the
// reported "Add does nothing" bug is UX, not a bug: the old Add button had
// no disabled state and appended a blank row with no focus movement, so a
// click with an empty/whitespace draft silently no-op'd with zero feedback.
// This component fixes exactly that plus adds the rest of Part 1's expected
// behaviour: inline edit, delete, reorder (ends disabled), Cmd/Ctrl+Enter.
import { useState, useRef } from 'react'
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, X, Check } from 'lucide-react'

export default function FaqEditor({ value, onChange }) {
  const items = value || []
  const [draft, setDraft] = useState({ question: '', answer: '' })
  const [editingIndex, setEditingIndex] = useState(null)
  const [editDraft, setEditDraft] = useState({ question: '', answer: '' })
  const editQuestionRef = useRef(null)

  const canAdd = draft.question.trim().length > 0 && draft.answer.trim().length > 0
  const canSaveEdit = editDraft.question.trim().length > 0 && editDraft.answer.trim().length > 0

  function handleAdd() {
    if (!canAdd) return
    onChange([...items, { question: draft.question.trim(), answer: draft.answer.trim() }])
    setDraft({ question: '', answer: '' })
  }

  function handleAnswerKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  function startEdit(i) {
    setEditingIndex(i)
    setEditDraft({ question: items[i].question, answer: items[i].answer })
    // focus moves into the row being edited once it re-renders as a form
    requestAnimationFrame(() => editQuestionRef.current?.focus())
  }

  function cancelEdit() {
    setEditingIndex(null)
  }

  function saveEdit(i) {
    if (!canSaveEdit) return
    const next = items.slice()
    next[i] = { question: editDraft.question.trim(), answer: editDraft.answer.trim() }
    onChange(next)
    setEditingIndex(null)
  }

  function remove(i) {
    onChange(items.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }

  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
    if (editingIndex === i) setEditingIndex(j)
  }

  return (
    <div className="tn-faq">
      {items.length > 0 && (
        <div className="card-flush tn-faq-list" style={{ marginBottom: 'var(--space-4)' }}>
          {items.map((faq, i) =>
            editingIndex === i ? (
              <div key={i} className="tn-faq-row tn-faq-row--editing rule-accent">
                <div className="field" style={{ marginBottom: 'var(--space-3)' }}>
                  <label htmlFor={`faq-edit-q-${i}`}>Question</label>
                  <input
                    id={`faq-edit-q-${i}`}
                    ref={editQuestionRef}
                    type="text"
                    className="input"
                    value={editDraft.question}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, question: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ marginBottom: 'var(--space-3)' }}>
                  <label htmlFor={`faq-edit-a-${i}`}>Answer</label>
                  <textarea
                    id={`faq-edit-a-${i}`}
                    className="textarea"
                    rows={3}
                    value={editDraft.answer}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, answer: e.target.value }))}
                  />
                </div>
                <div className="tn-faq-edit-actions">
                  <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
                    <X size={16} strokeWidth={1.5} />
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" disabled={!canSaveEdit} onClick={() => saveEdit(i)}>
                    <Check size={16} strokeWidth={1.5} />
                    Update
                  </button>
                </div>
              </div>
            ) : (
              <div key={i} className="tn-faq-row list-row">
                <div className="tn-faq-row-text">
                  <p className="t-cell-key" style={{ margin: 0 }}>{faq.question}</p>
                  <p className="t-body-s" style={{ margin: '4px 0 0' }}>{faq.answer}</p>
                </div>
                <div className="tn-faq-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-sm"
                    aria-label="Move question up"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ChevronUp size={16} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-sm"
                    aria-label="Move question down"
                    title="Move down"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDown size={16} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-sm"
                    aria-label="Edit question"
                    title="Edit"
                    onClick={() => startEdit(i)}
                  >
                    <Pencil size={16} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-sm"
                    aria-label="Delete question"
                    title="Delete"
                    onClick={() => remove(i)}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="tn-faq-composer">
        <div className="field" style={{ marginBottom: 'var(--space-3)' }}>
          <label htmlFor="faq-new-q">Question</label>
          <input
            id="faq-new-q"
            type="text"
            className="input"
            placeholder="e.g. What should I bring to my first session?"
            value={draft.question}
            onChange={(e) => setDraft((prev) => ({ ...prev, question: e.target.value }))}
          />
        </div>
        <div className="field" style={{ marginBottom: 'var(--space-3)' }}>
          <label htmlFor="faq-new-a">Answer</label>
          <textarea
            id="faq-new-a"
            className="textarea"
            rows={2}
            placeholder="Answer (⌘/Ctrl+Enter to add)"
            value={draft.answer}
            onChange={(e) => setDraft((prev) => ({ ...prev, answer: e.target.value }))}
            onKeyDown={handleAnswerKeyDown}
          />
        </div>
        <button type="button" className="btn btn-primary tn-faq-add" disabled={!canAdd} onClick={handleAdd}>
          <Plus size={16} strokeWidth={1.5} />
          Add question
        </button>
      </div>
    </div>
  )
}
