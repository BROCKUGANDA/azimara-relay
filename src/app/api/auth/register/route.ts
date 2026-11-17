import { z } from 'zod'
import { ok, readJson, ApiError } from '@/lib/api'
import { registerUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const bodySchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(10).max(200),
  organizationName: z.string().min(2).max(80).optional(),
})

export async function POST(request: Request) {
  try {
    const body = await readJson(request, bodySchema)
    const rl = rateLimit(`register:${clientIp(request)}`, 30, 60 * 60_000)
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Too many registration attempts. Try again later.', 429)
    const result = await registerUser({ name: body.name, email: body.email, password: body.password })
    let organization: import('@prisma/client').Organization | null = null
    if (body.organizationName) {
      const { createOrganization } = await import('@/lib/organizations')
      organization = await createOrganization(result.user, body.organizationName)
    }
    await audit({ actorId: result.user.id, action: 'USER_REGISTERED', resourceType: 'User', resourceId: result.user.id, ip: clientIp(request) })
    return ok({
      user: { id: result.user.id, email: result.user.email, name: result.user.name, emailVerified: false },
      organization,
      emailDelivery: {
        configured: false,
        verificationToken: result.verifyToken,
        note: 'Email delivery is not configured in this environment. Use the verification link shown in the interface (development mode only).',
      },
    })
  } catch (err) {
    const { fail } = await import('@/lib/api')
    return fail(request, err)
  }
}
