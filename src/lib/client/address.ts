'use client'

// Client-side Solana address validation (base58 decode → 32 bytes).
// Authoritative validation also happens server-side on every mutation.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function isValidSolanaAddress(address: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false
  try {
    let num = 0n
    for (const ch of address) {
      const idx = ALPHABET.indexOf(ch)
      if (idx === -1) return false
      num = num * 58n + BigInt(idx)
    }
    let bytes: number[] = []
    while (num > 0n) {
      bytes.unshift(Number(num % 256n))
      num /= 256n
    }
    for (const ch of address) {
      if (ch === '1') bytes.unshift(0)
      else break
    }
    return bytes.length === 32
  } catch {
    return false
  }
}
