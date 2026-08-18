import { useState, useEffect } from 'react'
import { COUNTRY_CODES } from '../../constants/countryCodes'
import { splitPhone, joinPhone } from '../../utils/phone'

export { splitPhone, joinPhone }

/**
 * Country-code + local-number phone field. Takes/returns a single combined
 * string (e.g. "+91 98765 43210") so it's a drop-in replacement for a plain
 * <input type="tel"> wherever `value`/`onChange` held that string already.
 *
 * Only reformats the combined string when the user actually edits the code
 * or the digits — merely displaying an existing value (however it happens to
 * be formatted) never fires onChange, so opening a form and saving without
 * touching the phone field round-trips the original string unchanged.
 */
export default function PhoneInput({ value, onChange, defaultCode = '+91', placeholder = '98765 43210', disabled = false }) {
  const parse = (v) => {
    const parsed = splitPhone(v)
    // Blank field (new patient, nothing typed yet) — pre-select the default
    // dial code for convenience, but this alone must still join back to ''
    // (see joinPhone) so it doesn't masquerade as an entered phone number.
    return !parsed.code && !parsed.local ? { code: defaultCode, local: '' } : parsed
  }

  const [phone, setPhone] = useState(() => parse(value))

  // Resync from the outside only when the external value no longer matches
  // what we'd produce ourselves (e.g. patient data finishes loading after an
  // async fetch). Never fires during normal typing, since after our own
  // onChange the parent's `value` becomes exactly joinPhone(phone).
  useEffect(() => {
    if (joinPhone(phone.code, phone.local) !== (value ?? '')) {
      setPhone(parse(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const update = (next) => {
    setPhone(next)
    onChange(joinPhone(next.code, next.local))
  }

  return (
    <div className="flex gap-2">
      <select
        className="input-field w-[180px] shrink-0"
        value={phone.code}
        disabled={disabled}
        onChange={(e) => update({ ...phone, code: e.target.value })}
      >
        <option value="">No code</option>
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
        ))}
      </select>
      <input
        type="tel"
        className="input-field flex-1"
        placeholder={placeholder}
        value={phone.local}
        disabled={disabled}
        onChange={(e) => update({ ...phone, local: e.target.value })}
      />
    </div>
  )
}
