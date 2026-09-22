import { useState, useRef, useEffect } from 'react'

// .indeterminate is a DOM property, not a reflected attribute, so React
// can't set it via a prop — this wraps the ref imperatively. Only the
// month-level "select all" checkbox ever goes indeterminate.
export function MonthCheckbox({ checked, indeterminate, disabled, onChange, label }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      aria-checked={indeterminate ? 'mixed' : checked}
    />
  )
}

// Selection state for bulk invoicing, shared by the patient-level Payments
// tab (locked to one practitioner, since it's already scoped to one patient
// by the page it's on) and the practice-wide Payments page (locked to one
// patient AND one practitioner, since create_bulk_invoice's URL path and
// its own validation are both hard-scoped to a single patient — combining
// sessions across patients into one invoice isn't something the backend
// can do without a receipt-model change).
//
// `lockKeyOf(item)` returns the string that must match across every
// selected row; once any row is selected, every other row whose key
// differs becomes unselectable until the selection is cleared.
export function useBulkInvoiceSelection({ items, isInvoiceable, lockKeyOf }) {
  const [selectedIds, setSelectedIds] = useState(new Set())

  const selectedItems = items.filter((i) => selectedIds.has(i.id))
  const lockedKey = selectedItems[0] ? lockKeyOf(selectedItems[0]) : null
  const isSelectable = (item) => isInvoiceable(item) && (!lockedKey || lockKeyOf(item) === lockedKey)
  const hasBlockedOthers = lockedKey != null && items.some(
    (i) => isInvoiceable(i) && !selectedIds.has(i.id) && lockKeyOf(i) !== lockedKey
  )

  const toggleRow = (item) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  const toggleGroup = (groupItems) => {
    const eligible = groupItems.filter(isSelectable)
    if (eligible.length === 0) return
    const allSelected = eligible.every((i) => selectedIds.has(i.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const i of eligible) {
        if (allSelected) next.delete(i.id)
        else next.add(i.id)
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  return { selectedIds, selectedItems, isSelectable, hasBlockedOthers, toggleRow, toggleGroup, clearSelection }
}

// Sticky graphite bar — must be rendered as a sibling after the list
// container, never nested inside a .table-wrap/.card-flush or any other
// overflow:hidden ancestor, or `position: sticky` fails silently.
export function BulkInvoiceBar({ count, sumLabel, note, clearLabel = 'Clear', generateLabel, generating, onClear, onGenerate }) {
  if (count === 0) return null
  return (
    <div className="bulk-bar" role="region" aria-label="Bulk invoice selection">
      <span className="bulk-count">{count} selected</span>
      <span className="bulk-sum">· {sumLabel}</span>
      {note && <span className="bulk-note">{note}</span>}
      <div className="bulk-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
          {clearLabel}
        </button>
        <button type="button" className="btn btn-on-ink btn-sm" disabled={generating} onClick={onGenerate}>
          {generating ? 'Generating…' : generateLabel}
        </button>
      </div>
    </div>
  )
}
