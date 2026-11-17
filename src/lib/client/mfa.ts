'use client'

// Client helpers for MFA setup/enable (session-cookie based).
import { api } from './api'

export function setupTotpClient(): Promise<{ secret: string; otpauthUri: string }> {
  return api('/api/auth/mfa', { json: { action: 'setup' } })
}

export function enableTotpClient(code: string): Promise<{ enabled: boolean }> {
  return api('/api/auth/mfa', { json: { action: 'enable', code } })
}
