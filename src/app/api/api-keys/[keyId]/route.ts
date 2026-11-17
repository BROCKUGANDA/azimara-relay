import { ok, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

function idFrom(request: Request): string {
  // Direct-child route: /api/<resource>/<id> → last segment.
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-1)[0]
}

export const DELETE = route(async ({ org, auth, request }) => {
  const cred = await db.apiCredential.findFirst({ where: { id: idFrom(request), orgId: org.org.id } })
  if (!cred) throw new ApiError('NOT_FOUND', 'API key not found', 404)
  await db.apiCredential.update({ where: { id: cred.id }, data: { revokedAt: new Date() } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'API_KEY_REVOKED', resourceType: 'ApiCredential', resourceId: cred.id })
  return ok({ revoked: true })
}, { permission: 'apikey:manage' })
