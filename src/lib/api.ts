import { z } from 'zod'
import { randomUUID } from 'crypto'
import { getAuth, getOrgContext, requireMfaPassed, type AuthContext, type OrgContext } from './auth'
import { hasPermission, type Permission } from './rbac'
import { rateLimit, clientIp } from './rate-limit'
import { db } from '@/lib/db'
import { sha256, timingSafeEqualStr } from './crypto'
import { safeJsonParse } from './safe-json'

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, { status: 200, ...init })
}

export function fail(request: Request, err: unknown): Response {
  const requestId = randomUUID()
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message, requestId, details: err.details ?? [] } },
      { status: err.status },
    )
  }
  // Tagged plain errors (thrown with { code, status } via Object.assign in
  // low-level libs to avoid importing ApiError and creating an import cycle)
  // must surface their real status, not a generic 500.
  const tagged = err as { code?: unknown; status?: unknown; message?: unknown }
  if (typeof tagged?.code === 'string' && typeof tagged?.status === 'number' && tagged.status >= 400 && tagged.status < 600) {
    return Response.json(
      { error: { code: tagged.code, message: typeof tagged.message === 'string' ? tagged.message : 'Request failed', requestId, details: [] } },
      { status: tagged.status },
    )
  }
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled_route_error', requestId, path: new URL(request.url).pathname, err: String(err) }))
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId, details: [] } },
    { status: 500 },
  )
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('VALIDATION_FAILED', 'Request validation failed', 422, parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  }
  return parsed.data
}

export type RouteContext = {
  auth: AuthContext
  org: OrgContext
  request: Request
  ip: string
}

export type AuthRouteContext = {
  auth: AuthContext
  request: Request
  ip: string
}

type RouteOptions = {
  permission?: Permission
  mfa?: boolean
  rate?: { max: number; windowMs: number }
}

/// Standard authenticated, tenant-scoped route wrapper: session → org context →
/// RBAC → rate limit → handler. Errors normalized to the documented shape.
export function route(handler: (ctx: RouteContext) => Promise<Response>, options: RouteOptions = {}) {
  return async (request: Request): Promise<Response> => {
    try {
      const ip = clientIp(request)
      if (options.rate) {
        const path = new URL(request.url).pathname
        const rl = rateLimit(`${ip}:${path}`, options.rate.max, options.rate.windowMs)
        if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Too many requests. Try again shortly.', 429, { retryAfterSec: rl.retryAfterSec })
      }
      const auth = await getAuth(request)
      if (!auth) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue', 401)
      if (options.mfa) await requireMfaPassed(auth)
      const org = await getOrgContext(auth, request)
      if (options.permission && !hasPermission(org.role, options.permission)) {
        throw new ApiError('FORBIDDEN', `Your role (${org.role}) does not permit this action`, 403, { required: options.permission })
      }
      return await handler({ auth, org, request, ip })
    } catch (err) {
      return fail(request, err)
    }
  }
}

/// Authenticated route WITHOUT organization context (profile-level actions
/// such as MFA setup that happen before an org is selected).
export function authRoute(handler: (ctx: AuthRouteContext) => Promise<Response>, options: { mfa?: boolean; rate?: { max: number; windowMs: number } } = {}) {
  return async (request: Request): Promise<Response> => {
    try {
      const ip = clientIp(request)
      if (options.rate) {
        const path = new URL(request.url).pathname
        const rl = rateLimit(`${ip}:${path}`, options.rate.max, options.rate.windowMs)
        if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Too many requests. Try again shortly.', 429, { retryAfterSec: rl.retryAfterSec })
      }
      const auth = await getAuth(request)
      if (!auth) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue', 401)
      if (options.mfa) await requireMfaPassed(auth)
      return await handler({ auth, request, ip })
    } catch (err) {
      return fail(request, err)
    }
  }
}

// ─── Developer API (key-based, for /api/v1/*) ───────────────────────────────

export type ApiKeyContext = {
  credentialId: string
  orgId: string
  scopes: string[]
}

export function credentialHasScope(ctx: ApiKeyContext, scope: string): boolean {
  return ctx.scopes.includes(scope) || ctx.scopes.includes('*')
}

export async function authenticateApiKey(request: Request, requiredScope: string): Promise<ApiKeyContext> {
  const header = request.headers.get('authorization') ?? ''
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : request.headers.get('x-api-key') ?? ''
  if (!key) throw new ApiError('UNAUTHENTICATED', 'Provide an API key via Authorization: Bearer <key>', 401)
  const cred = await db.apiCredential.findUnique({ where: { keyHash: sha256(key) } })
  if (!cred || cred.revokedAt) throw new ApiError('UNAUTHENTICATED', 'Invalid or revoked API key', 401)
  // A corrupted scopes column must fail closed (no scopes), not 500.
  const scopes = safeJsonParse<string[]>(cred.scopesJson, [])
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ApiError('FORBIDDEN', 'API key has no valid scopes', 403)
  }
  if (!credentialHasScope({ credentialId: cred.id, orgId: cred.orgId, scopes }, requiredScope)) {
    throw new ApiError('FORBIDDEN', `API key lacks required scope: ${requiredScope}`, 403)
  }
  const started = Date.now()
  ;(request as Request & { __apiLogStart?: number }).__apiLogStart = started
  return { credentialId: cred.id, orgId: cred.orgId, scopes }
}

export async function logApiAccess(ctx: ApiKeyContext, request: Request, status: number) {
  const started = (request as Request & { __apiLogStart?: number }).__apiLogStart ?? Date.now()
  try {
    await db.apiAccessLog.create({
      data: {
        credentialId: ctx.credentialId,
        path: new URL(request.url).pathname,
        method: request.method,
        status,
        latencyMs: Date.now() - started,
      },
    })
    await db.apiCredential.update({ where: { id: ctx.credentialId }, data: { lastUsedAt: new Date() } })
  } catch {
    // logging must not break responses
  }
}

/// Wraps an /api/v1/* public-API handler with scope enforcement + access logs.
export function apiRoute(requiredScope: string, handler: (request: Request, ctx: ApiKeyContext) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    let ctx: ApiKeyContext | null = null
    try {
      const ip = clientIp(request)
      const rl = rateLimit(`apikey:${ip}:${new URL(request.url).pathname}`, 120, 60_000)
      if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'API rate limit exceeded', 429)
      ctx = await authenticateApiKey(request, requiredScope)
      const res = await handler(request, ctx)
      await logApiAccess(ctx, request, res.status)
      return res
    } catch (err) {
      if (ctx) await logApiAccess(ctx, request, err instanceof ApiError ? err.status : 500)
      return fail(request, err)
    }
  }
}

export function timingSafeCompare(a: string, b: string): boolean {
  return timingSafeEqualStr(a, b)
}
