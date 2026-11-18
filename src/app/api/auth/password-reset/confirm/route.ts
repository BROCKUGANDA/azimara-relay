import { z } from 'zod'
import { ok, readJson, fail } from '@/lib/api'
import { resetPassword } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const bodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10).max(200),
})

export async function POST(request: Request) {
  try {
    const body = await readJson(request, bodySchema)
    const rl = rateLimit(`pwconfirm:${clientIp(request)}`, 15, 15 * 60_000)
    if (!rl.allowed) {
      return Response.json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.', requestId: 'rl', details: [] } }, { status: 429 })
    }
    const user = await resetPassword(body.token, body.password)
    return ok({
      reset: true,
      email: user.email,
      note: 'Password updated. All previous sessions were signed out — sign in with your new password.',
    })
  } catch (err) {
    return fail(request, err)
  }
}
