import { useEffect, useRef, useId } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Accessible Clinical Ink modal (.modal-backdrop/.modal.as-sheet/.sheet-head/
 * .sheet-body/.sheet-foot — the markup pattern ScheduleModal.jsx already uses,
 * but that component has no focus management of its own). Adds what the
 * Settings spec requires and nothing in the codebase provided yet:
 *   - focus moves into the modal on open
 *   - Escape closes it
 *   - focus returns to the element that opened it, on close
 *   - a focus trap so Tab/Shift+Tab can't leave the dialog
 * Body scroll is locked while open, same as components/ui/ConfirmDialog.jsx.
 */
export default function Modal({ open, onClose, title, subtitle, wide = false, footer, children }) {
  const panelRef = useRef(null)
  const previouslyFocused = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    const focusFirst = () => {
      const first = panel?.querySelector(FOCUSABLE_SELECTOR)
      ;(first || panel)?.focus()
    }
    // Wait a tick so the panel is painted (autoFocus-style) before moving focus.
    const raf = requestAnimationFrame(focusFirst)

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = ''
      // Return focus to whatever opened the modal (the button click that set `open`).
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: 'var(--space-4)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`modal as-sheet${wide ? ' is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 id={titleId} className="t-h3">{title}</h2>
            {subtitle && <p className="t-caption" style={{ marginTop: '2px' }}>{subtitle}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="sheet-body">{children}</div>

        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}
