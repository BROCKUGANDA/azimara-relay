// RFC 6238 TOTP (SHA-1, 6 digits, 30s step) implemented on node:crypto so
// MFA works without external dependencies. Secrets are stored encrypted.

import { createHmac } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0n
  let out = ''
  let bitLen = 0n
  for (const byte of buf) {
    bits = (bits << 8n) | BigInt(byte)
    bitLen += 8n
    while (bitLen >= 5n) {
      out += BASE32_ALPHABET[Number((bits >> (bitLen - 5n)) & 31n)]
      bitLen -= 5n
    }
  }
  if (bitLen > 0n) out += BASE32_ALPHABET[Number((bits << (5n - bitLen)) & 31n)]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')
  let bits = 0n
  let bitLen = 0n
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('Invalid base32')
    bits = (bits << 5n) | BigInt(idx)
    bitLen += 5n
    if (bitLen >= 8n) {
      bytes.push(Number((bits >> (bitLen - 8n)) & 255n))
      bitLen -= 8n
    }
  }
  return Buffer.from(bytes)
}

export function generateTotpSecret(): string {
  return base32Encode(Buffer.from(crypto.getRandomValues(new Uint8Array(20))))
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(buf).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const code =
    ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff)
  return (code % 1_000_000).toString().padStart(6, '0')
}

export function totpNow(secretBase32: string, atMs: number = Date.now(), stepSec = 30): string {
  return hotp(base32Decode(secretBase32), Math.floor(atMs / 1000 / stepSec))
}

export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const counter = Math.floor(Date.now() / 1000 / 30)
  const secret = base32Decode(secretBase32)
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, counter + w) === clean) return true
  }
  return false
}

export function otpauthUri(email: string, secret: string, issuer = 'AZIMARA RELAY'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
