'use client'

// Client API wrapper: session cookie auth + organization context header.
// Errors surface in the documented shape { error: { code, message, details } }.

export class ApiClientError extends Error {
  code: string
  status: number
  details: unknown[]
  constructor(code: string, message: string, status: number, details: unknown[] = []) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

let activeOrgId: string | null = null

export function setActiveOrg(id: string | null) {
  activeOrgId = id
}

// ─── Session-expiry funnel ──────────────────────────────────────────────────
// A 401 with UNAUTHENTICATED/SESSION_EXPIRED on a business endpoint means the
// cookie expired or was revoked mid-use. Without one funnel, every view
// degenerates into error states; with it, the app refreshes the session and
// returns the user to sign-in exactly once. MFA_REQUIRED (also a 401) is
// deliberately excluded — the shell owns that flow.
let onSessionExpired: (() => void) | null = null
let expiryHandledAt = 0

export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn
}

function notifySessionExpired() {
  // Parallel requests failing together must not fire N redirects/toasts.
  const now = Date.now()
  if (now - expiryHandledAt < 3000) return
  expiryHandledAt = now
  onSessionExpired?.()
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = new Headers(init?.headers)
  const hasJson = init?.json !== undefined
  if (hasJson) headers.set('content-type', 'application/json')
  if (activeOrgId && !path.startsWith('/api/auth') && !path.startsWith('/api/v1')) headers.set('x-organization-id', activeOrgId)
  // Default to POST when a JSON body is given without an explicit method —
  // fetch otherwise rejects a GET-with-body and every mutation would fail.
  const method = init?.method ?? (hasJson ? 'POST' : 'GET')
  const res = await fetch(path, {
    ...init,
    method,
    headers,
    body: hasJson ? JSON.stringify(init.json) : init?.body,
  })
  let payload: { data?: T; error?: { code: string; message: string; details?: unknown[] } } | null = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok || (payload && 'error' in payload && payload.error)) {
    const err = payload?.error
    const code = err?.code ?? `HTTP_${res.status}`
    if (
      res.status === 401 &&
      !path.startsWith('/api/auth') &&
      (code === 'UNAUTHENTICATED' || code === 'SESSION_EXPIRED' || !err)
    ) {
      notifySessionExpired()
    }
    throw new ApiClientError(code, err?.message ?? `Request failed (${res.status})`, res.status, err?.details ?? [])
  }
  // A 2xx with an empty/missing body would silently return undefined cast to
  // T and crash the caller downstream — fail loudly instead.
  if (payload?.data === undefined) {
    throw new ApiClientError('EMPTY_RESPONSE', 'The server returned no data for this request', res.status)
  }
  return payload.data as T
}

export async function apiRaw(path: string, init?: RequestInit & { json?: unknown }): Promise<Response> {
  const headers = new Headers(init?.headers)
  const hasJson = init?.json !== undefined
  if (hasJson) headers.set('content-type', 'application/json')
  if (activeOrgId && !path.startsWith('/api/auth') && !path.startsWith('/api/v1')) headers.set('x-organization-id', activeOrgId)
  return fetch(path, {
    ...init,
    method: init?.method ?? (hasJson ? 'POST' : 'GET'),
    headers,
    body: hasJson ? JSON.stringify(init.json) : init?.body,
  })
}
