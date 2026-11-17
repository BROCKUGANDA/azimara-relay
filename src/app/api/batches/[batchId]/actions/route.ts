import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { validateBatch, executeBatch } from '@/lib/batches'

function idFrom(request: Request): string {
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
}

export const GET = route(async ({ org, request }) => {
  const batch = await db.paymentBatch.findFirst({
    where: { id: idFrom(request), orgId: org.org.id },
    include: { items: { orderBy: { rowIndex: 'asc' } }, wallet: { select: { label: true, address: true, network: true } } },
  })
  if (!batch) throw new ApiError('NOT_FOUND', 'Batch not found', 404)
  const asset = await db.supportedAsset.findUnique({ where: { mint: batch.mint } })
  const payments = await db.paymentRequest.findMany({ where: { batchId: batch.id }, select: { id: true, reference: true, status: true } })
  const paymentByItem = new Map(payments.map((p) => [p.id, p]))
  return ok({
    batch: {
      id: batch.id,
      name: batch.name,
      reference: batch.reference,
      status: batch.status,
      mint: batch.mint,
      mintSymbol: asset?.symbol ?? batch.mint,
      decimals: asset?.decimals ?? 9,
      totalBaseUnits: batch.totalBaseUnits,
      itemCount: batch.itemCount,
      failurePolicy: batch.failurePolicy,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      wallet: batch.wallet,
    },
    items: batch.items.map((i) => ({
      id: i.id,
      row: i.rowIndex,
      recipientName: i.recipientName,
      address: i.address,
      amountBaseUnits: i.amountBaseUnits,
      decimals: asset?.decimals ?? 9,
      status: i.status,
      error: i.error,
      payment: i.paymentId ? paymentByItem.get(i.paymentId) ?? { id: i.paymentId, reference: i.paymentId, status: 'CREATED' } : null,
    })),
  })
}, { permission: 'payment:read' })

const actionSchema = z.object({ action: z.enum(['validate', 'execute']) })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, actionSchema)
  const batchId = idFrom(request)
  if (body.action === 'validate') {
    const result = await validateBatch(batchId, org.org.id)
    return ok(result)
  }
  const result = await executeBatch(batchId, org.org.id, auth.user.id)
  return ok(result)
}, { permission: 'payment:execute' })
