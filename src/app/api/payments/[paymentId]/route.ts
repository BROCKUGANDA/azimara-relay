import { ok, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { materialPayload } from '@/lib/approvals'
import { STATUS_META } from '@/lib/state-machine'

function idFrom(request: Request): string {
  // Direct-child route: /api/<resource>/<id> → last segment.
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-1)[0]
}

export const GET = route(async ({ org, request, auth }) => {
  // Accept either the internal ID or the human reference (PMT-XXXXXX) so
  // deep links from exports and support conversations both work.
  const key = idFrom(request)
  const payment = await db.paymentRequest.findFirst({
    where: { orgId: org.org.id, OR: [{ id: key }, { reference: key }] },
    include: {
      recipient: true,
      wallet: true,
      transfer: true,
      quotes: { orderBy: { createdAt: 'desc' } },
      approvals: { include: { approver: { select: { name: true, email: true } } } },
      approvalsLog: { orderBy: { createdAt: 'asc' } },
      signatures: { orderBy: { submittedAt: 'asc' } },
      fees: true,
      settlement: true,
      batch: { select: { id: true, name: true, reference: true } },
    },
  })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  const asset = await db.supportedAsset.findUnique({ where: { mint: payment.mint } })
  const network = payment.wallet?.network ?? 'devnet'
  const activeQuote = payment.quotes.find((q) => q.status === 'ACTIVE') ?? payment.quotes[0] ?? null
  const hash = materialPayload(payment)
  const lifecycle = [
    ...payment.approvalsLog.map((e) => ({ at: e.createdAt, kind: 'APPROVAL', type: e.type, detail: e.dataJson ? JSON.parse(e.dataJson) : {} })),
    ...payment.signatures.map((s) => ({ at: s.submittedAt, kind: 'SIGNATURE', type: s.purpose, detail: { signature: s.signature } })),
    ...(payment.transfer ? [{ at: payment.transfer.createdAt, kind: 'PROVIDER', type: 'TRANSFER_CREATED', detail: { externalId: payment.transfer.externalId, providerTransferId: payment.transfer.providerTransferId } }] : []),
    ...(payment.settlement ? [{ at: payment.settlement.reconciledAt ?? payment.createdAt, kind: 'SETTLEMENT', type: 'SETTLEMENT_RECORDED', detail: { providerStatus: payment.settlement.providerStatus, chainStatus: payment.settlement.chainStatus, signature: payment.settlement.signature } }] : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const myApprovals = payment.approvals.filter((a) => a.approverId === auth.user.id && ['APPROVED', 'REJECTED'].includes(a.decision))
  return ok({
    payment: {
      id: payment.id,
      reference: payment.reference,
      type: payment.type,
      status: payment.status,
      statusReason: payment.statusReason,
      source: payment.source,
      destination: payment.destination,
      mint: payment.mint,
      mintSymbol: asset?.symbol ?? payment.mint,
      decimals: asset?.decimals ?? 6,
      amountBaseUnits: payment.amountBaseUnits,
      reason: payment.reason,
      invoiceRef: payment.invoiceRef,
      approvalsRequired: payment.approvalsRequired,
      createdBy: payment.createdBy,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      completedAt: payment.completedAt,
      batch: payment.batch,
      lastError: payment.lastError,
    },
    wallet: payment.wallet ? { id: payment.wallet.id, label: payment.wallet.label, address: payment.wallet.address, network } : null,
    recipient: payment.recipient ? { id: payment.recipient.id, name: payment.recipient.name, address: payment.recipient.address, registeredAt: payment.recipient.createdAt } : null,
    quote: activeQuote
      ? {
          id: activeQuote.id,
          status: activeQuote.status,
          principalBase: activeQuote.principalBase,
          feePctBps: activeQuote.feePctBps,
          flatChargesBase: activeQuote.flatChargesBase,
          perHopBase: activeQuote.perHopBase,
          networkCostBase: activeQuote.networkCostBase,
          screeningBase: activeQuote.screeningBase,
          recipientGetsBase: activeQuote.recipientGetsBase,
          expiresAt: activeQuote.expiresAt,
          rawResponse: JSON.parse(activeQuote.responseJson),
        }
      : null,
    approvals: payment.approvals.map((a) => ({ id: a.id, approverName: a.approver.name, approverEmail: a.approver.email, decision: a.decision, reason: a.reason, payloadHashValid: a.payloadHash === hash, createdAt: a.createdAt, expiresAt: a.expiresAt })),
    payloadHash: hash,
    canApprove: payment.status === 'PENDING_APPROVAL' && myApprovals.length === 0,
    hasDecided: myApprovals.length > 0,
    providerTransfer: payment.transfer
      ? {
          id: payment.transfer.id,
          externalId: payment.transfer.externalId,
          providerTransferId: payment.transfer.providerTransferId,
          providerStatus: payment.transfer.providerStatus,
          internalPhase: payment.transfer.internalPhase,
          progress: payment.transfer.progressJson ? JSON.parse(payment.transfer.progressJson) : null,
        }
      : null,
    signatures: payment.signatures.map((s) => ({ id: s.id, purpose: s.purpose, signature: s.signature, confirmedAt: s.confirmedAt, submittedAt: s.submittedAt })),
    fees: payment.fees.map((f) => ({ kind: f.kind, amountBaseUnits: f.amountBaseUnits, basis: f.basis })),
    settlement: payment.settlement,
    lifecycle,
    statusMeta: STATUS_META[payment.status] ?? { label: payment.status, tone: 'grey', meaning: '' },
  })
}, { permission: 'payment:read' })
