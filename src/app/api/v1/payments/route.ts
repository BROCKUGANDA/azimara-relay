// Developer API v1 — key-authenticated programmatic access (scope-enforced).
import { z } from 'zod'
import { apiRoute, ok, readJson, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { createPayment } from '@/lib/payments'
import { audit } from '@/lib/audit'

const listSchema = z.object({})

export const GET = apiRoute('payments:read', async (request, ctx) => {
  void listSchema
  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '25')))
  const payments = await db.paymentRequest.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, reference: true, status: true, mint: true, amountBaseUnits: true, destination: true, createdAt: true, completedAt: true },
  })
  return ok({ payments, count: payments.length })
})

const createSchema = z.object({
  sourceWalletId: z.string().min(1),
  destination: z.string().min(32).max(44),
  mint: z.string().min(1),
  amount: z.string().min(1),
  reason: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(120),
})

export const POST = apiRoute('payments:create', async (request, ctx) => {
  const body = await readJson(request, createSchema)
  const wallet = await db.wallet.findFirst({ where: { id: body.sourceWalletId, orgId: ctx.orgId, revokedAt: null, ownershipStatus: 'VERIFIED' } })
  if (!wallet) throw new ApiError('INVALID_WALLET', 'sourceWalletId must reference a verified wallet of this organization', 400)
  const { payment } = await createPayment(ctx.orgId, `api:${ctx.credentialId}`, {
    sourceWalletId: wallet.id,
    destination: body.destination,
    mint: body.mint,
    amount: body.amount,
    reason: body.reason ?? null,
    source: 'API',
    idempotencyKey: body.idempotencyKey,
  })
  await audit({ orgId: ctx.orgId, actorType: 'API', action: 'API_PAYMENT_CREATED', resourceType: 'PaymentRequest', resourceId: payment.id })
  return ok({ payment: { id: payment.id, reference: payment.reference, status: payment.status, approvalsRequired: payment.approvalsRequired } })
})
