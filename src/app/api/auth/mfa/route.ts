import { z } from 'zod'
import { ok, readJson, authRoute, ApiError } from '@/lib/api'
import { setupTotp, enableTotp, disableTotp, completeMfa, sessionTokenFrom } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

const schema = z.object({
  action: z.enum(['setup', 'enable', 'disable', 'challenge']),
  code: z.string().optional(),
})

export const POST = authRoute(
  async ({ auth, request }) => {
    const body = await readJson(request, schema)
    const rl = rateLimit(`mfa:${clientIp(request)}`, 20, 10 * 60_000)
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Too many MFA attempts', 429)
    switch (body.action) {
      case 'setup': {
        const setup = await setupTotp(auth.user.id)
        return ok({ secret: setup.secret, otpauthUri: setup.uri })
      }
      case 'enable': {
        if (!body.code) throw new ApiError('VALIDATION_FAILED', 'Verification code required', 422)
        await enableTotp(auth.user.id, body.code)
        await audit({ actorId: auth.user.id, action: 'MFA_ENABLED', resourceType: 'User', resourceId: auth.user.id })
        return ok({ enabled: true })
      }
      case 'disable': {
        if (!body.code) throw new ApiError('VALIDATION_FAILED', 'Verification code required', 422)
        await disableTotp(auth.user.id, body.code)
        await audit({ actorId: auth.user.id, action: 'MFA_DISABLED', resourceType: 'User', resourceId: auth.user.id })
        return ok({ enabled: false })
      }
      case 'challenge': {
        const token = sessionTokenFrom(request)
        if (!token) throw new ApiError('UNAUTHENTICATED', 'No active session', 401)
        if (!body.code) throw new ApiError('VALIDATION_FAILED', 'Verification code required', 422)
        await completeMfa(token, body.code)
        await audit({ actorId: auth.user.id, action: 'MFA_CHALLENGE_PASSED', resourceType: 'User', resourceId: auth.user.id })
        return ok({ mfaPassed: true })
      }
    }
  },
  { rate: { max: 30, windowMs: 600_000 } },
)
