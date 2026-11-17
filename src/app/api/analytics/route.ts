import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { formatBaseUnits } from '@/lib/money'

/// Business analytics over real records. Intermediate hops are never counted
/// as payment volume — only payment-level records feed these aggregates.
export const GET = route(async ({ org, request }) => {
  const url = new URL(request.url)
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days') ?? '30')))
  const since = new Date(Date.now() - days * 86_400_000)
  const [payments, ledger, batches, recipients] = await Promise.all([
    db.paymentRequest.findMany({ where: { orgId: org.org.id, createdAt: { gte: since } }, select: { id: true, status: true, mint: true, amountBaseUnits: true, createdAt: true, completedAt: true, recipientId: true, source: true } }),
    db.ledgerEntry.findMany({ where: { orgId: org.org.id, occurredAt: { gte: since } }, select: { entryType: true, direction: true, mint: true, amountBaseUnits: true, occurredAt: true } }),
    db.paymentBatch.findMany({ where: { orgId: org.org.id, createdAt: { gte: since } }, select: { id: true, status: true, itemCount: true, createdAt: true } }),
    db.recipient.findMany({ where: { orgId: org.org.id }, select: { id: true, category: true, createdAt: true } }),
  ])
  const assets = await db.supportedAsset.findMany()
  const assetMap = new Map(assets.map((a) => [a.mint, a]))

  const byDay = new Map<string, { date: string; volume: number; completed: number; failed: number; count: number }>()
  for (const p of payments) {
    const day = p.createdAt.toISOString().slice(0, 10)
    const slot = byDay.get(day) ?? { date: day, volume: 0, completed: 0, failed: 0, count: 0 }
    const decimals = assetMap.get(p.mint)?.decimals ?? 6
    slot.volume += Number(formatBaseUnits(p.amountBaseUnits, decimals, { trimTrailingZeros: false }).replace(/,/g, ''))
    slot.count += 1
    if (p.status === 'COMPLETED') slot.completed += 1
    if (['FAILED', 'REJECTED'].includes(p.status)) slot.failed += 1
    byDay.set(day, slot)
  }
  const timeline = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))

  const statusCounts = new Map<string, number>()
  for (const p of payments) statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1)
  const byStatus = [...statusCounts.entries()].map(([status, count]) => ({ status, count }))

  const mintTotals = new Map<string, bigint>()
  for (const p of payments) {
    if (p.status === 'COMPLETED') mintTotals.set(p.mint, (mintTotals.get(p.mint) ?? 0n) + BigInt(p.amountBaseUnits))
  }
  const assetDistribution = [...mintTotals.entries()].map(([mint, total]) => ({
    mint,
    symbol: assetMap.get(mint)?.symbol ?? mint,
    total: formatBaseUnits(total, assetMap.get(mint)?.decimals ?? 6),
    count: payments.filter((p) => p.mint === mint).length,
  }))

  const feeByType = new Map<string, bigint>()
  for (const l of ledger) {
    if (['PROVIDER_FEE', 'NETWORK_FEE', 'SCREENING_FEE'].includes(l.entryType)) {
      feeByType.set(l.entryType, (feeByType.get(l.entryType) ?? 0n) + BigInt(l.amountBaseUnits))
    }
  }

  const recipientCounts = new Map<string, number>()
  for (const p of payments) {
    if (!p.recipientId) continue
    recipientCounts.set(p.recipientId, (recipientCounts.get(p.recipientId) ?? 0) + 1)
  }
  const recipientIds = [...recipientCounts.keys()]
  const topRecipients = recipientIds.length
    ? (await db.recipient.findMany({ where: { id: { in: recipientIds } } }))
        .map((r) => ({ name: r.name, category: r.category, count: recipientCounts.get(r.id) ?? 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    : []

  const batchCompletion = batches.reduce(
    (acc, b) => {
      acc.total += 1
      if (['COMPLETED', 'PARTIAL'].includes(b.status)) acc.completed += 1
      return acc
    },
    { total: 0, completed: 0 },
  )

  const categoryCounts = new Map<string, number>()
  for (const r of recipients) categoryCounts.set(r.category ?? 'OTHER', (categoryCounts.get(r.category ?? 'OTHER') ?? 0) + 1)
  const byCategory = [...categoryCounts.entries()].map(([category, count]) => ({ category, count }))

  const completedTimes = payments.filter((p) => p.completedAt).map((p) => (new Date(p.completedAt!).getTime() - new Date(p.createdAt).getTime()) / 3600_000)
  const avgSettlementHours = completedTimes.length ? completedTimes.reduce((a, b) => a + b, 0) / completedTimes.length : null

  return ok({
    rangeDays: days,
    timeline,
    byStatus,
    assetDistribution,
    feeBreakdown: [...feeByType.entries()].map(([type, total]) => ({ type, total: formatBaseUnits(total, 6) })),
    topRecipients,
    batchCompletion,
    byCategory,
    avgSettlementHours,
    totals: {
      payments: payments.length,
      completed: payments.filter((p) => p.status === 'COMPLETED').length,
      failed: payments.filter((p) => ['FAILED', 'REJECTED'].includes(p.status)).length,
      ledgerEntries: ledger.length,
      sources: [...new Set(payments.map((p) => p.source))],
    },
  })
})
