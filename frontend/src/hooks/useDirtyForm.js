import { useCallback, useMemo, useState } from 'react'

/**
 * Diff-based dirty tracking for the Settings save pattern (spec: ".form-status
 * names what changed, in plain words: 'Unsaved changes: working days, reminder
 * timing'."). Unlike PatientEdit.jsx's isDirty (a single JSON.stringify
 * boolean — see settings-phase1-plan.md), this tracks WHICH top-level keys
 * changed so the save bar can name them.
 *
 * @param {object} initial      the first known-saved value (may be null while loading)
 * @param {Record<string,string>} fieldLabels  key -> plain-words label, for the ones
 *   worth naming in the save bar; keys without an entry fall back to the raw key.
 */
export function useDirtyForm(initial, fieldLabels = {}) {
  const [initialForm, setInitialForm] = useState(initial)
  const [form, setForm] = useState(initial)

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const changedKeys = useMemo(() => {
    if (!initialForm || !form) return []
    const keys = new Set([...Object.keys(initialForm), ...Object.keys(form)])
    const changed = []
    for (const key of keys) {
      if (JSON.stringify(initialForm[key]) !== JSON.stringify(form[key])) changed.push(key)
    }
    return changed
  }, [form, initialForm])

  const isDirty = changedKeys.length > 0

  const changedLabels = useMemo(
    () => changedKeys.map((k) => fieldLabels[k] || k).join(', '),
    [changedKeys, fieldLabels]
  )

  const discard = useCallback(() => setForm(initialForm), [initialForm])

  /** Call after a successful save, with the server's canonical response —
      the next diff is measured against what's actually persisted, not what
      was optimistically typed. */
  const commit = useCallback((saved) => {
    setInitialForm(saved)
    setForm(saved)
  }, [])

  /** Call when the section loads or reloads fresh data from the server. */
  const reset = useCallback((data) => {
    setInitialForm(data)
    setForm(data)
  }, [])

  return { form, setForm, setField, isDirty, changedKeys, changedLabels, discard, commit, reset }
}
