import { z } from 'zod'
import { ok, readJson, fail } from '@/lib/api'
import { login, sessionCookieHeader, destroySession } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await readJson(request, bodySchema)
    const rl = rateLimit(`login:${clientIp(request)}`, 30, 15 * 60_000)
    if (!rl.allowed) {
      return Response.json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.', requestId: 'rl', details: [] } }, { status: 429 })
    }
    const result = await login(body.email, body.password, { ip: clientIp(request), userAgent: request.headers.get('user-agent') ?? undefined })
    if (result.mfaRequired && !body.mfaCode) {
      // Session exists but is not yet trusted; require TOTP before use.
      // The cookie must be set here too: the client needs the session to
      // complete the MFA challenge (mfaPassed stays false until TOTP passes).
      return ok({ mfaRequired: true, sessionToken: result.token, user: { id: result.user.id, email: result.user.email } }, { headers: { 'set-cookie': sessionCookieHeader(result.token) } })
    }
    if (result.mfaRequired && body.mfaCode) {
      const { completeMfa } = await import('@/lib/auth')
      const verified = await completeMfa(result.token, body.mfaCode)
      await audit({ actorId: result.user.id, action: 'USER_LOGIN_MFA', resourceType: 'User', resourceId: result.user.id, ip: clientIp(request) })
      return ok({ mfaRequired: false, user: { id: verified.user.id, email: verified.user.email, name: verified.user.name } }, { headers: { 'set-cookie': sessionCookieHeader(result.token) } })
    }
    await audit({ actorId: result.user.id, action: 'USER_LOGIN', resourceType: 'User', resourceId: result.user.id, ip: clientIp(request) })
    return ok({ mfaRequired: false, user: { id: result.user.id, email: result.user.email, name: result.user.name, emailVerified: !!result.user.emailVerifiedAt } }, { headers: { 'set-cookie': sessionCookieHeader(result.token) } })
  } catch (err) {
    return fail(request, err)
  }
}

export async function DELETE(request: Request) {
  try {
    const { sessionTokenFrom } = await import('@/lib/auth')
    const token = sessionTokenFrom(request)
    if (token) await destroySession(token)
    return ok({ signedOut: true }, { headers: { 'set-cookie': clearCookie() } })
  } catch (err) {
    return fail(request, err)
  }
}

function clearCookie(): string {
  return `${'relay_session'}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
