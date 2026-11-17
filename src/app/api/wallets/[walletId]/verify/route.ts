import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { verifyWalletOwnership } from '@/lib/solana'

function walletIdFrom(request: Request): string {
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
}

function verificationMessage(orgName: string, address: string, nonce: string): string {
  return [
    'AZIMARA RELAY — Wallet ownership verification',
    `Organization: ${orgName}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    'Signing this message proves you control this wallet. This is not a transaction and does not authorize any transfer.',
  ].join('\n')
}

export const GET = route(async ({ org, request }) => {
  const wallet = await db.wallet.findFirst({ where: { id: walletIdFrom(request), orgId: org.org.id } })
  if (!wallet) throw new ApiError('NOT_FOUND', 'Wallet not found', 404)
  if (wallet.revokedAt) throw new ApiError('WALLET_REVOKED', 'This wallet has been revoked', 409)
  // Fresh nonce per challenge to prevent replay.
  const nonce = `relay-verify-${wallet.id.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await db.wallet.update({ where: { id: wallet.id }, data: { ownershipNonce: nonce } })
  return ok({
    method: 'SIGN_MESSAGE',
    message: verificationMessage(org.org.name, wallet.address, nonce),
    address: wallet.address,
  })
}, { permission: 'wallet:manage' })

const verifySchema = z.object({ signature: z.string().min(32) })

export const POST = route(async ({ org, auth, request }) => {
  const wallet = await db.wallet.findFirst({ where: { id: walletIdFrom(request), orgId: org.org.id } })
  if (!wallet) throw new ApiError('NOT_FOUND', 'Wallet not found', 404)
  if (wallet.revokedAt) throw new ApiError('WALLET_REVOKED', 'This wallet has been revoked', 409)
  const body = await readJson(request, verifySchema)
  const nonce = wallet.ownershipNonce
  if (!nonce) throw new ApiError('NO_CHALLENGE', 'Request a verification message first', 409)
  const message = verificationMessage(org.org.name, wallet.address, nonce)
  const valid = verifyWalletOwnership(wallet.address, message, body.signature)
  await db.wallet.update({
    where: { id: wallet.id },
    data: { ownershipStatus: valid ? 'VERIFIED' : 'FAILED', ownershipNonce: null, verifiedAt: valid ? new Date() : null, verifiedByUserId: valid ? auth.user.id : null },
  })
  await db.walletEvent.create({ data: { walletId: wallet.id, type: valid ? 'OWNERSHIP_VERIFIED' : 'OWNERSHIP_FAILED', actorId: auth.user.id, dataJson: '{}' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: valid ? 'WALLET_OWNERSHIP_VERIFIED' : 'WALLET_OWNERSHIP_FAILED', resourceType: 'Wallet', resourceId: wallet.id })
  if (!valid) throw new ApiError('SIGNATURE_INVALID', 'The signature does not verify against this wallet address', 400)
  return ok({ verified: true })
}, { permission: 'wallet:manage' })
