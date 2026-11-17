import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { safeJsonParse } from '@/lib/safe-json'

export const GET = route(async ({ org }) => {
  const records = await db.reconciliationRecord.findMany({ where: { orgId: org.org.id }, orderBy: { lastCheckedAt: 'desc' }, take: 200, include: { payment: { select: { id: true, reference: true, status: true } } } })
  const webhookEvents = await db.webhookInbox.findMany({ where: { provider: 'MULTIHOPPER' }, orderBy: { receivedAt: 'desc' }, take: 30 })
  const providerTransfers = await db.providerTransfer.findMany({ where: { orgId: org.org.id }, orderBy: { updatedAt: 'desc' }, take: 30, include: { payment: { select: { reference: true } } } })
  return ok({
    records: records.map((r) => ({
      id: r.id,
      payment: r.payment,
      providerRef: r.providerRef,
      providerStatus: r.providerStatus,
      state: r.state,
      detail: r.detail,
      expectedBase: r.expectedBase,
      observedBase: r.observedBase,
      feeDeltaBase: r.feeDeltaBase,
      chainEvidence: safeJsonParse<unknown>(r.chainEvidenceJson, null),
      lastCheckedAt: r.lastCheckedAt,
    })),
    webhookEvents: webhookEvents.map((w) => ({
      id: w.id,
      eventType: w.eventType,
      signatureValid: w.signatureValid,
      status: w.status,
      transferRef: w.transferRef,
      attempts: w.attempts,
      receivedAt: w.receivedAt,
      processedAt: w.processedAt,
      error: w.processError,
    })),
    providerTransfers: providerTransfers.map((t) => ({
      id: t.id,
      externalId: t.externalId,
      providerTransferId: t.providerTransferId,
      providerStatus: t.providerStatus,
      internalPhase: t.internalPhase,
      paymentReference: t.payment?.reference ?? null,
      updatedAt: t.updatedAt,
    })),
    summary: {
      matched: records.filter((r) => r.state === 'MATCHED').length,
      mismatched: records.filter((r) => r.state === 'MISMATCH').length,
      unreconciled: records.filter((r) => r.state === 'UNRECONCILED').length,
      failed: records.filter((r) => r.state === 'FAILED').length,
      webhookRejected: webhookEvents.filter((w) => !w.signatureValid || w.status === 'REJECTED').length,
    },
  })
})
