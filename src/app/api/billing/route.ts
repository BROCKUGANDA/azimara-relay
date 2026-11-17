import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { db } from '@/lib/db'
import { PLANS, entitlementsFor } from '@/lib/entitlements'
import { audit } from '@/lib/audit'

export const GET = route(async ({ org }) => {
  const subscription = await db.subscription.findUnique({ where: { orgId: org.org.id } })
  const events = await db.billingEvent.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: 20 })
  const ent = entitlementsFor(org.org.plan)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [paymentsThisMonth, members, activeKeys] = await Promise.all([
    db.paymentRequest.count({ where: { orgId: org.org.id, createdAt: { gte: monthStart } } }),
    db.membership.count({ where: { orgId: org.org.id } }),
    db.apiCredential.count({ where: { orgId: org.org.id, revokedAt: null } }),
  ])
  return ok({
    subscription,
    plan: org.org.plan,
    planStatus: org.org.planStatus,
    entitlements: ent,
    usage: { paymentsThisMonth, members, activeKeys, paymentsLimit: ent.monthlyPayments, seatsLimit: ent.seats, apiKeysLimit: ent.apiKeys },
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    billingEvents: events.map((e) => ({ id: e.id, type: e.type, data: JSON.parse(e.dataJson), createdAt: e.createdAt })),
    collectionNote: 'Payment collection is not configured (no billing provider connected). Plan switches take effect immediately and are recorded as billing events; connect a billing provider before charging real customers.',
  })
})

const changeSchema = z.object({ plan: z.enum(['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE']) })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, changeSchema)
  const previousPlan = org.org.plan
  await db.organization.update({ where: { id: org.org.id }, data: { plan: body.plan } })
  const ent = entitlementsFor(body.plan)
  await db.subscription.upsert({
    where: { orgId: org.org.id },
    create: { orgId: org.org.id, plan: body.plan, status: 'ACTIVE', seatLimit: ent.seats, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    update: { plan: body.plan, status: 'ACTIVE', seatLimit: ent.seats },
  })
  await db.billingEvent.create({ data: { orgId: org.org.id, type: 'PLAN_CHANGED', dataJson: JSON.stringify({ from: previousPlan, to: body.plan }) } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'PLAN_CHANGED', resourceType: 'Organization', resourceId: org.org.id, data: { from: previousPlan, to: body.plan } })
  return ok({ plan: body.plan, entitlements: ent })
}, { permission: 'billing:manage' })
