import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { encryptSecret } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { validateApiKeyForEnvironment, MULTIHOOPER_BASE_URLS } from '@/lib/multihopper'
import { probeProvider } from '@/lib/worker-processor'

export const GET = route(async ({ org }) => {
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId: org.org.id, provider: 'MULTIHOPPER' } } })
  return ok({
    environment: integration?.environment ?? 'DEVNET',
    configured: !!integration?.apiKeyCipher,
    apiKeyLast4: integration?.apiKeyLast4 ?? null,
    webhookConfigured: !!integration?.webhookSecretCipher,
    status: integration?.status ?? 'NOT_CONFIGURED',
    statusDetail: integration?.statusDetail ?? null,
    lastCheckAt: integration?.lastCheckAt ?? null,
    baseUrl: MULTIHOOPER_BASE_URLS[(integration?.environment ?? 'DEVNET') as 'DEVNET' | 'PRODUCTION'],
    webhookUrl: '/api/webhooks/multihopper',
  })
})

const configSchema = z.object({
  environment: z.enum(['DEVNET', 'PRODUCTION']),
  apiKey: z.string().min(8).max(200),
  webhookSecret: z.string().max(200).optional(),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, configSchema)
  // Environments are isolated: a test key can never drive production.
  const check = validateApiKeyForEnvironment(body.apiKey, body.environment)
  if (!check.ok) throw new ApiError('INVALID_API_KEY', check.reason ?? 'Invalid MultiHopper key', 400)
  const last4 = body.apiKey.slice(-4)
  await db.providerIntegration.upsert({
    where: { orgId_provider: { orgId: org.org.id, provider: 'MULTIHOPPER' } },
    create: {
      orgId: org.org.id,
      provider: 'MULTIHOPPER',
      environment: body.environment,
      apiKeyCipher: encryptSecret(body.apiKey),
      apiKeyLast4: last4,
      webhookSecretCipher: body.webhookSecret ? encryptSecret(body.webhookSecret) : null,
      status: 'ACTIVE',
      statusDetail: 'Configured. Run the connectivity probe to verify against the live service.',
      capabilityJson: JSON.stringify({ maxDestinations: 20 }),
    },
    update: {
      environment: body.environment,
      apiKeyCipher: encryptSecret(body.apiKey),
      apiKeyLast4: last4,
      ...(body.webhookSecret ? { webhookSecretCipher: encryptSecret(body.webhookSecret) } : {}),
      status: 'ACTIVE',
      statusDetail: 'Configured. Run the connectivity probe to verify against the live service.',
    },
  })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'MULTIHOPPER_CONFIGURED', resourceType: 'ProviderIntegration', data: { environment: body.environment, last4 } })
  return ok({ configured: true, environment: body.environment })
}, { permission: 'org:manage' })

const probeSchema = z.object({ action: z.literal('probe') })

export const PUT = route(async ({ org, auth, request }) => {
  const body = await readJson(request, probeSchema)
  if (body.action !== 'probe') throw new ApiError('VALIDATION_FAILED', 'Unsupported action', 422)
  const result = await probeProvider(org.org.id)
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'MULTIHOPPER_PROBE', resourceType: 'ProviderIntegration', data: result })
  return ok(result)
}, { permission: 'org:manage' })

export const DELETE = route(async ({ org, auth }) => {
  await db.providerIntegration.updateMany({ where: { orgId: org.org.id, provider: 'MULTIHOPPER' }, data: { apiKeyCipher: null, apiKeyLast4: null, webhookSecretCipher: null, status: 'NOT_CONFIGURED', statusDetail: 'Credentials removed' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'MULTIHOPPER_CREDENTIALS_REMOVED', resourceType: 'ProviderIntegration' })
  return ok({ removed: true })
}, { permission: 'org:manage' })
