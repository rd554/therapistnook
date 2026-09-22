import { createContext, useContext, useEffect, useRef } from 'react'

// Lets the currently-active Settings section (rendered via <Outlet/>) tell the
// shell's own nav — a sibling, not a parent/child of the section — whether it
// has unsaved changes, without threading state up through every section's props.
//
// Scope, deliberately: this guards only the two in-page controls the shell
// itself renders (nav-item clicks, the mobile .settings-back link) plus a
// `beforeunload` listener for real tab-close/reload. It does not intercept
// arbitrary route navigation elsewhere in the app (e.g. the sidebar) — that
// would need a data router (`useBlocker`), which is a larger, separate change.
// See settings-phase1-plan.md, "route-navigation-warning scope boundary".
const SettingsGuardContext = createContext(null)

export function SettingsGuardProvider({ children }) {
  const guardRef = useRef({ isDirty: false, changedLabels: '' })
  return (
    <SettingsGuardContext.Provider value={guardRef}>
      {children}
    </SettingsGuardContext.Provider>
  )
}

/** Called by the active section (usually via useDirtyForm's isDirty/changedLabels)
    to report its current dirty state to the shell. */
export function useRegisterSettingsGuard(isDirty, changedLabels) {
  const guardRef = useContext(SettingsGuardContext)

  useEffect(() => {
    if (!guardRef) return undefined
    guardRef.current = { isDirty, changedLabels }
    return () => { guardRef.current = { isDirty: false, changedLabels: '' } }
  }, [guardRef, isDirty, changedLabels])

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
}

/** Called by the shell's nav-item/back-link click handlers to read the
    active section's dirty state synchronously, without re-rendering on every
    keystroke in the section below. */
export function useSettingsGuardRef() {
  return useContext(SettingsGuardContext)
}

/** Shared confirm copy so the wording matches wherever a guarded link fires. */
export function confirmDiscardNavigation(changedLabels) {
  const detail = changedLabels ? ` (${changedLabels})` : ''
  return window.confirm(`Discard unsaved changes${detail}?`)
}
