import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { PLANS, entitlementsFor, type PlanId } from '@/lib/entitlements'
import { audit } from '@/lib/audit'
import { safeJsonParse } from '@/lib/safe-json'
import { billingConfig, billingRpcHealth, createInvoiceForPlan, serializeInvoice, explorerAccount } from '@/lib/billing'

export const GET = route(async ({ org }) => {
  const subscription = await db.subscription.findUnique({ where: { orgId: org.org.id } })
  const events = await db.billingEvent.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: 20 })
  const invoices = await db.subscriptionInvoice.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: 25 })
  const ent = entitlementsFor(org.org.plan)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [paymentsThisMonth, members, activeKeys, activeWallets, collection, rpcHealth] = await Promise.all([
    db.paymentRequest.count({ where: { orgId: org.org.id, createdAt: { gte: monthStart } } }),
    db.membership.count({ where: { orgId: org.org.id } }),
    db.apiCredential.count({ where: { orgId: org.org.id, revokedAt: null } }),
    db.wallet.count({ where: { orgId: org.org.id, revokedAt: null } }),
    billingConfig(),
    billingRpcHealth(),
  ])
  return ok({
    subscription,
    plan: org.org.plan,
    planStatus: org.org.planStatus,
    entitlements: ent,
    usage: { paymentsThisMonth, members, activeKeys, activeWallets, paymentsLimit: ent.monthlyPayments, seatsLimit: ent.seats, apiKeysLimit: ent.apiKeys },
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    billingEvents: events.map((e) => ({ id: e.id, type: e.type, data: safeJsonParse(e.dataJson, {}), createdAt: e.createdAt })),
    invoices: invoices.map(serializeInvoice),
    collection: {
      enabled: true,
      network: collection.network,
      mint: collection.mint,
      decimals: collection.decimals,
      treasuryAddress: collection.treasuryAddress,
      treasuryAta: collection.treasuryAta,
      explorerTreasury: explorerAccount(collection.treasuryAddress, collection.network),
      invoiceValidityHours: collection.invoiceValidityHours,
      rpcHealth,
    },
    collectionNote: `Payment collection is live on Solana ${collection.network}: upgrade/renewal invoices settle automatically when the exact USDC amount arrives at the treasury. Treasury: ${collection.treasuryAddress}`,
  })
})

const changeSchema = z.object({ plan: z.enum(['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE']) })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, changeSchema)
  if (body.plan === org.org.plan) {
    return ok({ plan: org.org.plan, unchanged: true, entitlements: entitlementsFor(body.plan) })
  }
  const target = PLANS[body.plan]
  const current = entitlementsFor(org.org.plan)
  if (target.priceMonthlyUsd == null) {
    throw new ApiError('CUSTOM_QUOTE_REQUIRED', 'Enterprise is priced by contract — contact sales to switch.', 422)
  }

  // Downgrades (and same-price moves) stay administrative: no payment is owed
  // for fewer entitlements, so the switch applies immediately with its guard.
  const isUpgrade = target.priceMonthlyUsd > (current.priceMonthlyUsd ?? 0)
  if (isUpgrade) {
    // Real commercialization: an upgrade is provisioned only after the USDC
    // invoice settles on-chain. Nothing is granted here yet.
    const invoice = await createInvoiceForPlan(org.org.id, body.plan, 'UPGRADE', 1)
    await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'UPGRADE_INVOICE_CREATED', resourceType: 'SubscriptionInvoice', resourceId: invoice.id, data: { plan: body.plan, amountBaseUnits: invoice.amountBaseUnits } })
    return ok({ invoiceRequired: true, plan: org.org.plan, invoice: serializeInvoice(invoice) })
  }

  const previousPlan = org.org.plan
  const ent = entitlementsFor(body.plan)
  // Downgrade guard: block the switch BEFORE any write when current usage
  // already exceeds the target plan's entitlements (same usage sources the
  // plan-gating and the GET usage summary rely on).
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [paymentsThisMonth, members, activeKeys, activeWallets] = await Promise.all([
    db.paymentRequest.count({ where: { orgId: org.org.id, createdAt: { gte: monthStart } } }),
    db.membership.count({ where: { orgId: org.org.id } }),
    db.apiCredential.count({ where: { orgId: org.org.id, revokedAt: null } }),
    db.wallet.count({ where: { orgId: org.org.id, revokedAt: null } }),
  ])
  const usageExceeded =
    paymentsThisMonth > ent.monthlyPayments ||
    members > ent.seats ||
    activeKeys > ent.apiKeys ||
    activeWallets > ent.treasuryWallets
  if (usageExceeded) {
    throw new ApiError('PLAN_DOWNGRADE_BLOCKED', 'Current usage exceeds the target plan limits. Reduce usage or contact support.', 409)
  }
  await db.organization.update({ where: { id: org.org.id }, data: { plan: body.plan, planStatus: 'ACTIVE' } })
  await db.subscription.upsert({
    where: { orgId: org.org.id },
    create: { orgId: org.org.id, plan: body.plan, status: 'ACTIVE', seats: ent.seats, seatLimit: ent.seats, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    update: { plan: body.plan, status: 'ACTIVE', seats: ent.seats, seatLimit: ent.seats },
  })
  await db.billingEvent.create({ data: { orgId: org.org.id, type: 'PLAN_CHANGED', dataJson: JSON.stringify({ from: previousPlan, to: body.plan }) } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'PLAN_CHANGED', resourceType: 'Organization', resourceId: org.org.id, data: { from: previousPlan, to: body.plan } })
  return ok({ plan: body.plan, entitlements: ent })
}, { permission: 'billing:manage' })
