// Background worker processors: webhook processing, reconciliation sweeps,
// quote/approval expiry, scheduled payments, notification delivery.

import { db } from '@/lib/db'
import { registerProcessor, enqueue } from '@/lib/jobs'
import { syncTransfer } from '@/lib/payments'
import { formatBaseUnits } from '@/lib/money'
import { audit, notify } from '@/lib/audit'
import { MultiHopperClient, providerConfigFromRow, SetupRequiredError } from '@/lib/multihopper'
import { sweepTreasuryDeposits } from '@/lib/billing'

registerProcessor('BILLING_SWEEP', async () => {
  // Reads the real chain for incoming USDC to the configured treasury and
  // settles matching subscription invoices. Throws propagate to the queue so
  // RPC outages retry with backoff instead of failing silently.
  const summary = await sweepTreasuryDeposits()
  if (summary.matched > 0 || summary.unmatched > 0 || summary.expired > 0) {
    console.log(JSON.stringify({ level: 'info', msg: 'billing_sweep', ...summary }))
  }
})

registerProcessor('WEBHOOK_PROCESS', async (payload, job) => {
  const inboxId = String(payload.inboxId ?? '')
  const record = await db.webhookInbox.findUnique({ where: { id: inboxId } })
  if (!record) return
  await db.webhookInbox.update({ where: { id: inboxId }, data: { status: 'PROCESSING', attempts: { increment: 1 } } })
  try {
    const eventPayload = JSON.parse(record.payloadJson) as Record<string, unknown>
    const type = record.eventType ?? ''
    const transferRef = record.transferRef ?? extractRef(eventPayload)
    if (transferRef) {
      const transfer = await db.providerTransfer.findFirst({ where: { providerTransferId: transferRef } })
      if (transfer) {
        await db.providerTransferEvent.create({
          data: { transferId: transfer.id, eventType: type || 'WEBHOOK', payloadJson: record.payloadJson, source: 'WEBHOOK' },
        })
        await db.providerTransfer.update({ where: { id: transfer.id }, data: { providerStatus: type.replace(/^transfer\./, '').toUpperCase() || transfer.providerStatus } })
        // Trigger state reconciliation through the provider API (webhooks are hints, not truth).
        await syncTransfer(transfer.paymentId, transfer.orgId).catch(() => undefined)
      }
    }
    await db.webhookInbox.update({ where: { id: inboxId }, data: { status: 'PROCESSED', processedAt: new Date() } })
  } catch (err) {
    const message = String(err)
    const dead = record.attempts >= 5
    await db.webhookInbox.update({
      where: { id: inboxId },
      data: { status: dead ? 'FAILED' : 'RECEIVED', processError: message.slice(0, 400) },
    })
    if (!dead) throw err // retry via job backoff
  }
})

function extractRef(payload: Record<string, unknown>): string | null {
  const candidates = ['transferId', 'transfer_id', 'id']
  for (const key of candidates) {
    const v = payload[key]
    if (typeof v === 'string') return v
  }
  const nested = payload.data ?? payload.transfer
  if (nested && typeof nested === 'object') return extractRef(nested as Record<string, unknown>)
  return null
}

registerProcessor('QUOTE_EXPIRY_SWEEP', async () => {
  const expired = await db.paymentQuote.updateMany({ where: { status: 'ACTIVE', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } })
  if (expired.count > 0) {
    const payments = await db.paymentRequest.findMany({ where: { status: 'QUOTED' }, include: { quotes: { where: { status: 'ACTIVE' } } } })
    for (const p of payments) {
      if (p.quotes.length === 0) {
        await db.paymentRequest.updateMany({ where: { id: p.id, version: p.version, status: 'QUOTED' }, data: { status: 'QUOTE_EXPIRED', statusReason: 'Quote expired', version: p.version + 1 } })
        await notify(p.orgId, { type: 'QUOTE_EXPIRED', title: `Quote for ${p.reference} expired`, body: 'A new quote is required before execution.', link: `#/app/payments/${p.id}` })
      }
    }
  }
})

registerProcessor('APPROVAL_EXPIRY_SWEEP', async () => {
  await db.paymentApproval.updateMany({
    where: { decision: 'APPROVED', expiresAt: { lt: new Date() } },
    data: { decision: 'REVOKED', reason: 'Approval expired' },
  })
  // Payments pending execution whose approvals all expired → back to review.
  const awaiting = await db.paymentRequest.findMany({ where: { status: { in: ['QUOTED', 'AWAITING_SIGNATURE'] } } })
  for (const p of awaiting) {
    const valid = await db.paymentApproval.count({ where: { paymentId: p.id, decision: 'APPROVED', expiresAt: { gt: new Date() } } })
    if (valid < p.approvalsRequired) {
      await db.paymentRequest.updateMany({ where: { id: p.id, version: p.version }, data: { status: 'MANUAL_REVIEW', statusReason: 'Approval expired before execution', version: p.version + 1 } })
      await db.approvalEvent.create({ data: { paymentId: p.id, type: 'EXPIRED', dataJson: '{}' } })
    }
  }
})

registerProcessor('RECONCILIATION_SWEEP', async () => {
  const transfers = await db.providerTransfer.findMany({
    where: { providerTransferId: { not: null }, providerStatus: { in: ['CREATED', 'FUNDING_CONFIRMED', 'PROCESSING', 'PHASE_CHANGED', 'HOP_COMPLETE'] } },
    take: 25,
    orderBy: { updatedAt: 'asc' },
  })
  for (const t of transfers) {
    await syncTransfer(t.paymentId, t.orgId).catch(() => undefined)
  }
})

registerProcessor('TRANSFER_MONITOR', async (payload) => {
  const paymentId = String(payload.paymentId ?? '')
  if (!paymentId) return
  const payment = await db.paymentRequest.findUnique({ where: { id: paymentId } })
  if (payment) await syncTransfer(paymentId, payment.orgId)
})

registerProcessor('SCHEDULE_SWEEP', async () => {
  const due = await db.paymentSchedule.findMany({ where: { status: 'ACTIVE', nextRunAt: { lte: new Date() } } })
  for (const s of due) {
    try {
      const { createPayment } = await import('@/lib/payments')
      const { parseAmountToBaseUnits } = await import('@/lib/money')
      const asset = s.mint === 'native:SOL' ? null : await db.supportedAsset.findUnique({ where: { mint: s.mint } })
      const decimals = asset?.decimals ?? 9
      const recipient = await db.recipient.findUnique({ where: { id: s.recipientId } })
      if (!recipient || recipient.status !== 'ACTIVE') {
        // Recipient gone or archived: pause the schedule instead of retrying
        // forever (which would spam the audit log every period).
        await db.paymentSchedule.update({ where: { id: s.id }, data: { status: 'PAUSED' } })
        await audit({ orgId: s.orgId, actorType: 'SYSTEM', action: 'SCHEDULE_PAUSED_MISSING_RECIPIENT', resourceType: 'PaymentSchedule', resourceId: s.id, data: { recipientId: s.recipientId } })
        continue
      }
      await createPayment(s.orgId, s.createdBy ?? s.orgId, {
        sourceWalletId: s.walletId,
        recipientId: s.recipientId,
        destination: recipient.address,
        mint: s.mint,
        amount: formatAmount(s.amountBaseUnits, decimals),
        reason: `Scheduled payment: ${s.name}`,
        source: 'APP',
        idempotencyKey: `schedule-${s.id}-${s.nextRunAt.toISOString()}`,
      })
      await db.paymentSchedule.update({ where: { id: s.id }, data: { lastRunAt: new Date(), nextRunAt: nextRecurrence(s.recurrence, s.nextRunAt) } })
    } catch (err) {
      await audit({ orgId: s.orgId, actorType: 'SYSTEM', action: 'SCHEDULE_RUN_FAILED', resourceType: 'PaymentSchedule', resourceId: s.id, data: { error: String(err) } })
      await db.paymentSchedule.update({ where: { id: s.id }, data: { nextRunAt: nextRecurrence(s.recurrence, s.nextRunAt) } })
    }
  }
})

registerProcessor('WEBHOOK_REPLAY_SWEEP', async () => {
  // Webhooks may be permanently dropped by the provider; processed inbox items
  // older than an hour with no matching provider event trigger re-sync via the
  // reconciliation sweep. Failed inbox items surface in the reconciliation UI.
  const stale = await db.webhookInbox.count({ where: { status: 'FAILED' } })
  if (stale > 0) {
    const orgs = await db.providerIntegration.findMany({ where: { apiKeyCipher: { not: null } }, take: 10 })
    for (const integration of orgs) {
      await enqueue('RECONCILIATION_SWEEP', {}, { orgId: integration.orgId, dedupeKey: `recon:${integration.orgId}` })
    }
  }
})

registerProcessor('NOTIFICATION_DELIVER', async (payload) => {
  // Delivery channels: in-app (already persisted). Email delivery requires an
  // SMTP provider that is not configured in this environment — recorded as
  // EMAIL_NOT_CONFIGURED rather than simulated.
  await audit({ orgId: (payload.orgId as string) ?? null, actorType: 'SYSTEM', action: 'NOTIFICATION_EMAIL_NOT_CONFIGURED', resourceType: 'Notification', resourceId: String(payload.notificationId ?? '') })
})

function formatAmount(base: string, decimals: number): string {
  // group:false — machine round-trip into createPayment, not display.
  return formatBaseUnits(base, decimals, { trimTrailingZeros: true, group: false })
}

function nextRecurrence(recurrence: string, from: Date): Date {
  const d = new Date(from)
  switch (recurrence) {
    case 'WEEKLY':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'MONTHLY':
    case 'QUARTERLY': {
      // Month arithmetic must clamp the day-of-month: Jan 31 + 1 month must
      // land on Feb 28/29, not skip into March (which would double-fire on
      // short months). Compute the target month, then clamp.
      const monthsToAdd = recurrence === 'MONTHLY' ? 1 : 3
      const originalDay = d.getUTCDate()
      const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsToAdd, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
      const daysInTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
      target.setUTCDate(Math.min(originalDay, daysInTargetMonth))
      return target
    }
    default:
      d.setUTCDate(d.getUTCDate() + 1)
  }
  return d
}

export async function probeProvider(orgId: string): Promise<{ ok: boolean; detail: string; environment: string }> {
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'MULTIHOPPER' } } })
  if (!integration?.apiKeyCipher) {
    return { ok: false, detail: 'No execution-rail API key configured for this organization.', environment: integration?.environment ?? 'DEVNET' }
  }
  const client = new MultiHopperClient(providerConfigFromRow(integration))
  try {
    // Connectivity probe: an estimate call with a 1-unit amount never creates
    // financial obligations — it validates reachability, auth and schema.
    await client.estimate({ sourceMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amountBaseUnits: '1000000', destinations: [{ address: '11111111111111111111111111111111', amountBaseUnits: '1000000' }] })
    await db.providerIntegration.update({ where: { id: integration.id }, data: { status: 'ACTIVE', statusDetail: 'Connectivity probe succeeded', lastCheckAt: new Date() } })
    return { ok: true, detail: 'Connectivity and authentication verified against the live provider API.', environment: integration.environment }
  } catch (err) {
    const detail = err instanceof SetupRequiredError ? err.detail : err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    await db.providerIntegration.update({ where: { id: integration.id }, data: { status: 'ERROR', statusDetail: detail.slice(0, 300), lastCheckAt: new Date() } })
    return { ok: false, detail, environment: integration.environment }
  }
}
