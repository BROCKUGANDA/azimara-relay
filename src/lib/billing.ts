// On-chain subscription collection (commercialization).
//
// Flow: an upgrade/renewal creates a SubscriptionInvoice whose USDC amount
// carries a unique micro-suffix (e.g. 199.000123 USDC). The customer pays on
// Solana mainnet-beta — via a Solana Pay QR or any wallet — to the platform
// treasury. Payment is detected two ways, both reading the REAL chain:
//   1. Billing sweep (BILLING_SWEEP cron) watches the treasury owner address
//      and its derived USDC associated token account via getSignaturesForAddress.
//   2. Claim path: the customer pastes the transaction signature and the
//      platform fetches and verifies that exact transaction.
// An incoming transfer is matched to exactly one pending invoice by its exact
// base-unit amount, confirmed at `finalized` commitment, idempotent by
// signature (unique index), and then provisions the entitlement.
//
// Honesty rules: this module never simulates a payment. If the RPC is down or
// a transfer does not match, the caller gets a typed error and the invoice
// stays pending. Unmatched incoming deposits are recorded, never dropped.

import { createHash } from 'crypto'
import bs58 from 'bs58'
import { env } from './env'
import { db } from './db'
import { rpc, rpcHealthy, explorerTxUrl, explorerAddressUrl } from './solana'
import { PLANS, entitlementsFor, type PlanId } from './entitlements'
import { formatBaseUnits } from './money'
import { ApiError } from './api'
import { audit, notify } from './audit'

// ─── Chain constants ─────────────────────────────────────────────────────────

export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
// SPL Associated Token Account program (verified on-chain: executable program
// account on mainnet-beta).
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const PDA_MARKER = 'ProgramDerivedAddress'
const FINALIZED = 'finalized'

// ─── ed25519 point decompression (for Solana's on-curve PDA rule) ────────────
// Solana find_program_address rejects candidate hashes that decode to a valid
// ed25519 curve point. Skipping that check would yield wrong PDAs for ~half
// of candidate hashes, so the rule is implemented here exactly.

const P = (1n << 255n) - 19n
const D = mod(BigInt(-121665) * modInverse(BigInt(121666)))
const SQRT_M1 = powMod(2n, (P - 1n) / 4n)

function mod(a: bigint, m: bigint = P): bigint {
  return ((a % m) + m) % m
}

function modInverse(a: bigint): bigint {
  let t0 = 0n
  let t1 = 1n
  let r0 = P
  let r1 = mod(a)
  while (r1 !== 0n) {
    const q = r0 / r1
    ;[t0, t1] = [t1, t0 - q * t1]
    ;[r0, r1] = [r1, r0 - q * r1]
  }
  if (r0 !== 1n) throw new Error('modInverse: not invertible')
  return mod(t0)
}

function powMod(base: bigint, exp: bigint): bigint {
  let result = 1n
  let b = mod(base)
  let e = exp
  while (e > 0n) {
    if (e & 1n) result = mod(result * b)
    b = mod(b * b)
    e >>= 1n
  }
  return result
}

/// True when the 32 bytes decode to a point on the ed25519 curve.
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false
  const last = bytes[31]
  const sign = (last & 0x80) !== 0
  let y = 0n
  for (let i = 0; i < 31; i++) y += BigInt(bytes[i]) << (8n * BigInt(i))
  y += BigInt(last & 0x7f) << 248n
  if (y >= P) return false
  const y2 = mod(y * y)
  const u = mod(y2 - 1n) // -x² + y² = 1 + d·x²  →  x² = (y²−1)/(d·y²+1)
  const v = mod(D * y2 + 1n)
  if (v === 0n) return false
  // p ≡ 5 (mod 8): candidate sqrt = u/v ^ ((p+3)/8); fall back × sqrt(−1).
  let x = powMod(mod(u * modInverse(v)), (P + 3n) / 8n)
  if (mod(x * x * v - u) !== 0n) {
    x = mod(x * SQRT_M1)
    if (mod(x * x * v - u) !== 0n) return false
  }
  if ((x & 1n) !== (sign ? 1n : 0n)) x = mod(P - x)
  return true
}

/// Solana find_program_address: sha256(seeds ‖ bump ‖ programId ‖ marker),
/// scanning bumps 255→0 and rejecting on-curve candidates.
function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): { address: Uint8Array; bump: number } {
  for (let bump = 255; bump >= 0; bump--) {
    const hasher = createHash('sha256')
    for (const s of seeds) hasher.update(s)
    hasher.update(Uint8Array.of(bump))
    hasher.update(programId)
    hasher.update(Buffer.from(PDA_MARKER))
    const hash = new Uint8Array(hasher.digest())
    if (!isOnCurve(hash)) return { address: hash, bump }
  }
  throw new Error('findProgramAddress: exhausted bump seeds')
}

/// The owner's associated token account for a token program — where incoming
/// SPL tokens land. Seeds are [owner, tokenProgramId] under the ATA program
/// (NOT the mint address — the mint is not part of ATA derivation).
export function deriveAssociatedTokenAddress(owner: string, tokenProgram: string = TOKEN_PROGRAM_ID): string {
  return bs58.encode(
    findProgramAddress([bs58.decode(owner), bs58.decode(tokenProgram)], bs58.decode(ASSOCIATED_TOKEN_PROGRAM_ID)).address,
  )
}

// ─── Billing configuration ───────────────────────────────────────────────────

export type BillingConfig = {
  collectionEnabled: true
  network: string
  rpcUrl: string
  treasuryAddress: string
  treasuryAta: string
  mint: string
  decimals: number
  invoiceValidityHours: number
}

export function billingConfig(): BillingConfig {
  const e = env()
  if (!isValidPublicKey(e.resolvedTreasuryAddress)) {
    throw new Error(`TREASURY_ADDRESS is not a valid Solana public key: ${e.resolvedTreasuryAddress}`)
  }
  return {
    collectionEnabled: true,
    network: e.SOLANA_NETWORK,
    rpcUrl: e.resolvedRpcUrl,
    treasuryAddress: e.resolvedTreasuryAddress,
    treasuryAta: deriveAssociatedTokenAddress(e.resolvedTreasuryAddress, TOKEN_PROGRAM_ID),
    mint: e.resolvedBillingMint,
    decimals: e.BILLING_MINT_DECIMALS,
    invoiceValidityHours: e.BILLING_INVOICE_VALIDITY_HOURS,
  }
}

function isValidPublicKey(address: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false
  try {
    return bs58.decode(address).length === 32
  } catch {
    return false
  }
}

export function isValidSignatureFormat(signature: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) return false
  try {
    return bs58.decode(signature).length === 64
  } catch {
    return false
  }
}

/// Solana Pay transfer URI (SPL token): wallets prefill recipient + amount.
export function solanaPayUri(amountBaseUnits: string, decimals: number, treasury: string, mint: string, label: string, message: string): string {
  const uiAmount = formatBaseUnits(amountBaseUnits, decimals, { trimTrailingZeros: true, group: false })
  const params = new URLSearchParams({ amount: uiAmount, 'spl-token': mint, label, message })
  return `solana:${treasury}?${params.toString()}`
}

export function explorerAccount(address: string, network: string): string {
  return explorerAddressUrl(address, network)
}

export function explorerTx(signature: string, network: string): string {
  return explorerTxUrl(signature, network)
}

// ─── Health (short cache so UI polling doesn't hammer the RPC) ───────────────

let healthCache: { at: number; value: { ok: boolean; slot?: number; error?: string } } | null = null
const HEALTH_TTL_MS = 15_000

export async function billingRpcHealth() {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value
  const value = await rpcHealthy(env().SOLANA_NETWORK)
  healthCache = { at: Date.now(), value }
  return value
}

// ─── On-chain transfer parsing ───────────────────────────────────────────────

export type IncomingTransfer = {
  signature: string
  amountBaseUnits: string
  destination: string
  sourceOwner: string | null
  slot: number | null
  blockTime: Date | null
}

type TokenBalance = { accountIndex: number; mint: string; owner: string | null; uiTokenAmount: { amount: string; decimals?: number } }

type ParsedTx = {
  blockTime: number | null
  slot: number | null
  meta: { err: unknown; preTokenBalances: TokenBalance[] | null; postTokenBalances: TokenBalance[] | null } | null
  transaction?: { message?: { accountKeys?: { pubkey: string }[] } }
}

/// Reads one finalized transaction and sums incoming {mint} token deltas into
/// token accounts owned by `owner`. pre/post token balances cover every
/// transfer variant (transfer, transferChecked, ATA created in-tx).
export async function extractIncomingTransfer(network: string, signature: string, owner: string, mint: string): Promise<{ transfer: IncomingTransfer | null; notFound?: boolean; failed?: boolean }> {
  // maxSupportedTransactionVersion 255: accept ANY transaction version — a
  // customer paying from a wallet that emits versioned (v1+) transactions
  // must still settle their invoice, never bounce the claim path.
  const tx = await rpc<ParsedTx | null>(network, 'getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 255, commitment: FINALIZED }])
  if (!tx || !tx.meta) return { transfer: null, notFound: true }
  if (tx.meta.err != null) return { transfer: null, failed: true }

  const preByIndex = new Map<number, { amount: bigint; owner: string | null }>()
  for (const b of tx.meta.preTokenBalances ?? []) {
    preByIndex.set(b.accountIndex, { amount: BigInt(b.uiTokenAmount.amount), owner: b.owner })
  }
  const accountKeys = tx.transaction?.message?.accountKeys ?? []

  let incoming = 0n
  let destination = ''
  for (const b of tx.meta.postTokenBalances ?? []) {
    if (b.mint !== mint || b.owner !== owner) continue
    const pre = preByIndex.get(b.accountIndex)
    const delta = BigInt(b.uiTokenAmount.amount) - (pre?.amount ?? 0n)
    if (delta > 0n) {
      incoming += delta
      destination = accountKeys[b.accountIndex]?.pubkey ?? destination
    }
  }
  if (incoming === 0n) return { transfer: null }

  // Source attribution: the account with the largest outgoing delta on the
  // same mint. Best-effort — null when the chain data doesn't expose it.
  let sourceOwner: string | null = null
  let largestOut = 0n
  const postOwners = new Map<number, { amount: bigint; owner: string | null }>()
  for (const b of tx.meta.postTokenBalances ?? []) {
    postOwners.set(b.accountIndex, { amount: BigInt(b.uiTokenAmount.amount), owner: b.owner })
  }
  for (const b of tx.meta.preTokenBalances ?? []) {
    if (b.mint !== mint) continue
    const post = postOwners.get(b.accountIndex)
    const delta = (post?.amount ?? 0n) - BigInt(b.uiTokenAmount.amount)
    if (delta < 0n && -delta > largestOut) {
      largestOut = -delta
      sourceOwner = post?.owner ?? b.owner ?? null
    }
  }

  return {
    transfer: {
      signature,
      amountBaseUnits: incoming.toString(),
      destination,
      sourceOwner,
      slot: tx.slot,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    },
  }
}

type SigEntry = { signature: string; err: unknown; slot: number | null; blockTime: number | null }

async function recentSignatures(network: string, address: string, limit: number): Promise<SigEntry[]> {
  const result = await rpc<SigEntry[] | null>(network, 'getSignaturesForAddress', [address, { limit, commitment: FINALIZED }])
  return (result ?? []).filter((s) => s.err == null)
}

// ─── Invoice lifecycle ───────────────────────────────────────────────────────

export type SerializedInvoice = {
  id: string
  orgId: string
  kind: string
  plan: string
  months: number
  amountBaseUnits: string
  amountUi: string
  currency: string
  network: string
  treasuryAddress: string
  treasuryAta: string
  status: string
  payUri: string
  explorerTreasury: string
  confirmedSignature: string | null
  explorerTx: string | null
  confirmedAt: string | null
  expiresAt: string
  createdAt: string
}

type InvoiceRow = {
  id: string; orgId: string; kind: string; plan: string; months: number
  amountBaseUnits: string; currency: string; network: string; treasuryAddress: string
  status: string; confirmedSignature: string | null; confirmedAt: Date | null
  expiresAt: Date; createdAt: Date
}

export function serializeInvoice(row: InvoiceRow): SerializedInvoice {
  const cfg = billingConfig()
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    plan: row.plan,
    months: row.months,
    amountBaseUnits: row.amountBaseUnits,
    amountUi: formatBaseUnits(row.amountBaseUnits, cfg.decimals, { group: false }),
    currency: row.currency,
    network: row.network,
    treasuryAddress: row.treasuryAddress,
    treasuryAta: cfg.treasuryAta,
    status: row.status,
    payUri: row.status === 'PENDING' ? solanaPayUri(row.amountBaseUnits, cfg.decimals, row.treasuryAddress, cfg.mint, 'AZIMARA RELAY subscription', `Invoice ${row.id} — ${row.plan}`) : '',
    explorerTreasury: explorerAddressUrl(row.treasuryAddress, row.network),
    confirmedSignature: row.confirmedSignature,
    explorerTx: row.confirmedSignature ? explorerTxUrl(row.confirmedSignature, row.network) : null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

const MONTH_MS = 30 * 24 * 3600 * 1000

/// Micro-suffix in [1, 999998] derived from a seed — makes each invoice's USDC
/// amount globally unique so one incoming transfer matches exactly one invoice.
function uniqueSuffix(seed: string, salt: number): number {
  const digest = createHash('sha256').update(`${seed}:${salt}`).digest()
  const n = digest.readUInt32BE(0)
  return (n % 999_998) + 1
}

async function uniqueAmountBaseUnits(priceMonthlyUsd: number, months: number, seed: string, decimals: number): Promise<string> {
  const base = BigInt(Math.round(priceMonthlyUsd * 10 ** decimals)) * BigInt(months)
  for (let salt = 0; salt < 16; salt++) {
    const candidate = (base + BigInt(uniqueSuffix(seed, salt))).toString()
    const clash = await db.subscriptionInvoice.findFirst({ where: { amountBaseUnits: candidate, status: 'PENDING' }, select: { id: true } })
    if (!clash) return candidate
  }
  throw new ApiError('INVOICE_AMOUNT_COLLISION', 'Could not generate a unique invoice amount, try again', 500)
}

export async function createInvoiceForPlan(orgId: string, plan: PlanId, kind: 'UPGRADE' | 'RENEWAL', months = 1) {
  const planRow = PLANS[plan]
  if (!planRow) throw new ApiError('VALIDATION_FAILED', `Unknown plan: ${plan}`, 422)
  const price = planRow.priceMonthlyUsd
  if (price == null) {
    throw new ApiError('CUSTOM_QUOTE_REQUIRED', 'Enterprise is priced by contract — contact sales to proceed.', 422)
  }
  const clampedMonths = Math.min(12, Math.max(1, Math.floor(months)))
  const cfg = billingConfig()

  // One live invoice per organization: superseding older pending invoices keeps
  // on-chain amount matching unambiguous.
  const superseded = await db.subscriptionInvoice.updateMany({
    where: { orgId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
  if (superseded.count > 0) {
    await db.billingEvent.create({ data: { orgId, type: 'INVOICE_SUPERSEDED', dataJson: JSON.stringify({ count: superseded.count }) } })
  }

  const invoice = await db.subscriptionInvoice.create({
    data: {
      orgId,
      kind,
      plan,
      months: clampedMonths,
      amountBaseUnits: await uniqueAmountBaseUnits(price, clampedMonths, `${orgId}:${plan}:${Date.now()}`, cfg.decimals),
      currency: 'USDC',
      network: cfg.network,
      treasuryAddress: cfg.treasuryAddress,
      expiresAt: new Date(Date.now() + cfg.invoiceValidityHours * 3600 * 1000),
      metaJson: JSON.stringify({ priceMonthlyUsd: price }),
    },
  })
  await db.billingEvent.create({
    data: { orgId, type: kind === 'UPGRADE' ? 'INVOICE_CREATED' : 'RENEWAL_INVOICE_CREATED', dataJson: JSON.stringify({ invoiceId: invoice.id, plan, months: clampedMonths, amountUi: formatBaseUnits(invoice.amountBaseUnits, cfg.decimals, { group: false }) }) },
  })
  return invoice
}

/// Marks an invoice confirmed exactly once (conditional update), applies the
/// entitlement and records audit + billing events + deposit.
async function confirmInvoiceWithTransfer(invoiceId: string, transfer: IncomingTransfer, cfg: BillingConfig) {
  const existing = await db.subscriptionInvoice.findUnique({ where: { id: invoiceId } })
  if (!existing || existing.status !== 'PENDING') return null
  const claimed = await db.subscriptionInvoice.updateMany({
    where: { id: invoiceId, status: 'PENDING' },
    data: {
      status: 'CONFIRMED',
      confirmedSignature: transfer.signature,
      confirmedSlot: transfer.slot ?? undefined,
      confirmedAt: transfer.blockTime ?? new Date(),
    },
  })
  if (claimed.count === 0) return null // concurrent claim/sweep won the race

  const months = existing.months
  if (existing.kind === 'UPGRADE') {
    const ent = entitlementsFor(existing.plan)
    await db.organization.update({ where: { id: existing.orgId }, data: { plan: existing.plan, planStatus: 'ACTIVE' } })
    await db.subscription.upsert({
      where: { orgId: existing.orgId },
      create: {
        orgId: existing.orgId,
        plan: existing.plan,
        status: 'ACTIVE',
        seatLimit: ent.seats,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + months * MONTH_MS),
      },
      update: {
        plan: existing.plan,
        status: 'ACTIVE',
        seatLimit: ent.seats,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + months * MONTH_MS),
      },
    })
    await db.billingEvent.create({
      data: { orgId: existing.orgId, type: 'PLAN_PURCHASED', dataJson: JSON.stringify({ plan: existing.plan, invoiceId: invoiceId, signature: transfer.signature, amountBaseUnits: transfer.amountBaseUnits, months }) },
    })
    await audit({ orgId: existing.orgId, actorType: 'SYSTEM', action: 'PLAN_PURCHASED', resourceType: 'SubscriptionInvoice', resourceId: invoiceId, data: { plan: existing.plan, signature: transfer.signature, amountBaseUnits: transfer.amountBaseUnits } })
    await notify(existing.orgId, {
      type: 'PLAN_PURCHASED',
      title: `${existing.plan} plan activated`,
      body: `Payment of ${formatBaseUnits(transfer.amountBaseUnits, cfg.decimals)} USDC confirmed on ${cfg.network}. Entitlements are live.`,
      link: '#/app/billing',
    })
  } else {
    const sub = await db.subscription.findUnique({ where: { orgId: existing.orgId } })
    const from = sub && sub.periodEnd > new Date() ? sub.periodEnd : new Date()
    await db.subscription.upsert({
      where: { orgId: existing.orgId },
      create: {
        orgId: existing.orgId,
        plan: existing.plan,
        status: 'ACTIVE',
        seatLimit: entitlementsFor(existing.plan).seats,
        periodStart: new Date(),
        periodEnd: new Date(from.getTime() + months * MONTH_MS),
      },
      update: { status: 'ACTIVE', periodEnd: new Date(from.getTime() + months * MONTH_MS) },
    })
    await db.organization.update({ where: { id: existing.orgId }, data: { planStatus: 'ACTIVE' } })
    await db.billingEvent.create({
      data: { orgId: existing.orgId, type: 'RENEWAL_PAID', dataJson: JSON.stringify({ plan: existing.plan, invoiceId: invoiceId, signature: transfer.signature, amountBaseUnits: transfer.amountBaseUnits, months }) },
    })
    await audit({ orgId: existing.orgId, actorType: 'SYSTEM', action: 'RENEWAL_PAID', resourceType: 'SubscriptionInvoice', resourceId: invoiceId, data: { plan: existing.plan, signature: transfer.signature, amountBaseUnits: transfer.amountBaseUnits } })
    await notify(existing.orgId, {
      type: 'RENEWAL_PAID',
      title: 'Subscription renewed',
      body: `${months} month${months > 1 ? 's' : ''} added — ${formatBaseUnits(transfer.amountBaseUnits, cfg.decimals)} USDC confirmed on ${cfg.network}.`,
      link: '#/app/billing',
    })
  }

  await db.treasuryDeposit.upsert({
    where: { signature: transfer.signature },
    create: {
      signature: transfer.signature,
      network: cfg.network,
      mint: cfg.mint,
      amountBaseUnits: transfer.amountBaseUnits,
      sourceOwner: transfer.sourceOwner,
      destination: transfer.destination || cfg.treasuryAta,
      slot: transfer.slot,
      blockTime: transfer.blockTime,
      status: 'MATCHED',
      invoiceId,
      orgId: existing.orgId,
    },
    update: { status: 'MATCHED', invoiceId, orgId: existing.orgId },
  })
  return db.subscriptionInvoice.findUnique({ where: { id: invoiceId } })
}

/// Claim path: verify a customer-supplied transaction signature against the
/// real chain, match it to a pending invoice, provision entitlements.
export async function verifySignatureClaim(orgId: string, signature: string) {
  const cfg = billingConfig()
  const sig = signature.trim()
  if (!isValidSignatureFormat(sig)) {
    throw new ApiError('INVALID_SIGNATURE', 'That is not a Solana transaction signature', 422)
  }

  // Idempotent claim: the same signature never double-credits anything.
  const priorInvoice = await db.subscriptionInvoice.findUnique({ where: { confirmedSignature: sig } })
  if (priorInvoice && priorInvoice.orgId === orgId) return { invoice: serializeInvoice(priorInvoice), idempotent: true }
  const priorDeposit = await db.treasuryDeposit.findUnique({ where: { signature: sig } })
  if (priorDeposit) {
    throw new ApiError('SIGNATURE_ALREADY_RECORDED', `This transaction was already recorded (${priorDeposit.status.toLowerCase()}), no new credit can be created from it.`, 409)
  }

  const { transfer, notFound, failed } = await extractIncomingTransfer(cfg.network, sig, cfg.treasuryAddress, cfg.mint).catch((err) => {
    throw new ApiError('RPC_UNAVAILABLE', `Could not read the transaction from ${cfg.network}: ${String(err).slice(0, 200)}`, 503)
  })
  if (notFound) {
    throw new ApiError('SIGNATURE_NOT_FOUND', 'Transaction not found on-chain yet — finality can take a few seconds. Retry shortly.', 404)
  }
  if (failed) {
    throw new ApiError('TRANSACTION_FAILED', 'That transaction failed on-chain (no transfer settled).', 422)
  }
  if (!transfer) {
    throw new ApiError('NO_MATCHING_TRANSFER', `No incoming USDC transfer to the treasury ${shortAddr(cfg.treasuryAddress)} found in that transaction.`, 422)
  }

  // Match: exact base-unit amount among this deployment's pending invoices,
  // within the invoice validity window (clock skew tolerant on both sides).
  const candidates = await db.subscriptionInvoice.findMany({
    where: { amountBaseUnits: transfer.amountBaseUnits, status: 'PENDING', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
  })
  const matched = candidates.find((c) => {
    if (c.network !== cfg.network) return false
    const bt = transfer.blockTime?.getTime() ?? Date.now()
    return bt >= c.createdAt.getTime() - 120_000
  }) ?? candidates.find((c) => c.network === cfg.network)

  if (!matched) {
    await db.treasuryDeposit.upsert({
      where: { signature: sig },
      create: {
        signature: sig,
        network: cfg.network,
        mint: cfg.mint,
        amountBaseUnits: transfer.amountBaseUnits,
        sourceOwner: transfer.sourceOwner,
        destination: transfer.destination || cfg.treasuryAta,
        slot: transfer.slot,
        blockTime: transfer.blockTime,
        status: 'UNMATCHED',
      },
      update: { status: 'UNMATCHED' },
    })
    await audit({ orgId, actorType: 'SYSTEM', action: 'TREASURY_DEPOSIT_UNMATCHED', resourceType: 'TreasuryDeposit', resourceId: sig, data: { amountBaseUnits: transfer.amountBaseUnits, mint: cfg.mint } })
    throw new ApiError(
      'NO_MATCHING_PENDING_INVOICE',
      `Payment received (${formatBaseUnits(transfer.amountBaseUnits, cfg.decimals, { group: false })} USDC) but it does not match any pending invoice amount. Invoices must be paid with the exact amount shown.`,
      422,
      { amountBaseUnits: transfer.amountBaseUnits },
    )
  }

  const confirmed = await confirmInvoiceWithTransfer(matched.id, transfer, cfg)
  if (!confirmed) {
    // Lost a race against the sweep — surface the final state honestly.
    const final = await db.subscriptionInvoice.findUnique({ where: { id: matched.id } })
    if (final?.confirmedSignature === sig) return { invoice: serializeInvoice(final), idempotent: true }
    throw new ApiError('INVOICE_NO_LONGER_PENDING', 'That invoice was already processed by another path.', 409)
  }
  return { invoice: serializeInvoice(confirmed), idempotent: false }
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

/// Background sweep: expire stale invoices, watch the treasury (owner address
/// + derived USDC ATA), match new incoming transfers to pending invoices.
/// Runs as the BILLING_SWEEP cron job; throws so the queue retries/backsoffs.
export async function sweepTreasuryDeposits() {
  const cfg = billingConfig()
  const health = await billingRpcHealth()
  if (!health.ok) throw new Error(`RPC unhealthy for ${cfg.network}: ${health.error ?? 'no detail'}`)

  // Expire unpaid invoices whose validity window passed.
  const expired = await db.subscriptionInvoice.findMany({ where: { status: 'PENDING', expiresAt: { lt: new Date() } }, select: { id: true, orgId: true, plan: true } })
  for (const inv of expired) {
    await db.subscriptionInvoice.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'EXPIRED' } })
    await db.billingEvent.create({ data: { orgId: inv.orgId, type: 'INVOICE_EXPIRED', dataJson: JSON.stringify({ invoiceId: inv.id, plan: inv.plan }) } })
  }

  // Watch both the owner address and the USDC ATA: a plain SPL transfer always
  // includes the destination token account in its keys, while the owner may
  // not appear at all (e.g. ATA created in-tx by a funder).
  const [sigsOwner, sigsAta] = await Promise.all([
    recentSignatures(cfg.network, cfg.treasuryAddress, 15),
    recentSignatures(cfg.network, cfg.treasuryAta, 15),
  ])
  const seen = new Map<string, SigEntry>()
  for (const s of [...sigsOwner, ...sigsAta]) seen.set(s.signature, s)

  let matched = 0
  let unmatched = 0
  // Cap chain reads per tick: a treasury flooded with traffic must not burn
  // the RPC quota in one pass — the next tick continues from where this left.
  let budget = 5
  for (const entry of seen.values()) {
    if (budget <= 0) break
    const alreadyDeposit = await db.treasuryDeposit.findUnique({ where: { signature: entry.signature }, select: { id: true } })
    const alreadyInvoice = await db.subscriptionInvoice.findUnique({ where: { confirmedSignature: entry.signature }, select: { id: true } })
    if (alreadyDeposit || alreadyInvoice) continue
    budget -= 1

    const { transfer } = await extractIncomingTransfer(cfg.network, entry.signature, cfg.treasuryAddress, cfg.mint)
    if (!transfer) continue // SOL-only tx, outgoing, or unrelated token — skip

    const candidates = await db.subscriptionInvoice.findMany({
      where: { amountBaseUnits: transfer.amountBaseUnits, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    })
    const matchedInvoice = candidates.find((c) => c.network === cfg.network)
    if (matchedInvoice) {
      const confirmed = await confirmInvoiceWithTransfer(matchedInvoice.id, transfer, cfg)
      if (confirmed) matched += 1
    } else {
      await db.treasuryDeposit.upsert({
        where: { signature: transfer.signature },
        create: {
          signature: transfer.signature,
          network: cfg.network,
          mint: cfg.mint,
          amountBaseUnits: transfer.amountBaseUnits,
          sourceOwner: transfer.sourceOwner,
          destination: transfer.destination || cfg.treasuryAta,
          slot: transfer.slot,
          blockTime: transfer.blockTime,
          status: 'UNMATCHED',
        },
        update: { status: 'UNMATCHED' },
      })
      await audit({ orgId: null, actorType: 'SYSTEM', action: 'TREASURY_DEPOSIT_UNMATCHED', resourceType: 'TreasuryDeposit', resourceId: transfer.signature, data: { amountBaseUnits: transfer.amountBaseUnits, mint: cfg.mint, network: cfg.network } })
      unmatched += 1
    }
  }
  return { scanned: seen.size, matched, unmatched, expired: expired.length }
}
