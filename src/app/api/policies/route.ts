import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { DEFAULT_RULES } from '@/lib/approvals'
import { entitlementsFor } from '@/lib/entitlements'
import { safeJsonParse } from '@/lib/safe-json'

export const GET = route(async ({ org }) => {
  const policies = await db.approvalPolicy.findMany({ where: { orgId: org.org.id }, orderBy: { version: 'desc' } })
  return ok({
    policies: policies.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      active: p.active,
      rules: safeJsonParse<unknown[]>(p.rulesJson, []),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    defaults: DEFAULT_RULES,
  })
})

const createSchema = z.object({
  name: z.string().min(1).max(80),
  rules: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        description: z.string().min(1).max(200),
        condition: z.union([
          z.object({ field: z.literal('AMOUNT_LT'), mint: z.string().optional(), amountBaseUnits: z.string().regex(/^\d+$/) }),
          z.object({ field: z.literal('AMOUNT_GTE'), mint: z.string().optional(), amountBaseUnits: z.string().regex(/^\d+$/) }),
          z.object({ field: z.literal('ALWAYS') }),
          z.object({ field: z.literal('NEW_RECIPIENT'), withinDays: z.number().int().min(0).max(365) }),
          z.object({ field: z.literal('RECIPIENT_CATEGORY'), category: z.string().min(2).max(30) }),
        ]),
        approversRequired: z.number().int().min(1).max(5),
        approverRoles: z.array(z.string()).max(6).optional(),
      }),
    )
    .min(1)
    .max(20),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, createSchema)
  const ent = entitlementsFor(org.org.plan)
  const requiresMulti = body.rules.some((r) => r.approversRequired > 1)
  // Entitlement gate runs BEFORE any write: a 402 must never leave a
  // disallowed multi-approver policy created and active.
  if (requiresMulti && !ent.multiApprover) {
    throw new ApiError('PLAN_LIMIT', 'Your plan does not include multi-approver policies; upgrade to use them.', 402)
  }
  const currentVersion = await db.approvalPolicy.aggregate({ where: { orgId: org.org.id }, _max: { version: true } })
  const nextVersion = (currentVersion._max.version ?? 0) + 1
  // Policy changes never reuse approvals issued under the previous policy.
  const policy = await db.approvalPolicy.create({
    data: { orgId: org.org.id, name: body.name, version: nextVersion, active: true, rulesJson: JSON.stringify(body.rules), createdBy: auth.user.id },
  })
  await db.approvalPolicy.updateMany({ where: { orgId: org.org.id, active: true, id: { not: policy.id } }, data: { active: false } })
  const pending = await db.paymentRequest.updateMany({
    where: { orgId: org.org.id, status: 'PENDING_APPROVAL' },
    data: { statusReason: 'POLICY_CHANGED' },
  })
  await audit({
    orgId: org.org.id,
    actorId: auth.user.id,
    action: 'POLICY_CREATED',
    resourceType: 'ApprovalPolicy',
    resourceId: policy.id,
    data: { version: nextVersion, rules: body.rules.length, pendingAffected: pending.count },
  })
  return ok({ id: policy.id, version: policy.version, active: policy.active })
}, { permission: 'policy:manage' })
