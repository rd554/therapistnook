// navigator.clipboard requires a secure context (HTTPS or localhost) — it's
// silently unavailable/rejecting on a plain-HTTP LAN IP, which is how this
// app gets demoed before a domain is wired up. Falls back to the legacy
// execCommand('copy') textarea trick, then to just selecting the text so the
// user can still copy it manually. Always resolves to true/false rather than
// throwing, so callers can drive a single success/failure toast.
export async function copyToClipboard(text, { selectEl } = {}) {
  if (!text) return false

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy path
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  if (ok) return true

  // Last resort: select the visible field's text so the user can copy it
  // themselves with their own keyboard shortcut.
  if (selectEl?.select) selectEl.select()
  return false
}

// Wraps the Web Share API with the same copy fallback, for the mobile
// share-sheet case (WhatsApp, etc). Returns 'shared' | 'copied' | 'failed'.
export async function shareOrCopy({ title, text, url }, { selectEl } = {}) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // fall through to copy on share failure (not user cancellation)
    }
  }
  const ok = await copyToClipboard(url, { selectEl })
  return ok ? 'copied' : 'failed'
}
