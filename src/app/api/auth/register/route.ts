import { z } from 'zod'
import { ok, readJson, ApiError, fail } from '@/lib/api'
import { registerUser } from '@/lib/auth'
import { sendEmail, verificationEmail, isMailConfigured } from '@/lib/mailer'
import { audit } from '@/lib/audit'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { SITE_URL } from '@/lib/site'

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
    const verifyUrl = `${SITE_URL}/#/verify/${result.verifyToken}`
    const mail = await sendEmail(verificationEmail(result.user.email, result.user.name, verifyUrl))
    return ok({
      user: { id: result.user.id, email: result.user.email, name: result.user.name, emailVerified: false },
      organization,
      emailDelivery: mail.delivered
        ? { configured: true, delivered: true, note: 'A verification link has been emailed to you.' }
        : {
            configured: false,
            verificationToken: result.verifyToken,
            note: 'Email delivery is not configured in this environment. Use the verification link shown in the interface (development mode only).',
          },
    })
  } catch (err) {
    return fail(request, err)
  }
}
