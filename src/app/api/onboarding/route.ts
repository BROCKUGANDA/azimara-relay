import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { safeJsonParse } from '@/lib/safe-json'
import { env } from '@/lib/env'

const ONBOARDING_STEPS = [
  { id: 'org_profile', label: 'Organization profile configured', route: '#/app/settings' },
  { id: 'wallet', label: 'Treasury wallet connected and verified', route: '#/app/wallets' },
  { id: 'recipients', label: 'First recipient registered', route: '#/app/recipients' },
  { id: 'policy', label: 'Approval policy reviewed', route: '#/app/policies' },
  { id: 'integration', label: 'Payment routing configured', route: '#/app/integrations' },
] as const

export const GET = route(async ({ org }) => {
  const [walletCount, recipientCount, policyCount, integration] = await Promise.all([
    db.wallet.count({ where: { orgId: org.org.id, ownershipStatus: 'VERIFIED', revokedAt: null } }),
    db.recipient.count({ where: { orgId: org.org.id, status: 'ACTIVE' } }),
    db.approvalPolicy.count({ where: { orgId: org.org.id, active: true } }),
    db.providerIntegration.findUnique({ where: { orgId_provider: { orgId: org.org.id, provider: 'MULTIHOPPER' } } }),
  ])
  const settings = safeJsonParse<{ network?: string } | null>(org.org.settingsJson, {}) ?? {}
  const onboarding = safeJsonParse<{ steps?: Record<string, boolean>; dismissed?: boolean } | null>(org.org.onboardingJson, {}) ?? {}
  const auto = {
    org_profile: true,
    wallet: walletCount > 0,
    recipients: recipientCount > 0,
    policy: policyCount > 0,
    integration: !!integration?.apiKeyCipher,
  }
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: onboarding.steps?.[s.id] === true || auto[s.id] }))
  const completed = steps.filter((s) => s.done).length
  return ok({ steps, completed, total: steps.length, network: settings.network ?? env().SOLANA_NETWORK, dismissed: onboarding.dismissed ?? completed === steps.length })
})

const patchSchema = z.object({ step: z.string().min(1).max(40), done: z.boolean() })

export const PATCH = route(async ({ org, request, auth }) => {
  const body = await readJson(request, patchSchema)
  const onboarding = safeJsonParse<{ steps?: Record<string, boolean>; dismissed?: boolean } | null>(org.org.onboardingJson, {}) ?? {}
  onboarding.steps = { ...(onboarding.steps ?? {}), [body.step]: body.done }
  await db.organization.update({ where: { id: org.org.id }, data: { onboardingJson: JSON.stringify(onboarding) } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'ONBOARDING_STEP_UPDATED', resourceType: 'Organization', resourceId: org.org.id, data: body })
  return ok({ saved: true })
})
