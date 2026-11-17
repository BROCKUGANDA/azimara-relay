import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { isValidSolanaAddress } from '@/lib/solana'

function idFrom(request: Request): string {
  // Direct-child route: /api/<resource>/<id> → last segment.
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-1)[0]
}

export const GET = route(async ({ org, request }) => {
  const recipient = await db.recipient.findFirst({ where: { id: idFrom(request), orgId: org.org.id }, include: { changes: { orderBy: { createdAt: 'desc' }, take: 20 } } })
  if (!recipient) throw new ApiError('NOT_FOUND', 'Recipient not found', 404)
  const payments = await db.paymentRequest.findMany({ where: { recipientId: recipient.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, reference: true, status: true, amountBaseUnits: true, mint: true, createdAt: true } })
  return ok({
    recipient: {
      id: recipient.id,
      name: recipient.name,
      address: recipient.address,
      reference: recipient.reference,
      category: recipient.category,
      assetPreference: recipient.assetPreference,
      notes: recipient.notes,
      status: recipient.status,
      verificationStatus: recipient.verificationStatus,
      groupId: recipient.groupId,
      lastPaymentAt: recipient.lastPaymentAt,
      createdAt: recipient.createdAt,
    },
    changeHistory: recipient.changes.map((c) => ({ id: c.id, field: c.field, oldValue: c.oldValue, newValue: c.newValue, invalidatesApproval: c.invalidatesApproval, createdAt: c.createdAt })),
    recentPayments: payments,
  })
})

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().min(32).max(44).optional(),
  reference: z.string().max(80).optional(),
  category: z.enum(['CONTRACTOR', 'VENDOR', 'CONTRIBUTOR', 'AFFILIATE', 'ROYALTIES', 'OTHER']).optional(),
  assetPreference: z.string().optional(),
  notes: z.string().max(2000).optional(),
  groupId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'ARCHIVED']).optional(),
})

export const PATCH = route(async ({ org, auth, request }) => {
  const recipient = await db.recipient.findFirst({ where: { id: idFrom(request), orgId: org.org.id } })
  if (!recipient) throw new ApiError('NOT_FOUND', 'Recipient not found', 404)
  const body = await readJson(request, patchSchema)

  // A change to the wallet address must invalidate pending approvals and
  // force a fresh review — never a silent edit.
  let addressChanged = false
  if (body.address && body.address !== recipient.address) {
    addressChanged = true
    if (!isValidSolanaAddress(body.address)) throw new ApiError('INVALID_ADDRESS', 'New address is not a valid Solana public key', 400)
    const dupe = await db.recipient.findFirst({ where: { orgId: org.org.id, address: body.address, status: { not: 'ARCHIVED' }, id: { not: recipient.id } } })
    if (dupe) throw new ApiError('DUPLICATE_RECIPIENT', `Another recipient already uses this address: ${dupe.name}`, 409)
    const pending = await db.paymentRequest.findMany({ where: { recipientId: recipient.id, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'QUOTED'] } } })
    for (const p of pending) {
      await db.paymentApproval.updateMany({ where: { paymentId: p.id, decision: 'APPROVED' }, data: { decision: 'REVOKED', reason: 'Recipient address changed — re-approval required' } })
      await db.paymentRequest.update({ where: { id: p.id }, data: { status: 'MANUAL_REVIEW', statusReason: 'RECIPIENT_ADDRESS_CHANGED', lastError: 'Recipient address changed after approval; approvals invalidated.' } })
      await db.approvalEvent.create({ data: { paymentId: p.id, type: 'REVOKED', actorId: auth.user.id, dataJson: JSON.stringify({ reason: 'RECIPIENT_ADDRESS_CHANGED' }) } })
    }
    await db.recipientChange.create({ data: { recipientId: recipient.id, field: 'address', oldValue: recipient.address, newValue: body.address, actorId: auth.user.id, invalidatesApproval: true } })
  }
  for (const [field, newValue] of Object.entries(body)) {
    if (field === 'address') continue
    const oldValue = (recipient as unknown as Record<string, unknown>)[field]
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      await db.recipientChange.create({ data: { recipientId: recipient.id, field, oldValue: oldValue === null || oldValue === undefined ? null : String(oldValue), newValue: newValue === null || newValue === undefined ? null : String(newValue), actorId: auth.user.id } })
    }
  }
  await db.recipient.update({
    where: { id: recipient.id },
    data: {
      name: body.name ?? recipient.name,
      address: body.address ?? recipient.address,
      reference: body.reference ?? recipient.reference,
      category: body.category ?? recipient.category,
      assetPreference: body.assetPreference ?? recipient.assetPreference,
      notes: body.notes ?? recipient.notes,
      groupId: body.groupId === undefined ? recipient.groupId : body.groupId,
      status: body.status ?? recipient.status,
    },
  })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECIPIENT_UPDATED', resourceType: 'Recipient', resourceId: recipient.id, data: { addressChanged } })
  return ok({ updated: true })
}, { permission: 'recipient:manage' })

export const DELETE = route(async ({ org, auth, request }) => {
  const recipient = await db.recipient.findFirst({ where: { id: idFrom(request), orgId: org.org.id } })
  if (!recipient) throw new ApiError('NOT_FOUND', 'Recipient not found', 404)
  // Archive, never hard-delete: financial history must be preserved.
  await db.recipient.update({ where: { id: recipient.id }, data: { status: 'ARCHIVED' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECIPIENT_ARCHIVED', resourceType: 'Recipient', resourceId: recipient.id })
  return ok({ archived: true })
}, { permission: 'recipient:manage' })
