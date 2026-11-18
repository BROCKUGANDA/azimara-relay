import { z } from 'zod'
import { ok, readJson, fail } from '@/lib/api'
import { requestPasswordReset } from '@/lib/auth'
import { sendEmail, passwordResetEmail, isMailConfigured } from '@/lib/mailer'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { SITE_URL } from '@/lib/site'

const bodySchema = z.object({ email: z.string().email() })

// Non-enumerating: identical response whether or not the account exists.
// Unknown-email requests cost one rate-limited round-trip and reveal nothing.
export async function POST(request: Request) {
  try {
    const body = await readJson(request, bodySchema)
    const rl = rateLimit(`pwreset:${clientIp(request)}`, 10, 15 * 60_000)
    if (!rl.allowed) {
      return Response.json({ error: { code: 'RATE_LIMITED', message: 'Too many reset requests. Try again later.', requestId: 'rl', details: [] } }, { status: 429 })
    }
    const result = await requestPasswordReset(body.email)
    if (!result.userExists || !result.resetToken) {
      // Same response for unknown emails — no account enumeration.
      return ok({ status: 'submitted', emailDelivery: { configured: isMailConfigured() } })
    }
    const base = SITE_URL
    const resetUrl = `${base}/#/reset/${result.resetToken}`
    const mail = await sendEmail(passwordResetEmail(body.email, resetUrl))
    return ok({
      status: 'submitted',
      emailDelivery: {
        configured: mail.delivered || isMailConfigured(),
        delivered: mail.delivered,
        // Development fallback: with no SMTP, the link is surfaced through the
        // interface (the same honest unconfigured-channel used at registration).
        resetToken: mail.delivered ? undefined : result.resetToken,
        note: mail.delivered
          ? 'A reset link has been emailed to you.'
          : 'Email delivery is not configured in this environment. Use the reset link shown in the interface (development mode only).',
      },
    })
  } catch (err) {
    return fail(request, err)
  }
}
