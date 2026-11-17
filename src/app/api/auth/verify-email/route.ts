import { z } from 'zod'
import { ok, readJson, fail } from '@/lib/api'
import { consumeEmailToken } from '@/lib/auth'
import { audit } from '@/lib/audit'

const schema = z.object({ token: z.string().min(10) })

export async function POST(request: Request) {
  try {
    const body = await readJson(request, schema)
    const user = await consumeEmailToken(body.token, 'EMAIL_VERIFY')
    if (!user) {
      return Response.json({ error: { code: 'INVALID_TOKEN', message: 'Verification link is invalid or expired.', requestId: '', details: [] } }, { status: 400 })
    }
    await audit({ actorId: user.id, action: 'EMAIL_VERIFIED', resourceType: 'User', resourceId: user.id })
    return ok({ verified: true, email: user.email })
  } catch (err) {
    return fail(request, err)
  }
}
