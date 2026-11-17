import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { parsePage, parsePageSize } from '@/lib/safe-json'

/// Approval queue: payments awaiting approval for the current organization,
/// with policy evidence and approver independence state.
export const GET = route(async ({ org, auth, request }) => {
  const url = new URL(request.url)
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 25, 50)
  const { page, skip, take } = parsePage(url.searchParams.get('page'), pageSize)
  const where = { orgId: org.org.id, status: 'PENDING_APPROVAL' }
  const [total, payments] = await Promise.all([
    db.paymentRequest.count({ where }),
    db.paymentRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      include: { recipient: { select: { name: true } }, wallet: { select: { label: true } } },
    }),
  ])
  const assets = await db.supportedAsset.findMany()
  const assetMap = new Map(assets.map((a) => [a.mint, a]))
  const approvals = await db.paymentApproval.findMany({ where: { orgId: org.org.id, decision: { in: ['APPROVED', 'REJECTED'] } } })
  const approvalsByPayment = new Map<string, { decision: string; approverId: string }[]>()
  for (const a of approvals) {
    const list = approvalsByPayment.get(a.paymentId) ?? []
    list.push({ decision: a.decision, approverId: a.approverId })
    approvalsByPayment.set(a.paymentId, list)
  }
  return ok({
    items: payments.map((p) => {
      const decided = approvalsByPayment.get(p.id) ?? []
      const othersApproved = decided.filter((d) => d.decision === 'APPROVED' && d.approverId !== auth.user.id).length
      return {
        id: p.id,
        reference: p.reference,
        status: p.status,
        recipientName: p.recipient?.name ?? null,
        destination: p.destination,
        mint: p.mint,
        mintSymbol: assetMap.get(p.mint)?.symbol ?? p.mint,
        decimals: assetMap.get(p.mint)?.decimals ?? 6,
        amountBaseUnits: p.amountBaseUnits,
        reason: p.reason,
        walletLabel: p.wallet?.label ?? null,
        source: p.source,
        approvalsRequired: p.approvalsRequired,
        decidedByOthers: decided.map((d) => d.decision),
        createdByMe: p.createdBy === auth.user.id,
        iCanDecide: !decided.some((d) => d.approverId === auth.user.id) && !(p.createdBy === auth.user.id && p.approvalsRequired > 1),
        waitingOn: Math.max(0, p.approvalsRequired - othersApproved),
        createdAt: p.createdAt,
      }
    }),
    total,
    page,
    pageSize,
  })
})
