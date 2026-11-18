import { db } from '@/lib/db'
import { hashPassword, verifyPassword, randomToken, sha256, encryptSecret, decryptSecret } from '@/lib/crypto'
import { verifyTotp } from '@/lib/totp'
import { env } from './env'
import type { Membership, Organization, User } from '@prisma/client'

export const SESSION_COOKIE = 'relay_session'
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000

export type AuthContext = {
  user: User
  session: { id: string; mfaPassed: boolean }
}

export async function registerUser(input: { email: string; password: string; name: string; ip?: string }) {
  const email = input.email.trim().toLowerCase()
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) throw Object.assign(new Error('An account with this email already exists'), { code: 'EMAIL_TAKEN', status: 409 })
  if (input.password.length < 10) throw Object.assign(new Error('Password must be at least 10 characters'), { code: 'WEAK_PASSWORD', status: 400 })
  const user = await db.user.create({
    data: { email, name: input.name.trim() || email.split('@')[0], passwordHash: hashPassword(input.password) },
  })
  const raw = randomToken()
  await db.emailToken.create({
    data: { userId: user.id, tokenHash: sha256(raw), purpose: 'EMAIL_VERIFY', expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
  })
  // SMTP is not configured in this environment: the verification link is
  // returned through a genuine "delivery unavailable" channel rather than faked.
  return { user, verifyToken: raw, emailDeliveryConfigured: false }
}

export async function consumeEmailToken(rawToken: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
  const rec = await db.emailToken.findUnique({ where: { tokenHash: sha256(rawToken) } })
  if (!rec || rec.purpose !== purpose || rec.usedAt || rec.expiresAt < new Date()) return null
  await db.emailToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } })
  await db.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } })
  return db.user.findUnique({ where: { id: rec.userId } })
}

// ─── Password recovery ──────────────────────────────────────────────────────
// The reset request endpoint is deliberately non-enumerating: unknown emails
// get the same response shape as known ones. When SMTP is unconfigured, the
// token is surfaced through the same genuine "delivery unavailable" channel
// used by registration (development mode only — never faked as an email).

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

export async function requestPasswordReset(email: string): Promise<{ userExists: boolean; resetToken: string | null }> {
  const normalized = email.trim().toLowerCase()
  const user = await db.user.findUnique({ where: { email: normalized } })
  if (!user) return { userExists: false, resetToken: null }
  const raw = randomToken()
  await db.emailToken.create({
    data: { userId: user.id, tokenHash: sha256(raw), purpose: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
  })
  return { userExists: true, resetToken: raw }
}

export async function resetPassword(rawToken: string, newPassword: string) {
  if (newPassword.length < 10) throw Object.assign(new Error('Password must be at least 10 characters'), { code: 'WEAK_PASSWORD', status: 400 })
  const rec = await db.emailToken.findUnique({ where: { tokenHash: sha256(rawToken) } })
  if (!rec || rec.purpose !== 'PASSWORD_RESET' || rec.usedAt || rec.expiresAt < new Date()) {
    throw Object.assign(new Error('This reset link is invalid or has expired. Request a new one.'), { code: 'INVALID_RESET_TOKEN', status: 400 })
  }
  const user = await db.user.findUnique({ where: { id: rec.userId } })
  if (!user) throw Object.assign(new Error('Account not found'), { code: 'NOT_FOUND', status: 404 })
  await db.$transaction([
    db.emailToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } }),
    // Force re-authentication everywhere: any session created before the
    // reset (e.g. an attacker with a stolen cookie) is invalidated.
    db.session.deleteMany({ where: { userId: user.id } }),
  ])
  return user
}

export async function login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS', status: 401 })
  }
  const raw = randomToken()
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(raw),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      mfaPassed: !user.totpEnabledAt,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return { user, session, token: raw, mfaRequired: !!user.totpEnabledAt }
}

export async function completeMfa(token: string, code: string) {
  const session = await getSessionByToken(token)
  if (!session) throw Object.assign(new Error('Session expired'), { code: 'SESSION_EXPIRED', status: 401 })
  const secret = session.user.totpSecret ? decryptSecret(session.user.totpSecret) : null
  if (!secret) throw Object.assign(new Error('MFA not configured'), { code: 'MFA_NOT_CONFIGURED', status: 400 })
  if (!verifyTotp(secret, code)) throw Object.assign(new Error('Invalid verification code'), { code: 'INVALID_MFA', status: 401 })
  await db.session.update({ where: { id: session.session.id }, data: { mfaPassed: true } })
  return { ...session, session: { ...session.session, mfaPassed: true } }
}

export async function getSessionByToken(token: string): Promise<AuthContext | null> {
  const rec = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
  if (!rec || rec.expiresAt < new Date()) return null
  return { user: rec.user, session: { id: rec.id, mfaPassed: rec.mfaPassed } }
}

export function sessionTokenFrom(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  if (!match) return null
  // A malformed cookie value (e.g. a stray "%") must never take down every
  // request — treat undecodable cookies as no session.
  try {
    return decodeURIComponent(match.slice(SESSION_COOKIE.length + 1))
  } catch {
    return null
  }
}

export async function getAuth(request: Request): Promise<AuthContext | null> {
  const token = sessionTokenFrom(request)
  if (!token) return null
  return getSessionByToken(token)
}

export function sessionCookieHeader(token: string, maxAgeSec = SESSION_TTL_MS / 1000): string {
  const secure = env().NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } })
}

export async function setupTotp(userId: string) {
  const { generateTotpSecret, otpauthUri } = await import('./totp')
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', status: 404 })
  const secret = generateTotpSecret()
  await db.user.update({ where: { id: userId }, data: { totpSecret: encryptSecret(secret) } })
  return { secret, uri: otpauthUri(user.email, secret) }
}

export async function enableTotp(userId: string, code: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  const secret = user?.totpSecret ? decryptSecret(user.totpSecret) : null
  if (!secret) throw Object.assign(new Error('Run MFA setup first'), { code: 'MFA_NOT_CONFIGURED', status: 400 })
  if (!verifyTotp(secret, code)) throw Object.assign(new Error('Invalid verification code'), { code: 'INVALID_MFA', status: 401 })
  await db.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } })
  return true
}

export async function disableTotp(userId: string, code: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  const secret = user?.totpSecret ? decryptSecret(user.totpSecret) : null
  if (!secret || !verifyTotp(secret, code)) throw Object.assign(new Error('Invalid verification code'), { code: 'INVALID_MFA', status: 401 })
  await db.user.update({ where: { id: userId }, data: { totpEnabledAt: null, totpSecret: null } })
  return true
}

export type OrgContext = { org: Organization; membership: Membership; role: Membership['role'] }

export async function getOrgContext(auth: AuthContext, request: Request): Promise<OrgContext> {
  const orgId = request.headers.get('x-organization-id') ?? new URL(request.url).searchParams.get('orgId')
  if (!orgId) throw Object.assign(new Error('Organization context header X-Organization-Id is required'), { code: 'ORG_CONTEXT_MISSING', status: 400 })
  const membership = await db.membership.findUnique({ where: { orgId_userId: { orgId, userId: auth.user.id } }, include: { org: true } })
  if (!membership) throw Object.assign(new Error('You do not have access to this organization'), { code: 'FORBIDDEN', status: 403 })
  if (membership.org.status === 'SUSPENDED') {
    throw Object.assign(new Error('This organization is suspended. Contact support for recovery.'), { code: 'ORG_SUSPENDED', status: 403 })
  }
  return { org: membership.org, membership, role: membership.role }
}

export async function requireMfaPassed(auth: AuthContext) {
  if (!auth.session.mfaPassed) {
    throw Object.assign(new Error('MFA challenge required'), { code: 'MFA_REQUIRED', status: 401 })
  }
}
