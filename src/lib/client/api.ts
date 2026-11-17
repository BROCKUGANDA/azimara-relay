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

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.json !== undefined) headers.set('content-type', 'application/json')
  if (activeOrgId && !path.startsWith('/api/auth') && !path.startsWith('/api/v1')) headers.set('x-organization-id', activeOrgId)
  const res = await fetch(path, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  let payload: { data?: T; error?: { code: string; message: string; details?: unknown[] } } | null = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok || (payload && 'error' in payload && payload.error)) {
    const err = payload?.error
    throw new ApiClientError(err?.code ?? `HTTP_${res.status}`, err?.message ?? `Request failed (${res.status})`, res.status, err?.details ?? [])
  }
  return payload?.data as T
}

export async function apiRaw(path: string, init?: RequestInit & { json?: unknown }): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (init?.json !== undefined) headers.set('content-type', 'application/json')
  if (activeOrgId && !path.startsWith('/api/auth')) headers.set('x-organization-id', activeOrgId)
  return fetch(path, { ...init, headers, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body })
}
