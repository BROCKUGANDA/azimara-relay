import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { db } from '@/lib/db'
import { buildCsv } from '@/lib/csv'
import { audit } from '@/lib/audit'
import { formatBaseUnits } from '@/lib/money'

export const GET = route(async ({ org }) => {
  const exports = await db.financialExport.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: 25 })
  return ok({
    exports: exports.map((e) => ({ id: e.id, kind: e.kind, format: e.format, rowCount: e.rowCount, createdAt: e.createdAt, filters: JSON.parse(e.filtersJson) })),
  })
})

const createSchema = z.object({ kind: z.enum(['PAYMENTS', 'RECONCILIATION', 'LEDGER', 'AUDIT']), days: z.number().int().min(1).max(365).default(90) })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, createSchema)
  const since = new Date(Date.now() - body.days * 86_400_000)
  let csv = ''
  let rowCount = 0
  const assets = await db.supportedAsset.findMany()
  const assetMap = new Map(assets.map((a) => [a.mint, a]))
  if (body.kind === 'PAYMENTS') {
    const rows = await db.paymentRequest.findMany({ where: { orgId: org.org.id, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, include: { recipient: { select: { name: true } }, wallet: { select: { label: true } } } })
    csv = buildCsv(
      ['reference', 'status', 'recipient', 'wallet', 'mint', 'amount', 'created_at', 'completed_at', 'reason'],
      rows.map((p) => {
        const decimals = assetMap.get(p.mint)?.decimals ?? 6
        return [p.reference, p.status, p.recipient?.name ?? '', p.wallet?.label ?? '', assetMap.get(p.mint)?.symbol ?? p.mint, formatBaseUnits(p.amountBaseUnits, decimals, { trimTrailingZeros: true }), p.createdAt.toISOString(), p.completedAt?.toISOString() ?? '', p.reason ?? '']
      }),
    )
    rowCount = rows.length
  } else if (body.kind === 'RECONCILIATION') {
    const rows = await db.reconciliationRecord.findMany({ where: { orgId: org.org.id, lastCheckedAt: { gte: since } }, orderBy: { lastCheckedAt: 'asc' }, include: { payment: { select: { reference: true } } } })
    csv = buildCsv(
      ['payment_reference', 'provider_ref', 'provider_status', 'state', 'expected', 'observed', 'detail', 'last_checked'],
      rows.map((r) => [r.payment?.reference ?? '', r.providerRef ?? '', r.providerStatus ?? '', r.state, r.expectedBase ?? '', r.observedBase ?? '', r.detail ?? '', r.lastCheckedAt.toISOString()]),
    )
    rowCount = rows.length
  } else if (body.kind === 'LEDGER') {
    const rows = await db.ledgerEntry.findMany({ where: { orgId: org.org.id, occurredAt: { gte: since } }, orderBy: { occurredAt: 'asc' } })
    csv = buildCsv(
      ['entry_type', 'direction', 'mint', 'amount', 'signature', 'source', 'occurred_at'],
      rows.map((l) => [l.entryType, l.direction, assetMap.get(l.mint)?.symbol ?? l.mint, formatBaseUnits(l.amountBaseUnits, assetMap.get(l.mint)?.decimals ?? 6, { trimTrailingZeros: true }), l.signature ?? '', l.source, l.occurredAt.toISOString()]),
    )
    rowCount = rows.length
  } else {
    const rows = await db.auditLog.findMany({ where: { orgId: org.org.id, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } })
    csv = buildCsv(['action', 'resource_type', 'resource_id', 'actor_type', 'actor_id', 'data', 'created_at'], rows.map((e) => [e.action, e.resourceType, e.resourceId ?? '', e.actorType, e.actorId ?? '', e.dataJson, e.createdAt.toISOString()]))
    rowCount = rows.length
  }
  const record = await db.financialExport.create({ data: { orgId: org.org.id, kind: body.kind, format: 'CSV', rowCount, content: csv, filtersJson: JSON.stringify({ days: body.days }), createdBy: auth.user.id } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'FINANCIAL_EXPORT_CREATED', resourceType: 'FinancialExport', resourceId: record.id, data: { kind: body.kind, rows: rowCount } })
  return ok({ id: record.id, rowCount, csv })
}, { permission: 'export:create' })
