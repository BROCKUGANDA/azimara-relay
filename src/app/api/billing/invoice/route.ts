import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { entitlementsFor, type PlanId } from '@/lib/entitlements'
import { audit } from '@/lib/audit'
import { createInvoiceForPlan, serializeInvoice } from '@/lib/billing'

const schema = z.object({
  kind: z.enum(['RENEWAL']).default('RENEWAL'),
  months: z.coerce.number().int().min(1).max(12).default(1),
})

/// Create a subscription renewal invoice for the CURRENT plan, payable in
/// USDC on-chain. Upgrades are issued by POST /api/billing with the plan body.
export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, schema)
  const plan = org.org.plan as PlanId
  const ent = entitlementsFor(plan)
  if (ent.priceMonthlyUsd == null) {
    throw new ApiError('CUSTOM_QUOTE_REQUIRED', 'Enterprise renewals are handled by contract — contact sales.', 422)
  }
  const invoice = await createInvoiceForPlan(org.org.id, plan, 'RENEWAL', body.months)
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RENEWAL_INVOICE_CREATED', resourceType: 'SubscriptionInvoice', resourceId: invoice.id, data: { plan, months: body.months, amountBaseUnits: invoice.amountBaseUnits } })
  return ok({ invoice: serializeInvoice(invoice) })
}, { permission: 'billing:manage' })

export const DELETE = route(async ({ org, auth, request }) => {
  // Cancel a pending invoice for this org (e.g. created by mistake).
  const body = await readJson(request, z.object({ invoiceId: z.string().min(1) }))
  const result = await db.subscriptionInvoice.updateMany({
    where: { id: body.invoiceId, orgId: org.org.id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
  if (result.count === 0) {
    throw new ApiError('INVOICE_NOT_PENDING', 'No pending invoice with that id for this organization.', 404)
  }
  await db.billingEvent.create({ data: { orgId: org.org.id, type: 'INVOICE_CANCELLED', dataJson: JSON.stringify({ invoiceId: body.invoiceId }) } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'INVOICE_CANCELLED', resourceType: 'SubscriptionInvoice', resourceId: body.invoiceId })
  return ok({ cancelled: true })
}, { permission: 'billing:manage' })
