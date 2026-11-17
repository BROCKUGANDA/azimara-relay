'use client'

// Clipboard with graceful degradation. navigator.clipboard exists only in
// secure contexts (https / localhost); on plain http origins — and in some
// in-app browsers — it is undefined, so fall back to a temporary textarea +
// document.execCommand. Never report success without a real copy.

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    ta.style.pointerEvents = 'none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const okFlag = document.execCommand('copy')
    document.body.removeChild(ta)
    return okFlag
  } catch {
    return false
  }
}
