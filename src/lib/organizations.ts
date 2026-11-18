import { db } from '@/lib/db'
import { DEFAULT_RULES } from '@/lib/approvals'
import { audit } from '@/lib/audit'
import { entitlementsFor } from '@/lib/entitlements'
import { env } from './env'

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org'
  return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

export async function createOrganization(user: { id: string; name: string; email: string }, name: string) {
  const org = await db.organization.create({
    data: {
      name,
      slug: slugify(name),
      plan: 'STARTER',
      planStatus: 'TRIALING',
      // New organizations follow the deployment network (mainnet-beta by default).
      settingsJson: JSON.stringify({ network: env().SOLANA_NETWORK, requireMfa: false }),
      onboardingJson: JSON.stringify({ steps: {} }),
    },
  })
  const ent = entitlementsFor(org.plan)
  await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'OWNER' } })
  await db.approvalPolicy.create({
    data: { orgId: org.id, name: 'Default policy', version: 1, active: true, rulesJson: JSON.stringify(DEFAULT_RULES), createdBy: user.id },
  })
  await db.subscription.create({
    data: { orgId: org.id, plan: org.plan, status: 'TRIALING', seats: ent.seats, seatLimit: ent.seats, periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
  })
  await db.providerIntegration.create({
    data: { orgId: org.id, provider: 'MULTIHOPPER', environment: 'DEVNET', capabilityJson: JSON.stringify({ maxDestinations: 20 }), status: 'NOT_CONFIGURED' },
  })
  await db.billingEvent.create({ data: { orgId: org.id, type: 'TRIAL_STARTED', dataJson: JSON.stringify({ plan: 'STARTER' }) } })
  await audit({ orgId: org.id, actorId: user.id, action: 'ORGANIZATION_CREATED', resourceType: 'Organization', resourceId: org.id, data: { name } })
  return org
}
