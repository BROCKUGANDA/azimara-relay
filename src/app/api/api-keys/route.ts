import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { randomToken, sha256 } from '@/lib/crypto'
import { entitlementsFor, assertWithinLimit } from '@/lib/entitlements'

export const GET = route(async ({ org }) => {
  const keys = await db.apiCredential.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' } })
  return ok({
    keys: keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, environment: k.environment, scopes: JSON.parse(k.scopesJson), lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt, createdAt: k.createdAt })),
    entitlement: { apiKeys: entitlementsFor(org.org.plan).apiKeys, apiAccess: entitlementsFor(org.org.plan).apiAccess },
  })
})

const createSchema = z.object({
  name: z.string().min(1).max(60),
  environment: z.enum(['TEST', 'LIVE']),
  scopes: z.array(z.enum(['payments:read', 'payments:create', 'recipients:read', 'recipients:create', 'treasury:read'])).min(1),
})

export const POST = route(async ({ org, auth, request }) => {
  const ent = entitlementsFor(org.org.plan)
  if (!ent.apiAccess) throw new ApiError('PLAN_LIMIT', 'API access is not included in your plan. Upgrade to Growth or above.', 402)
  const body = await readJson(request, createSchema)
  const active = await db.apiCredential.count({ where: { orgId: org.org.id, revokedAt: null } })
  assertWithinLimit(ent, 'apiKeys', active)
  const prefix = body.environment === 'LIVE' ? 'rk_live_' : 'rk_test_'
  const secret = randomToken(24)
  const fullKey = `${prefix}${secret}`
  const credential = await db.apiCredential.create({
    data: {
      orgId: org.org.id,
      name: body.name,
      prefix,
      keyHash: sha256(fullKey),
      scopesJson: JSON.stringify(body.scopes),
      environment: body.environment,
      createdBy: auth.user.id,
    },
  })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'API_KEY_CREATED', resourceType: 'ApiCredential', resourceId: credential.id, data: { environment: body.environment, scopes: body.scopes } })
  return ok({ id: credential.id, key: fullKey, note: 'Copy this key now — it is stored only as a hash and cannot be retrieved again.' })
}, { permission: 'apikey:manage' })
