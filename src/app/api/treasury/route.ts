import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { safeJsonParse } from '@/lib/safe-json'

/// Treasury overview aggregation — real application records only. Never
/// synthetic volume; empty workspaces produce honest zero states.
export const GET = route(async ({ org }) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [wallets, pendingApprovals, activeTransfers, failedPayments, recentPayments, completedThisMonth, scheduledCount, batchPending, recentBatches, assets, integration] = await Promise.all([
    db.wallet.findMany({ where: { orgId: org.org.id, revokedAt: null }, orderBy: { createdAt: 'asc' } }),
    db.paymentRequest.count({ where: { orgId: org.org.id, status: 'PENDING_APPROVAL' } }),
    db.paymentRequest.count({ where: { orgId: org.org.id, status: { in: ['AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST', 'PROCESSING', 'SETTLEMENT_VERIFICATION'] } } }),
    db.paymentRequest.count({ where: { orgId: org.org.id, status: { in: ['FAILED', 'RECOVERABLE', 'RECONCILIATION_REQUIRED'] } } }),
    db.paymentRequest.findMany({
      where: { orgId: org.org.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { recipient: { select: { name: true } }, wallet: { select: { label: true } } },
    }),
    db.paymentRequest.count({ where: { orgId: org.org.id, status: 'COMPLETED', createdAt: { gte: monthStart } } }),
    db.paymentSchedule.count({ where: { orgId: org.org.id, status: 'ACTIVE' } }),
    db.paymentBatch.count({ where: { orgId: org.org.id, status: { in: ['DRAFT', 'AWAITING_APPROVAL'] } } }),
    db.paymentBatch.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, reference: true, status: true, itemCount: true, totalBaseUnits: true, mint: true, createdAt: true } }),
    db.supportedAsset.findMany(),
    db.providerIntegration.findUnique({ where: { orgId_provider: { orgId: org.org.id, provider: 'MULTIHOPPER' } } }),
  ])
  const assetMap = new Map(assets.map((a) => [a.mint, a]))

  return ok({
    wallets: wallets.map((w) => ({
      id: w.id,
      label: w.label,
      address: w.address,
      network: w.network,
      ownershipStatus: w.ownershipStatus,
      balance: safeJsonParse<unknown>(w.balanceJson, null),
      balanceAt: w.balanceAt,
    })),
    metrics: {
      pendingApprovals,
      activeTransfers,
      failedPayments,
      completedThisMonth,
      scheduledPayments: scheduledCount,
      batchesPending: batchPending,
      providerConfigured: !!integration?.apiKeyCipher,
      providerEnvironment: integration?.environment ?? 'DEVNET',
    },
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      reference: p.reference,
      status: p.status,
      recipientName: p.recipient?.name ?? null,
      mint: p.mint,
      mintSymbol: assetMap.get(p.mint)?.symbol ?? p.mint,
      decimals: assetMap.get(p.mint)?.decimals ?? 6,
      amountBaseUnits: p.amountBaseUnits,
      walletLabel: p.wallet?.label ?? null,
      createdAt: p.createdAt,
    })),
    recentBatches,
  })
})
