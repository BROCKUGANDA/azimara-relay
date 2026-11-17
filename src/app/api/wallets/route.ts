import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { isValidSolanaAddress } from '@/lib/solana'
import { shortId } from '@/lib/crypto'
import { entitlementsFor, assertWithinLimit } from '@/lib/entitlements'
import { safeJsonParse } from '@/lib/safe-json'

export const GET = route(async ({ org }) => {
  const wallets = await db.wallet.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'desc' }, take: 5 } } })
  return ok({
    wallets: wallets.map((w) => ({
      id: w.id,
      label: w.label,
      address: w.address,
      network: w.network,
      kind: w.kind,
      ownershipStatus: w.ownershipStatus,
      balance: safeJsonParse<unknown>(w.balanceJson, null),
      balanceAt: w.balanceAt,
      revokedAt: w.revokedAt,
      verifiedAt: w.verifiedAt,
      createdAt: w.createdAt,
      recentEvents: w.events.map((e) => ({ id: e.id, type: e.type, createdAt: e.createdAt, data: safeJsonParse(e.dataJson, {}) })),
    })),
  })
})

const createSchema = z.object({
  label: z.string().min(1).max(60),
  address: z.string().min(32).max(44),
  network: z.enum(['devnet', 'mainnet-beta']),
  kind: z.enum(['TREASURY', 'OPERATIONAL']).default('TREASURY'),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, createSchema)
  if (!isValidSolanaAddress(body.address)) throw new ApiError('INVALID_ADDRESS', 'The wallet address is not a valid Solana public key', 400)
  const ent = entitlementsFor(org.org.plan)
  const active = await db.wallet.count({ where: { orgId: org.org.id, revokedAt: null } })
  assertWithinLimit(ent, 'treasuryWallets', active)
  // Duplicate check includes revoked registrations: the (orgId, address,
  // network) unique index spans history, and re-registering a revoked wallet
  // must surface a clear error instead of a raw constraint failure.
  const dupe = await db.wallet.findFirst({ where: { orgId: org.org.id, address: body.address, network: body.network } })
  if (dupe) {
    throw new ApiError(
      'DUPLICATE_WALLET',
      dupe.revokedAt ? 'This address was previously registered and revoked; addresses remain in the financial history. Use a different address or contact support to restore.' : 'This wallet address is already registered',
      409,
    )
  }
  const nonce = `relay-verify-${shortId()}-${Date.now()}`
  const wallet = await db.wallet.create({
    data: {
      orgId: org.org.id,
      label: body.label,
      address: body.address,
      network: body.network,
      kind: body.kind,
      ownershipNonce: nonce,
      ownershipStatus: 'PENDING',
    },
  })
  await db.walletEvent.create({ data: { walletId: wallet.id, type: 'REGISTERED', actorId: auth.user.id, dataJson: JSON.stringify({ network: body.network, kind: body.kind }) } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'WALLET_REGISTERED', resourceType: 'Wallet', resourceId: wallet.id, data: { address: body.address, network: body.network } })
  return ok({
    wallet: { id: wallet.id, label: wallet.label, address: wallet.address, network: wallet.network, ownershipStatus: wallet.ownershipStatus },
    verification: {
      method: 'SIGN_MESSAGE',
      message: [
        'AZIMARA RELAY — Wallet ownership verification',
        `Organization: ${org.org.name}`,
        `Address: ${body.address}`,
        `Nonce: ${nonce}`,
        'Signing this message proves you control this wallet. This is not a transaction and does not authorize any transfer.',
      ].join('\n'),
    },
  })
}, { permission: 'wallet:manage' })
