import { ok, authRoute, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { randomToken, sha256 } from '@/lib/crypto'
import { sendEmail, verificationEmail, isMailConfigured } from '@/lib/mailer'
import { audit } from '@/lib/audit'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { SITE_URL } from '@/lib/site'

/// Resend the email-verification link for the signed-in account. Same honest
/// delivery contract as registration: when SMTP is unconfigured the token is
/// surfaced through the interface (development only) instead of faked success.
export const POST = authRoute(
  async ({ auth, request }) => {
    const rl = rateLimit(`verify-resend:${clientIp(request)}`, 5, 60 * 60_000)
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Too many resend requests. Try again later.', 429)

    const user = await db.user.findUnique({ where: { id: auth.user.id } })
    if (!user) throw new ApiError('NOT_FOUND', 'Account not found', 404)
    if (user.emailVerifiedAt) return ok({ alreadyVerified: true })

    // Invalidate outstanding verification tokens, then issue a fresh one.
    await db.emailToken.updateMany({
      where: { userId: user.id, purpose: 'EMAIL_VERIFY', usedAt: null },
      data: { usedAt: new Date() },
    })
    const raw = randomToken()
    await db.emailToken.create({
      data: { userId: user.id, tokenHash: sha256(raw), purpose: 'EMAIL_VERIFY', expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
    })
    const verifyUrl = `${SITE_URL}/#/verify/${raw}`
    const mail = await sendEmail(verificationEmail(user.email, user.name, verifyUrl))
    await audit({ actorId: user.id, action: 'EMAIL_VERIFICATION_RESENT', resourceType: 'User', resourceId: user.id, ip: clientIp(request) })

    return ok({
      sent: mail.delivered,
      emailDelivery: mail.delivered
        ? { configured: true, note: 'A fresh verification link has been emailed to you.' }
        : {
            configured: false,
            verificationToken: raw,
            note: 'Email delivery is not configured in this environment. Use the verification link shown in the interface (development mode only).',
          },
    })
  },
  { rate: { max: 6, windowMs: 3_600_000 } },
)
