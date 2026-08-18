import { COUNTRY_CODES } from '../constants/countryCodes'

// Longest dial code first, so e.g. "+441534" (Jersey) is matched before the
// shorter "+44" (UK) it's a prefix of. COUNTRY_CODES has exactly one entry
// per distinct code (see that file for why), so the first match found this
// way is always the correct, unambiguous one.
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length)

/**
 * Splits a stored phone string into { code, local }. Only ever guesses a
 * country when the number actually starts with a "+"; a bare number like
 * "9876543210" (no dial code) comes back as { code: '', local: '9876543210' }
 * rather than assumed to be any particular country — silently defaulting an
 * unrecognized/legacy number to e.g. +91 would rewrite it the moment someone
 * opens Edit Patient and hits Save without touching the phone field.
 */
export function splitPhone(raw) {
  const trimmed = (raw ?? '').toString().trim()
  if (!trimmed.startsWith('+')) return { code: '', local: trimmed }
  for (const c of SORTED_CODES) {
    if (trimmed === c.code) return { code: c.code, local: '' }
    if (trimmed.startsWith(c.code)) {
      // Strip any separator left dangling right after the dial code (space,
      // hyphen, or dot) — "+91-987-654-3210" and "+91 987 654 3210" should
      // both leave a clean "987-654-3210"/"987 654 3210" local part, not
      // "-987-654-3210" with the separator still glued to the front. Parens
      // are deliberately NOT stripped here: a leading "(" in the local part
      // (e.g. "+91 (987) 654-3211") is a real area-code grouping, not a
      // separator glued onto the code, and stripping it would corrupt the
      // number by leaving an unmatched trailing ")".
      const local = trimmed.slice(c.code.length).trim().replace(/^[\s\-.]+/, '')
      return { code: c.code, local }
    }
  }
  return { code: '', local: trimmed }
}

/**
 * Inverse of splitPhone. If there's no local number, the result is '' (not
 * just the bare code) — selecting a country and leaving the digits blank
 * shouldn't produce a non-empty "phone number" that then fails backend
 * validation on an otherwise-optional field.
 */
export function joinPhone(code, local) {
  const l = (local || '').trim()
  if (!l) return ''
  if (!code) return l
  return `${code} ${l}`
}
