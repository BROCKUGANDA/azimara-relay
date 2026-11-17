import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { db } from '@/lib/db'
import { createPayment } from '@/lib/payments'
import { audit } from '@/lib/audit'
import { parsePage, parsePageSize } from '@/lib/safe-json'

export const GET = route(async ({ org, request }) => {
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? ''
  const q = url.searchParams.get('q') ?? ''
  const walletId = url.searchParams.get('walletId') ?? ''
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 50, 100)
  const { page, skip, take } = parsePage(url.searchParams.get('page'), pageSize)
  const where = {
    orgId: org.org.id,
    ...(status && status !== 'ALL'
      ? { status: status === 'ACTIVE_EXECUTION' ? { in: ['AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST', 'PROCESSING', 'SETTLEMENT_VERIFICATION'] } : status }
      : {}),
    ...(walletId ? { sourceWalletId: walletId } : {}),
    // SQLite `contains` is case-sensitive: match lowercase and uppercase
    // variants so searches behave case-insensitively.
    ...(q
      ? {
          OR: [
            { reference: { contains: q } }, { reference: { contains: q.toLowerCase() } }, { reference: { contains: q.toUpperCase() } },
            { destination: { contains: q } }, { destination: { contains: q.toLowerCase() } }, { destination: { contains: q.toUpperCase() } },
            { reason: { contains: q } }, { reason: { contains: q.toLowerCase() } }, { reason: { contains: q.toUpperCase() } },
            { invoiceRef: { contains: q } }, { invoiceRef: { contains: q.toLowerCase() } }, { invoiceRef: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  }
  const [total, payments] = await Promise.all([
    db.paymentRequest.count({ where }),
    db.paymentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { recipient: { select: { name: true } }, wallet: { select: { label: true, address: true, network: true } }, transfer: { select: { providerTransferId: true, providerStatus: true } } },
    }),
  ])
  const assets = await db.supportedAsset.findMany()
  const assetMap = new Map(assets.map((a) => [a.mint, a]))
  return ok({
    payments: payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      type: p.type,
      status: p.status,
      statusReason: p.statusReason,
      recipientName: p.recipient?.name ?? null,
      destination: p.destination,
      mint: p.mint,
      mintSymbol: assetMap.get(p.mint)?.symbol ?? p.mint,
      amountBaseUnits: p.amountBaseUnits,
      decimals: assetMap.get(p.mint)?.decimals ?? 6,
      reason: p.reason,
      invoiceRef: p.invoiceRef,
      batchId: p.batchId,
      walletLabel: p.wallet?.label ?? null,
      source: p.source,
      approvalsRequired: p.approvalsRequired,
      providerTransferId: p.transfer?.providerTransferId ?? null,
      providerStatus: p.transfer?.providerStatus ?? null,
      createdAt: p.createdAt,
      completedAt: p.completedAt,
    })),
    total,
    page,
    pageSize,
  })
})

const createSchema = z.object({
  sourceWalletId: z.string().min(1),
  recipientId: z.string().optional(),
  destination: z.string().min(32).max(44),
  mint: z.string().min(1),
  amount: z.string().min(1).max(40),
  reason: z.string().max(500).optional(),
  invoiceRef: z.string().max(120).optional(),
  requestedExecutionAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
})

export const POST = route(async ({ org, auth, request, ip }) => {
  const body = await readJson(request, createSchema)
  const { payment, idempotentReplay } = await createPayment(org.org.id, auth.user.id, { ...body, source: 'APP' })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: idempotentReplay ? 'PAYMENT_CREATE_REPLAYED' : 'PAYMENT_CREATED', resourceType: 'PaymentRequest', resourceId: payment.id, ip })
  return ok({
    payment: { id: payment.id, reference: payment.reference, status: payment.status, approvalsRequired: payment.approvalsRequired, amountBaseUnits: payment.amountBaseUnits, mint: payment.mint },
    idempotentReplay,
  })
}, { permission: 'payment:create', rate: { max: 60, windowMs: 60_000 } })
