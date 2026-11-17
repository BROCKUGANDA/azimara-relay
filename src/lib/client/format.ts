'use client'

// Client-side decimal formatting mirrors the server's exact base-unit rules.
// Display only — authoritative math happens server-side over integers.

export function formatAmount(base: string, decimals: number, symbol?: string, opts?: { compact?: boolean }): string {
  let s = base
  if (!/^\d+$/.test(s)) s = '0'
  const padded = s.padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals) || '0'
  let frac = decimals > 0 ? padded.slice(padded.length - decimals) : ''
  frac = frac.replace(/0+$/, '')
  const wholeNum = BigInt(whole || '0')
  const grouped = wholeNum.toLocaleString('en-US')
  const value = frac ? `${grouped}.${frac}` : grouped
  if (opts?.compact && wholeNum >= 1_000_000n) {
    const m = Number(wholeNum) / 1e6
    return `${m.toFixed(1)}M${symbol ? ' ' + symbol : ''}`
  }
  return `${value}${symbol ? ' ' + symbol : ''}`
}

export function shortAddress(address: string, size = 4): string {
  if (!address || address.length < 12) return address
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`
}

export function shortHash(sig: string): string {
  return sig.length > 18 ? `${sig.slice(0, 8)}…${sig.slice(-8)}` : sig
}

export function formatDateTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function timeAgo(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const sec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}
