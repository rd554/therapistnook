// Page-local media-query hook — mirrors the small, non-shared matchMedia
// pattern already used by Analytics.jsx and settings/SettingsShell.jsx.
// Kept here (not promoted to a shared hooks/ dir) since this is the only
// screen that currently needs a three-way xl/lg/mobile split driven by JS
// rather than pure CSS (the section nav swaps between a rail and a custom
// dropdown, and the preview swaps between an inline panel and a dialog/sheet
// — both need to pick one markup shape, not hide one via CSS, to avoid
// mounting duplicate input ids).
import { useState, useEffect } from 'react'

export function useMediaQuery(query) {
  const getMatch = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Public Profile editor's own three-way breakpoint split, reusing the app's
// existing Tailwind breakpoints (no new custom breakpoints introduced):
//   xl  (>=1280px) — full 3-column desktop: rail + form + inline preview
//   lg  (1024-1279px) — rail + form, preview becomes a right-side sheet
//   below lg (<1024px) — mobile: custom-dropdown switcher, preview becomes
//     a full-screen dialog
export function useProfileEditorLayout() {
  const isXl = useMediaQuery('(min-width: 1280px)')
  const isLgUp = useMediaQuery('(min-width: 1024px)')
  return {
    isXl,
    isLgUp,
    isMobile: !isLgUp,
    // 'inline' | 'sheet' | 'dialog' — the shape PreviewPanel should render as
    previewVariant: isXl ? 'inline' : isLgUp ? 'sheet' : 'dialog',
  }
}
