import { z } from 'zod'
import { ok, readJson, authRoute, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { verifyPassword, hashPassword } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200),
})

/// Authenticated password change: requires the CURRENT password (a stolen
/// session alone must not be able to lock the owner out), then invalidates
/// every OTHER session — the current one stays alive so the user keeps working.
export const POST = authRoute(
  async ({ auth, request }) => {
    const rl = rateLimit(`pw-change:${clientIp(request)}`, 10, 60 * 60_000)
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Too many attempts. Try again later.', 429)
    const body = await readJson(request, schema)
    const user = await db.user.findUnique({ where: { id: auth.user.id } })
    if (!user) throw new ApiError('NOT_FOUND', 'Account not found', 404)
    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      throw new ApiError('INVALID_CREDENTIALS', 'Current password is incorrect', 401)
    }
    if (body.newPassword.length < 10) throw new ApiError('WEAK_PASSWORD', 'New password must be at least 10 characters', 400)
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(body.newPassword) } }),
      db.session.deleteMany({ where: { userId: user.id, id: { not: auth.session.id } } }),
    ])
    await audit({ actorId: user.id, action: 'PASSWORD_CHANGED', resourceType: 'User', resourceId: user.id, ip: clientIp(request) })
    return ok({ changed: true, otherSessionsRevoked: true })
  },
  { rate: { max: 12, windowMs: 3_600_000 } },
)
