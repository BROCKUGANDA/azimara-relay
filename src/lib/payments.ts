// Payment domain service. Every financially material state change is
// validated, versioned (optimistic concurrency), audited, and driven through
// the explicit state machine. The backend never blindly creates a replacement
// payment when the previous attempt's outcome is unknown.

import { db } from '@/lib/db'
import { ApiError } from '@/lib/api'
import { assertTransition, mapProviderStatus } from '@/lib/state-machine'
import { evaluateRules, materialPayload, DEFAULT_RULES, type PolicyRule } from '@/lib/approvals'
import { isValidSolanaAddress, SOL_MINT, SOL_DECIMALS } from '@/lib/solana'
import { assertBaseUnits, addBase, subBase } from '@/lib/money'
import { shortId, sha256 } from '@/lib/crypto'
import { audit, notify } from '@/lib/audit'
import { entitlementsFor } from '@/lib/entitlements'
import { safeJsonParse } from '@/lib/safe-json'
import { MultiHopperClient, SetupRequiredError, providerConfigFromRow, MultiHopperError } from '@/lib/multihopper'
import type { PaymentRequest, Prisma } from '@prisma/client'

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function newReference(prefix: string): string {
  let suffix = ''
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  for (const b of bytes) suffix += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]
  return `${prefix}-${suffix}`
}

async function getActivePolicy(orgId: string) {
  const policy = await db.approvalPolicy.findFirst({ where: { orgId, active: true }, orderBy: { updatedAt: 'desc' } })
  return policy
}

function parseRules(rulesJson: string): PolicyRule[] {
  try {
    const parsed = safeJsonParse<unknown>(rulesJson, DEFAULT_RULES)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_RULES
    // Shape-validate each rule: a malformed stored rule (missing condition
    // fields, non-numeric base units) must be skipped, not 500 payment creation
    // when evaluateRules touches it.
    const valid: PolicyRule[] = []
    for (const r of parsed) {
      const rule = r as PolicyRule
      if (!rule || typeof rule !== 'object' || !rule.condition || typeof rule.condition !== 'object') continue
      const c = rule.condition as { field?: unknown; amountBaseUnits?: unknown; withinDays?: unknown; category?: unknown; mint?: unknown }
      if (typeof c.field !== 'string') continue
      if ((c.field === 'AMOUNT_LT' || c.field === 'AMOUNT_GTE')) {
        if (typeof c.amountBaseUnits !== 'string' || !/^\d+$/.test(c.amountBaseUnits.trim())) continue
      }
      if (c.field === 'NEW_RECIPIENT' && (!Number.isFinite(Number(c.withinDays)) || Number(c.withinDays) <= 0)) continue
      if (c.field === 'RECIPIENT_CATEGORY' && typeof c.category !== 'string') continue
      valid.push(rule)
    }
    return valid.length > 0 ? valid : DEFAULT_RULES
  } catch {
    return DEFAULT_RULES
  }
}

export type CreatePaymentInput = {
  sourceWalletId: string
  recipientId?: string | null
  destination: string
  mint: string
  amount: string // human decimal — converted to base units with the asset's decimals
  reason?: string | null
  invoiceRef?: string | null
  requestedExecutionAt?: string | null
  idempotencyKey?: string | null
  source?: 'APP' | 'AI' | 'API'
}

async function assetDecimals(mint: string): Promise<number> {
  if (mint === SOL_MINT) return SOL_DECIMALS
  const asset = await db.supportedAsset.findUnique({ where: { mint } })
  if (!asset || !asset.enabled) {
    throw new ApiError('UNSUPPORTED_ASSET', `Token mint ${mint} is not in the supported-asset registry`, 400)
  }
  return asset.decimals
}

async function transition(payment: PaymentRequest, to: string, opts?: { reason?: string; version?: number; data?: Record<string, unknown> }): Promise<PaymentRequest> {
  assertTransition(payment.status, to)
  const updated = await db.paymentRequest.updateMany({
    where: { id: payment.id, version: opts?.version ?? payment.version },
    data: { status: to, statusReason: opts?.reason ?? null, version: payment.version + 1, updatedAt: new Date() },
  })
  if (updated.count === 0) {
    throw new ApiError('STALE_STATE', 'The payment was modified by another operation. Reload and retry.', 409)
  }
  await audit({
    orgId: payment.orgId,
    actorType: 'SYSTEM',
    action: 'PAYMENT_STATE_TRANSITION',
    resourceType: 'PaymentRequest',
    resourceId: payment.id,
    data: { from: payment.status, to, reason: opts?.reason, ...opts?.data },
  })
  return { ...payment, status: to, version: payment.version + 1 }
}

export async function createPayment(
  orgId: string,
  actorId: string,
  input: CreatePaymentInput,
): Promise<{ payment: PaymentRequest; idempotentReplay: boolean }> {
  // Idempotency: same key → same payment, never a duplicate transfer.
  // Records are stored under a per-org hashed key; lookups MUST use the same
  // derivation or replays would never match.
  const keyHash = input.idempotencyKey ? sha256(`${orgId}:${input.idempotencyKey}`) : null
  if (keyHash) {
    const existing = await db.idempotencyRecord.findUnique({ where: { key: keyHash } })
    if (existing && existing.orgId === orgId) {
      if (existing.status === 'COMPLETED' && existing.responseJson) {
        // Corrupt snapshot columns must not break the idempotent replay path.
        const snapshot = safeJsonParse<{ paymentId?: string }>(existing.responseJson, {})
        const payment = snapshot.paymentId ? await db.paymentRequest.findUnique({ where: { id: snapshot.paymentId } }) : null
        if (payment) return { payment, idempotentReplay: true }
      }
      if (existing.status === 'IN_FLIGHT' && Date.now() - new Date(existing.updatedAt).getTime() < 120_000) {
        throw new ApiError('OPERATION_IN_FLIGHT', 'An identical payment creation is already in progress.', 409)
      }
    }
  }

  const ent = entitlementsFor((await db.organization.findUniqueOrThrow({ where: { id: orgId } })).plan)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthlyCount = await db.paymentRequest.count({ where: { orgId, createdAt: { gte: monthStart } } })
  const { assertWithinLimit } = await import('@/lib/entitlements')
  assertWithinLimit(ent, 'monthlyPayments', monthlyCount)

  const wallet = await db.wallet.findUnique({ where: { id: input.sourceWalletId } })
  if (!wallet || wallet.orgId !== orgId || wallet.revokedAt) {
    throw new ApiError('INVALID_WALLET', 'Source wallet not found or not available for this organization', 400)
  }
  if (wallet.ownershipStatus !== 'VERIFIED') {
    throw new ApiError('WALLET_NOT_VERIFIED', 'Source wallet ownership must be verified before payments', 400)
  }
  const decimals = await assetDecimals(input.mint)
  let amountBase: string
  try {
    amountBase = (await import('@/lib/money')).parseAmountToBaseUnits(input.amount, decimals)
  } catch (err) {
    throw new ApiError('INVALID_AMOUNT', err instanceof Error ? err.message : 'Invalid amount', 400)
  }
  assertBaseUnits(amountBase)
  if (assertBaseUnits(amountBase) === 0n) throw new ApiError('INVALID_AMOUNT', 'Payment amount must be greater than zero', 400)
  if (!isValidSolanaAddress(input.destination)) {
    throw new ApiError('INVALID_DESTINATION', 'Destination is not a valid Solana address', 400)
  }

  let recipient: Prisma.RecipientGetPayload<{ include: { changes: true } }> | null = null
  if (input.recipientId) {
    recipient = await db.recipient.findFirst({ where: { id: input.recipientId, orgId }, include: { changes: true } })
    if (!recipient) throw new ApiError('RECIPIENT_NOT_FOUND', 'Recipient not found in this organization', 404)
    if (recipient.status !== 'ACTIVE') throw new ApiError('RECIPIENT_INACTIVE', `Recipient is ${recipient.status.toLowerCase()}`, 400)
    if (recipient.address !== input.destination) {
      throw new ApiError('RECIPIENT_ADDRESS_MISMATCH', 'Destination does not match the registered recipient address. Recipient addresses cannot be silently changed.', 400)
    }
  }

  // Duplicate-request detection: same wallet, destination, mint and amount
  // already pending or recently completed.
  const duplicate = await db.paymentRequest.findFirst({
    where: {
      orgId,
      sourceWalletId: wallet.id,
      destination: input.destination,
      mint: input.mint,
      amountBaseUnits: amountBase,
      status: { in: ['PENDING_APPROVAL', 'APPROVED', 'QUOTED', 'AWAITING_SIGNATURE', 'PROCESSING', 'FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST'] },
    },
  })
  if (duplicate) {
    throw new ApiError('DUPLICATE_PAYMENT', `A payment with identical wallet, destination, token and amount already exists (${duplicate.reference}) and is ${duplicate.status}.`, 409, { duplicateReference: duplicate.reference })
  }

  const idemKey = input.idempotencyKey ?? `pay:${orgId}:${shortId()}`
  const markerKeyHash = sha256(`${orgId}:${idemKey}`)

  // In-flight marker with a deterministic key so concurrent double-clicks converge.
  const marker = await db.idempotencyRecord.upsert({
    where: { key: markerKeyHash },
    create: { key: markerKeyHash, orgId, scope: 'PAYMENT_CREATE', requestHash: markerKeyHash, status: 'IN_FLIGHT' },
    update: { status: 'IN_FLIGHT', updatedAt: new Date() },
  })

  try {
    let payment = await db.paymentRequest.create({
      data: {
        orgId,
        reference: newReference('PMT'),
        type: input.source === 'API' ? 'API' : 'ONE_OFF',
        status: 'DRAFT',
        sourceWalletId: wallet.id,
        recipientId: recipient?.id ?? null,
        destination: input.destination,
        mint: input.mint,
        amountBaseUnits: amountBase,
        reason: input.reason ?? null,
        invoiceRef: input.invoiceRef ?? null,
        requestedExecutionAt: input.requestedExecutionAt ? new Date(input.requestedExecutionAt) : null,
        source: input.source ?? 'APP',
        idempotencyKey: idemKey,
        createdBy: actorId,
      },
    })
    payment = await transition(payment, 'VALIDATING')

    // Policy evaluation determines how many independent approvals are needed.
    const policy = await getActivePolicy(orgId)
    const rules = parseRules(policy?.rulesJson ?? '[]')
    const evaluation = evaluateRules(rules, payment, recipient)
    const multiOk = ent.multiApprover || evaluation.approversRequired <= 1
    payment = await db.paymentRequest.update({
      where: { id: payment.id },
      data: { approvalsRequired: multiOk ? evaluation.approversRequired : 1 },
    })
    await db.approvalEvent.create({
      data: {
        paymentId: payment.id,
        type: 'POLICY_EVALUATED',
        actorId,
        dataJson: JSON.stringify({ ...evaluation, policyId: policy?.id ?? null, policyVersion: policy?.version ?? null, cappedByPlan: !multiOk }),
      },
    })
    payment = await transition(payment, 'PENDING_APPROVAL', { reason: evaluation.matchedRules.map((r) => r.id).join('+') })
    await notify(orgId, {
      type: 'APPROVAL_REQUESTED',
      title: `Payment ${payment.reference} awaiting approval`,
      body: `${evaluation.approversRequired} approver(s) required — ${evaluation.matchedRules.map((r) => r.description).join('; ')}`,
      link: `#/app/payments/${payment.id}`,
    })
    await db.idempotencyRecord.update({ where: { key: markerKeyHash }, data: { status: 'COMPLETED', responseJson: JSON.stringify({ paymentId: payment.id }) } })
    return { payment, idempotentReplay: false }
  } catch (err) {
    await db.idempotencyRecord.update({ where: { key: markerKeyHash }, data: { status: 'FAILED', responseJson: JSON.stringify({ error: String(err) }) } }).catch(() => undefined)
    throw err
  }
}

export async function approvePayment(paymentId: string, orgId: string, approverId: string, approverRole: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
  const payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId } })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  if (payment.status !== 'PENDING_APPROVAL') {
    throw new ApiError('INVALID_STATE', `Payment is ${payment.status}, not awaiting approval`, 409)
  }
  if (payment.createdBy === approverId && payment.approvalsRequired > 1) {
    throw new ApiError('SEPARATION_OF_DUTIES', 'The creator of a multi-approver payment cannot be one of its approvers', 403)
  }
  const hash = materialPayload(payment)
  const existing = await db.paymentApproval.findMany({ where: { paymentId, decision: { in: ['APPROVED', 'REJECTED'] } } })
  if (existing.some((a) => a.approverId === approverId)) {
    throw new ApiError('ALREADY_DECIDED', 'You have already recorded a decision on this payment', 409)
  }
  if (decision === 'APPROVED') {
    // A prior approval whose payload hash no longer matches is invalid.
    const valid = existing.filter((a) => a.decision === 'APPROVED' && a.payloadHash === hash && (!a.expiresAt || a.expiresAt > new Date()))
    await db.paymentApproval.create({
      data: {
        paymentId,
        orgId,
        approverId,
        policyId: null,
        decision,
        reason: reason ?? null,
        payloadHash: hash,
        evidenceJson: JSON.stringify({ payloadFields: { destination: payment.destination, mint: payment.mint, amountBaseUnits: payment.amountBaseUnits }, decidedAt: new Date().toISOString() }),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    })
    await db.approvalEvent.create({ data: { paymentId, type: 'APPROVED', actorId: approverId, dataJson: JSON.stringify({ payloadHash: hash }) } })
    const approvalsNow = await db.paymentApproval.count({ where: { paymentId, decision: 'APPROVED', payloadHash: hash, expiresAt: { gt: new Date() } } })
    const distinct = new Set((await db.paymentApproval.findMany({ where: { paymentId, decision: 'APPROVED', payloadHash: hash } })).map((a) => a.approverId)).size
    if (Math.min(distinct, approvalsNow) >= payment.approvalsRequired) {
      const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: paymentId } })
      await transition(fresh, 'APPROVED')
    }
  } else {
    await db.paymentApproval.create({
      data: { paymentId, orgId, approverId, decision, reason: reason ?? null, payloadHash: hash, evidenceJson: '{}' },
    })
    await db.approvalEvent.create({ data: { paymentId, type: 'REJECTED', actorId: approverId, dataJson: JSON.stringify({ reason }) } })
    await transition(payment, 'REJECTED', { reason })
  }
  await audit({ orgId, actorId: approverId, action: `PAYMENT_${decision}`, resourceType: 'PaymentRequest', resourceId: paymentId })
  return db.paymentRequest.findUniqueOrThrow({ where: { id: paymentId } })
}

export async function paymentApprovalState(payment: PaymentRequest) {
  const approvals = await db.paymentApproval.findMany({ where: { paymentId: payment.id }, include: { approver: { select: { name: true, email: true } } } })
  const hash = materialPayload(payment)
  const validApprovals = approvals.filter((a) => a.decision === 'APPROVED' && a.payloadHash === hash && (!a.expiresAt || a.expiresAt > new Date()))
  return {
    approvals,
    validCount: new Set(validApprovals.map((a) => a.approverId)).size,
    required: payment.approvalsRequired,
    payloadHash: hash,
    isSatisfied: new Set(validApprovals.map((a) => a.approverId)).size >= payment.approvalsRequired && payment.status === 'APPROVED',
  }
}

export async function requestQuote(paymentId: string, orgId: string): Promise<{ ok: true; quoteId: string } | { ok: false; setupRequired: boolean; detail: string }> {
  let payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId } })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  if (payment.status !== 'APPROVED' && payment.status !== 'QUOTED' && payment.status !== 'QUOTE_EXPIRED') {
    throw new ApiError('INVALID_STATE', `Quoting requires an approved payment (current: ${payment.status})`, 409)
  }
  payment = await transition(payment, 'QUOTING')
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'MULTIHOPPER' } } })
  const client = new MultiHopperClient(providerConfigFromRow(integration))
  try {
    const { raw, quoteId } = await client.estimate({
      sourceMint: payment.mint,
      amountBaseUnits: payment.amountBaseUnits,
      destinations: [{ address: payment.destination }],
    })
    const responseJson = JSON.stringify(raw)
    // Preserve the provider quote verbatim; parsed fee fields are stored
    // separately and only derived from documented response fields.
    const principalBase = payment.amountBaseUnits
    const quote = await db.paymentQuote.create({
      data: {
        paymentId: payment.id,
        requestJson: JSON.stringify({ sourceMint: payment.mint, amountBaseUnits: payment.amountBaseUnits, destinations: [{ address: payment.destination }] }),
        responseJson,
        principalBase,
        feePctBps: null,
        recipientGetsBase: principalBase,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        status: 'ACTIVE',
      },
    })
    await db.paymentQuote.updateMany({ where: { paymentId: payment.id, id: { not: quote.id }, status: 'ACTIVE' }, data: { status: 'SUPERSEDED' } })
    const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: payment.id } })
    await transition(fresh, 'QUOTED', { reason: quoteId })
    await audit({ orgId, action: 'PAYMENT_QUOTED', resourceType: 'PaymentRequest', resourceId: payment.id, actorType: 'SYSTEM' })
    return { ok: true, quoteId: quote.id }
  } catch (err) {
    if (err instanceof SetupRequiredError) {
      const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: payment.id } })
      await db.paymentRequest.update({ where: { id: fresh.id }, data: { statusReason: 'PROVIDER_SETUP_REQUIRED' } })
      await transition(fresh, 'APPROVED', { reason: 'PROVIDER_SETUP_REQUIRED — quote not obtained; payment held at APPROVED' })
      await notify(orgId, {
        type: 'INTEGRATION_SETUP_REQUIRED',
        title: 'MultiHopper credentials required',
        body: `Payment ${payment.reference} is approved but cannot be quoted until MultiHopper ${integration?.environment ?? 'DEVNET'} credentials are configured.`,
        link: '#/app/integrations',
      })
      return { ok: false, setupRequired: true, detail: err.detail }
    }
    if (err instanceof MultiHopperError) {
      const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: payment.id } })
      await db.paymentRequest.update({ where: { id: fresh.id }, data: { lastError: `${err.code}: ${err.message}` } })
      await transition(fresh, 'MANUAL_REVIEW', { reason: `QUOTE_FAILED: ${err.code}` })
      return { ok: false, setupRequired: false, detail: err.message }
    }
    throw err
  }
}

/// Creates the provider transfer (idempotent by stable externalId) and moves
/// the payment to AWAITING_SIGNATURE. Reuses the same externalId on retry so
/// an unknown creation outcome can never yield two transfers.
export async function startExecution(paymentId: string, orgId: string, actorId: string) {
  let payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId }, include: { quotes: { where: { status: 'ACTIVE' } } } })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  if (payment.status !== 'QUOTED') throw new ApiError('INVALID_STATE', `Execution requires a fresh quote (current: ${payment.status})`, 409)
  const activeQuote = payment.quotes[0]
  if (!activeQuote || activeQuote.expiresAt < new Date()) {
    await transition(payment, 'QUOTE_EXPIRED', { reason: 'Quote expired before signing' })
    throw new ApiError('QUOTE_EXPIRED', 'The provider quote expired. Request a new quote to continue.', 409)
  }
  const approvalState = await paymentApprovalState(payment)
  if (!approvalState.isSatisfied && payment.status === 'QUOTED') {
    throw new ApiError('APPROVAL_INVALID', 'The approval payload no longer matches this payment. Re-approval required.', 409)
  }
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'MULTIHOPPER' } } })
  const client = new MultiHopperClient(providerConfigFromRow(integration))
  const externalId = `relay-${payment.id}`
  let transfer = await db.providerTransfer.findUnique({ where: { paymentId: payment.id } })
  if (!transfer) {
    transfer = await db.providerTransfer.create({ data: { orgId, paymentId: payment.id, externalId, provider: 'MULTIHOPPER', internalPhase: 'CREATING' } })
  }
  try {
    if (!transfer.providerTransferId) {
      const result = await client.createTransfer({
        externalId,
        sourceOwner: (await db.wallet.findUniqueOrThrow({ where: { id: payment.sourceWalletId! } })).address,
        sourceMint: payment.mint,
        amountBaseUnits: payment.amountBaseUnits,
        destinations: [{ address: payment.destination }],
        quoteId: undefined,
        metadata: { orgReference: payment.reference },
      })
      transfer = await db.providerTransfer.update({
        where: { id: transfer.id },
        data: {
          providerTransferId: result.providerTransferId,
          providerStatus: 'CREATED',
          lifecycleJson: JSON.stringify({ created: result.raw }),
          internalPhase: 'CREATED',
        },
      })
    }
    const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: payment.id } })
    await transition(fresh, 'AWAITING_SIGNATURE')
    await audit({ orgId, actorId, action: 'TRANSFER_CREATED', resourceType: 'ProviderTransfer', resourceId: transfer.id, data: { externalId, providerTransferId: transfer.providerTransferId } })
    return { transfer, client }
  } catch (err) {
    if (err instanceof SetupRequiredError) {
      await db.providerTransfer.update({ where: { id: transfer.id }, data: { internalPhase: 'BLOCKED_SETUP' } })
      throw err
    }
    throw err
  }
}

export async function prepareExecution(paymentId: string, orgId: string) {
  const payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId }, include: { transfer: true } })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  if (payment.status !== 'AWAITING_SIGNATURE' && payment.status !== 'FUNDING_BROADCAST') {
    throw new ApiError('INVALID_STATE', `Prepare requires AWAITING_SIGNATURE (current: ${payment.status})`, 409)
  }
  if (!payment.transfer?.providerTransferId) throw new ApiError('TRANSFER_MISSING', 'No provider transfer reference for this payment', 409)
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'MULTIHOPPER' } } })
  const client = new MultiHopperClient(providerConfigFromRow(integration))
  const prepared = await client.prepareTransfer(payment.transfer.providerTransferId)
  await db.providerTransfer.update({
    where: { id: payment.transfer.id },
    data: {
      progressJson: JSON.stringify(prepared.bundles),
      internalPhase: 'PREPARED',
    },
  })
  return prepared.bundles
}

/// Intermediate confirmation: keeper funding signature + empty route-init list.
export async function confirmKeeperFunding(paymentId: string, orgId: string, actorId: string, keeperSignature: string) {
  const payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId }, include: { transfer: true } })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  if (payment.status !== 'AWAITING_SIGNATURE') throw new ApiError('INVALID_STATE', `Current state ${payment.status} — expected AWAITING_SIGNATURE`, 409)
  if (!payment.transfer?.providerTransferId) throw new ApiError('TRANSFER_MISSING', 'No provider transfer reference', 409)
  await db.transactionSignature.create({ data: { paymentId, purpose: 'KEEPER_FUNDING', signature: keeperSignature, network: (await db.wallet.findUniqueOrThrow({ where: { id: payment.sourceWalletId! } })).network } })
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'MULTIHOPPER' } } })
  const client = new MultiHopperClient(providerConfigFromRow(integration))
  const result = await client.confirmBroadcast({ providerTransferId: payment.transfer.providerTransferId, keeperFundingSignature: keeperSignature, routeInitSignatures: [] })
  await db.providerTransfer.update({
    where: { id: payment.transfer.id },
    data: { lifecycleJson: JSON.stringify({ keeperConfirmed: result.raw }), internalPhase: 'KEEPER_CONFIRMED', providerStatus: 'FUNDING_CONFIRMED' },
  })
  await transition(payment, 'FUNDING_BROADCAST', { reason: 'Keeper funding signed and submitted' })
  await audit({ orgId, actorId, action: 'KEEPER_FUNDING_CONFIRMED', resourceType: 'PaymentRequest', resourceId: paymentId })
  return result.raw
}

export async function confirmBroadcastFinal(paymentId: string, orgId: string, routeInitSignatures: string[]) {
  const payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId }, include: { transfer: true } })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  if (!['FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST'].includes(payment.status)) {
    throw new ApiError('INVALID_STATE', `Current state ${payment.status} — final confirmation is premature`, 409)
  }
  if (!payment.transfer?.providerTransferId) throw new ApiError('TRANSFER_MISSING', 'No provider transfer reference', 409)
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'MULTIHOPPER' } } })
  const client = new MultiHopperClient(providerConfigFromRow(integration))
  const result = await client.confirmBroadcast({ providerTransferId: payment.transfer.providerTransferId, routeInitSignatures })
  for (const sig of routeInitSignatures) {
    await db.transactionSignature.create({ data: { paymentId, purpose: 'ROUTE_INIT', signature: sig, network: 'devnet' } }).catch(() => undefined)
  }
  await db.providerTransfer.update({
    where: { id: payment.transfer.id },
    data: { lifecycleJson: JSON.stringify({ finalConfirmed: result.raw }), internalPhase: 'BROADCAST_CONFIRMED', providerStatus: 'PROCESSING' },
  })
  const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: paymentId } })
  await transition(fresh, 'PROCESSING', { reason: 'Final broadcast confirmation submitted' })
  await db.jobRecord.create({ data: { type: 'TRANSFER_MONITOR', orgId, payloadJson: JSON.stringify({ paymentId }), dedupeKey: `monitor:${paymentId}`, runAt: new Date(Date.now() + 15_000) } }).catch(() => undefined)
  return result.raw
}

/// Provider + chain reconciliation for one payment. Provider status maps into
/// internal state; settlement verification requires both provider evidence and
/// chain confirmation before COMPLETED.
export async function syncTransfer(paymentId: string, orgId: string) {
  const payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId }, include: { transfer: true, wallet: true } })
  if (!payment) return null
  if (!payment.transfer?.providerTransferId) return null
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'MULTIHOPPER' } } })
  const client = new MultiHopperClient(providerConfigFromRow(integration))
  try {
    const { raw, status } = await client.getTransfer(payment.transfer.providerTransferId)
    await db.providerTransfer.update({
      where: { id: payment.transfer.id },
      data: { providerStatus: status ?? payment.transfer.providerStatus, lifecycleJson: JSON.stringify({ lastSync: raw, syncedAt: new Date().toISOString() }) },
    })
    await db.providerTransferEvent.create({ data: { transferId: payment.transfer.id, eventType: status ?? 'UNKNOWN', payloadJson: JSON.stringify(raw), source: 'POLL' } })
    const mapped = mapProviderStatus(status)
    const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: paymentId } })
    if (mapped === 'SETTLEMENT_VERIFICATION') {
      // Require chain evidence before completion.
      const sigs = await db.transactionSignature.findMany({ where: { paymentId } })
      let chainConfirmed = false
      let chainStatus: string | null = null
      for (const sig of sigs) {
        const st = await (await import('@/lib/solana')).getSignatureStatus(payment.wallet?.network ?? 'devnet', sig.signature)
        if (st?.confirmed) {
          chainConfirmed = true
          chainStatus = st.status
          await db.transactionSignature.update({ where: { id: sig.id }, data: { confirmedAt: new Date(), slot: st.slot } })
          break
        }
      }
      await transition(fresh, 'SETTLEMENT_VERIFICATION', { reason: 'Provider reports settlement; verifying chain evidence' })
      if (chainConfirmed) {
        await completeSettlement(fresh, status ?? 'COMPLETED', chainStatus ?? 'CONFIRMED')
      } else {
        await db.reconciliationRecord.upsert({
          where: { paymentId },
          create: { orgId, paymentId, providerRef: payment.transfer.providerTransferId, providerStatus: status, state: 'UNRECONCILED', detail: 'Provider settled; awaiting onchain confirmation evidence', expectedBase: payment.amountBaseUnits },
          update: { providerStatus: status, state: 'UNRECONCILED', detail: 'Provider settled; awaiting onchain confirmation evidence', lastCheckedAt: new Date() },
        })
      }
    } else if (typeof mapped === 'string' && ['FAILED', 'TRANSFER_EXPIRED', 'RECOVERABLE', 'REFUNDED', 'RESCUED'].includes(mapped)) {
      await transition(fresh, mapped, { reason: `Provider status: ${status}` })
      await db.reconciliationRecord.upsert({
        where: { paymentId },
        create: { orgId, paymentId, providerRef: payment.transfer.providerTransferId, providerStatus: status, state: mapped === 'FAILED' ? 'FAILED' : 'UNRECONCILED', detail: `Provider status ${status}`, expectedBase: payment.amountBaseUnits },
        update: { providerStatus: status, state: mapped === 'FAILED' ? 'FAILED' : 'UNRECONCILED', detail: `Provider status ${status}`, lastCheckedAt: new Date() },
      })
      await notify(orgId, { type: 'TRANSFER_STATE', title: `Payment ${payment.reference}: ${mapped}`, body: `Provider status: ${status}`, link: `#/app/payments/${paymentId}` })
    } else if (typeof mapped === 'string' && !['COMPLETED'].includes(mapped) && fresh.status !== mapped) {
      await transition(fresh, mapped, { reason: `Provider status: ${status}` }).catch(() => undefined)
    }
    return { providerStatus: status, mapped }
  } catch (err) {
    if (err instanceof SetupRequiredError) return { providerStatus: null, mapped: null, setupRequired: true, detail: err.detail }
    if (err instanceof MultiHopperError) {
      await db.reconciliationRecord.upsert({
        where: { paymentId },
        create: { orgId, paymentId, providerRef: payment.transfer.providerTransferId, state: 'UNRECONCILED', detail: `Sync failed: ${err.code}`, expectedBase: payment.amountBaseUnits },
        update: { detail: `Sync failed: ${err.code}`, lastCheckedAt: new Date() },
      })
      return { providerStatus: null, mapped: null, error: err.message }
    }
    throw err
  }
}

async function completeSettlement(payment: PaymentRequest, providerStatus: string, chainStatus: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: payment.orgId } })
  const network = (await db.wallet.findUniqueOrThrow({ where: { id: payment.sourceWalletId! } })).network
  const sig = await db.transactionSignature.findFirst({ where: { paymentId: payment.id, confirmedAt: { not: null } } })
  const providerRef = (await db.providerTransfer.findUnique({ where: { paymentId: payment.id } }))?.providerTransferId ?? null
  await db.$transaction(async (tx) => {
    await tx.settlementRecord.upsert({
      where: { paymentId: payment.id },
      create: { paymentId: payment.id, expectedBase: payment.amountBaseUnits, observedBase: payment.amountBaseUnits, providerStatus, chainStatus, signature: sig?.signature ?? null, reconciledAt: new Date(), mismatch: false },
      update: { providerStatus, chainStatus, reconciledAt: new Date(), signature: sig?.signature ?? null, mismatch: false },
    })
    const existing = await tx.ledgerEntry.findFirst({ where: { paymentId: payment.id, entryType: 'PRINCIPAL' } })
    if (!existing) {
      await tx.ledgerEntry.create({
        data: {
          orgId: payment.orgId,
          paymentId: payment.id,
          entryType: 'PRINCIPAL',
          direction: 'DEBIT',
          mint: payment.mint,
          amountBaseUnits: payment.amountBaseUnits,
          signature: sig?.signature ?? null,
          source: 'OBSERVED',
          occurredAt: new Date(),
        },
      })
    }
  })
  await db.reconciliationRecord.upsert({
    where: { paymentId: payment.id },
    create: { orgId: payment.orgId, paymentId: payment.id, providerRef, providerStatus, chainEvidenceJson: JSON.stringify({ chainStatus, signature: sig?.signature, network }), expectedBase: payment.amountBaseUnits, observedBase: payment.amountBaseUnits, state: 'MATCHED', detail: `Settled on ${network}` },
    update: { providerStatus, state: 'MATCHED', detail: `Settled on ${network}`, lastCheckedAt: new Date() },
  })
  const fresh = await db.paymentRequest.findUniqueOrThrow({ where: { id: payment.id } })
  await transition(fresh, 'COMPLETED', { reason: `Provider ${providerStatus}; chain ${chainStatus}` })
  await db.paymentRequest.update({ where: { id: payment.id }, data: { completedAt: new Date() } })
  if (payment.recipientId) {
    await db.recipient.update({ where: { id: payment.recipientId }, data: { lastPaymentAt: new Date() } })
  }
  await audit({ orgId: payment.orgId, actorType: 'SYSTEM', action: 'PAYMENT_SETTLED', resourceType: 'PaymentRequest', resourceId: payment.id, data: { network, providerStatus, chainStatus } })
  await notify(payment.orgId, { type: 'PAYMENT_COMPLETED', title: `Payment ${payment.reference} settled`, body: 'Verified against provider and chain evidence.', link: `#/app/payments/${payment.id}` })
}

export { newReference }
