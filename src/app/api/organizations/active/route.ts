import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { permissionsFor } from '@/lib/rbac'
import { entitlementsFor } from '@/lib/entitlements'

export const GET = route(async ({ org }) => {
  const settings = JSON.parse(org.org.settingsJson) as Record<string, unknown>
  const onboarding = JSON.parse(org.org.onboardingJson) as Record<string, unknown>
  const [walletCount, recipientCount, paymentCount, memberCount, subscription, integration] = await Promise.all([
    db.wallet.count({ where: { orgId: org.org.id, revokedAt: null } }),
    db.recipient.count({ where: { orgId: org.org.id, status: 'ACTIVE' } }),
    db.paymentRequest.count({ where: { orgId: org.org.id } }),
    db.membership.count({ where: { orgId: org.org.id } }),
    db.subscription.findUnique({ where: { orgId: org.org.id } }),
    db.providerIntegration.findUnique({ where: { orgId_provider: { orgId: org.org.id, provider: 'MULTIHOPPER' } } }),
  ])
  return ok({
    id: org.org.id,
    name: org.org.name,
    slug: org.org.slug,
    status: org.org.status,
    plan: org.org.plan,
    planStatus: org.org.planStatus,
    settings,
    onboarding,
    role: org.role,
    permissions: permissionsFor(org.role),
    entitlements: entitlementsFor(org.org.plan),
    counts: { wallets: walletCount, recipients: recipientCount, payments: paymentCount },
    members: memberCount,
    subscription,
    integration: { status: integration?.status ?? 'NOT_CONFIGURED', environment: integration?.environment, configured: !!integration?.apiKeyCipher },
  })
})

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  network: z.enum(['devnet', 'mainnet-beta']).optional(),
  defaultApprovalExpiryDays: z.number().int().min(1).max(30).optional(),
})

export const PATCH = route(async ({ org, auth, request }) => {
  const body = await readJson(request, patchSchema)
  const settings = JSON.parse(org.org.settingsJson) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if (body.name) data.name = body.name
  if (body.network) settings.network = body.network
  if (body.defaultApprovalExpiryDays) settings.defaultApprovalExpiryDays = body.defaultApprovalExpiryDays
  data.settingsJson = JSON.stringify(settings)
  const updated = await db.organization.update({ where: { id: org.org.id }, data })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'ORG_SETTINGS_UPDATED', resourceType: 'Organization', resourceId: org.org.id, data: body })
  return ok({ id: updated.id, name: updated.name, settings: JSON.parse(updated.settingsJson) })
}, { permission: 'org:manage' })
