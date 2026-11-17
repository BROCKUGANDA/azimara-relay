import { ok, fail, route } from '@/lib/api'
import { sessionTokenFrom, destroySession, clearSessionCookieHeader } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const token = sessionTokenFrom(request)
    if (token) await destroySession(token)
    return ok({ signedOut: true }, { headers: { 'set-cookie': clearSessionCookieHeader() } })
  } catch (err) {
    return fail(request, err)
  }
}

void route
