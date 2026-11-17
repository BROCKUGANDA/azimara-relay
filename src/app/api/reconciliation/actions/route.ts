import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { syncTransfer } from '@/lib/payments'
import { audit } from '@/lib/audit'

const schema = z.object({
  action: z.enum(['sync_payment', 'resync_all', 'resolve']),
  paymentId: z.string().optional(),
  recordId: z.string().optional(),
  resolution: z.enum(['MATCHED', 'MANUALLY_RESOLVED', 'FAILED']).optional(),
  note: z.string().max(1000).optional(),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, schema)
  if (body.action === 'sync_payment') {
    if (!body.paymentId) throw new ApiError('VALIDATION_FAILED', 'paymentId required', 422)
    const payment = await db.paymentRequest.findFirst({ where: { id: body.paymentId, orgId: org.org.id } })
    if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
    const result = await syncTransfer(payment.id, org.org.id)
    await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECONCILIATION_SYNCED', resourceType: 'PaymentRequest', resourceId: payment.id, data: result ?? {} })
    return ok(result ?? {})
  }
  if (body.action === 'resync_all') {
    const transfers = await db.providerTransfer.findMany({ where: { orgId: org.org.id, providerTransferId: { not: null } }, take: 25, orderBy: { updatedAt: 'asc' } })
    const results: { paymentId: string; providerStatus?: string; error?: string }[] = []
    for (const t of transfers) {
      const r = await syncTransfer(t.paymentId, org.org.id)
      results.push({ paymentId: t.paymentId, providerStatus: r?.providerStatus ?? undefined, error: r && 'error' in r ? String(r.error) : undefined })
    }
    await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECONCILIATION_RESYNC_ALL', resourceType: 'Organization', resourceId: org.org.id, data: { count: results.length } })
    return ok({ checked: results.length, results })
  }
  if (!body.recordId || !body.resolution || !body.note) throw new ApiError('VALIDATION_FAILED', 'recordId, resolution and note are required for manual resolution', 422)
  const record = await db.reconciliationRecord.findFirst({ where: { id: body.recordId, orgId: org.org.id } })
  if (!record) throw new ApiError('NOT_FOUND', 'Reconciliation record not found', 404)
  await db.reconciliationRecord.update({ where: { id: record.id }, data: { state: body.resolution, detail: `Manual resolution: ${body.note}` } })
  if (body.resolution === 'MATCHED' && record.paymentId) {
    const payment = await db.paymentRequest.findUnique({ where: { id: record.paymentId } })
    if (payment && ['SETTLEMENT_VERIFICATION', 'RECONCILIATION_REQUIRED'].includes(payment.status)) {
      await db.paymentRequest.update({ where: { id: payment.id }, data: { status: 'COMPLETED', statusReason: 'Manually reconciled', completedAt: new Date(), version: payment.version + 1 } })
    }
  }
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECONCILIATION_MANUAL_RESOLVE', resourceType: 'ReconciliationRecord', resourceId: record.id, data: { resolution: body.resolution, note: body.note } })
  return ok({ resolved: true })
}, { permission: 'reconciliation:manage' })
