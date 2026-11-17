import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { safeJsonParse } from '@/lib/safe-json'

function walletIdFrom(request: Request): string {
  // Direct-child route: /api/wallets/<id> → last segment.
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-1)[0]
}

export const GET = route(async ({ org, request }) => {
  const wallet = await db.wallet.findFirst({ where: { id: walletIdFrom(request), orgId: org.org.id }, include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } } })
  if (!wallet) throw new ApiError('NOT_FOUND', 'Wallet not found', 404)
  return ok({
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    network: wallet.network,
    kind: wallet.kind,
    ownershipStatus: wallet.ownershipStatus,
    balance: safeJsonParse<unknown>(wallet.balanceJson, null),
    balanceAt: wallet.balanceAt,
    verifiedAt: wallet.verifiedAt,
    revokedAt: wallet.revokedAt,
    history: wallet.events.map((e) => ({ id: e.id, type: e.type, createdAt: e.createdAt, data: safeJsonParse(e.dataJson, {}) })),
  })
}, { permission: 'wallet:read' })

const patchSchema = z.object({ label: z.string().min(1).max(60).optional(), kind: z.enum(['TREASURY', 'OPERATIONAL']).optional() })

export const PATCH = route(async ({ org, auth, request }) => {
  const wallet = await db.wallet.findFirst({ where: { id: walletIdFrom(request), orgId: org.org.id } })
  if (!wallet) throw new ApiError('NOT_FOUND', 'Wallet not found', 404)
  const body = await readJson(request, patchSchema)
  await db.wallet.update({ where: { id: wallet.id }, data: { label: body.label ?? wallet.label, kind: body.kind ?? wallet.kind } })
  await db.walletEvent.create({ data: { walletId: wallet.id, type: 'UPDATED', actorId: auth.user.id, dataJson: JSON.stringify(body) } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'WALLET_UPDATED', resourceType: 'Wallet', resourceId: wallet.id, data: body })
  return ok({ updated: true })
}, { permission: 'wallet:manage' })

/// Revocation removes the wallet from all operational paths. Records are
/// retained — financial history is never destroyed.
export const DELETE = route(async ({ org, auth, request }) => {
  const wallet = await db.wallet.findFirst({ where: { id: walletIdFrom(request), orgId: org.org.id } })
  if (!wallet) throw new ApiError('NOT_FOUND', 'Wallet not found', 404)
  const inUse = await db.paymentRequest.count({ where: { sourceWalletId: wallet.id, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'QUOTED', 'AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST', 'PROCESSING', 'SETTLEMENT_VERIFICATION'] } } })
  if (inUse > 0) throw new ApiError('WALLET_IN_USE', `This wallet is the source of ${inUse} payment(s) awaiting execution and cannot be revoked yet`, 409)
  await db.wallet.update({ where: { id: wallet.id }, data: { revokedAt: new Date() } })
  await db.walletEvent.create({ data: { walletId: wallet.id, type: 'REVOKED', actorId: auth.user.id, dataJson: '{}' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'WALLET_REVOKED', resourceType: 'Wallet', resourceId: wallet.id })
  return ok({ revoked: true })
}, { permission: 'wallet:manage' })
