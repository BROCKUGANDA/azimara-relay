import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { db } from '@/lib/db'

export const GET = route(async ({ org, request }) => {
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? ''
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')))
  const where = { orgId: org.org.id, ...(status && status !== 'ALL' ? { status } : {}) }
  const [total, batches] = await Promise.all([
    db.paymentBatch.count({ where }),
    db.paymentBatch.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { wallet: { select: { label: true } } } }),
  ])
  const assets = await db.supportedAsset.findMany()
  const assetMap = new Map(assets.map((a) => [a.mint, a]))
  return ok({
    batches: batches.map((b) => ({
      id: b.id,
      name: b.name,
      reference: b.reference,
      status: b.status,
      mint: b.mint,
      mintSymbol: assetMap.get(b.mint)?.symbol ?? b.mint,
      totalBaseUnits: b.totalBaseUnits,
      decimals: assetMap.get(b.mint)?.decimals ?? 6,
      itemCount: b.itemCount,
      walletLabel: b.wallet.label,
      failurePolicy: b.failurePolicy,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    total,
    page,
    pageSize,
  })
})

const createSchema = z.object({
  name: z.string().min(1).max(80),
  sourceWalletId: z.string().min(1),
  mint: z.string().min(1),
  failurePolicy: z.enum(['ISOLATE', 'HALT']).default('ISOLATE'),
  items: z
    .array(
      z.object({
        recipientId: z.string().optional(),
        recipientName: z.string().min(1).max(120),
        address: z.string().min(32).max(44),
        amount: z.string().min(1),
      }),
    )
    .min(1)
    .max(2000),
  idempotencyKey: z.string().min(8).max(120).optional(),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, createSchema)
  const { createBatch } = await import('@/lib/batches')
  const batch = await createBatch(org.org.id, auth.user.id, body)
  return ok(batch)
}, { permission: 'payment:create', rate: { max: 30, windowMs: 60_000 } })
