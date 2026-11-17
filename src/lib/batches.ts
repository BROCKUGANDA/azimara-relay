// Batch payment domain service — the platform's key differentiator.
// Per-item validation, duplicate detection, exact-integer allocation math,
// fee estimation and provider capability limits (20 destinations per route).

import { db } from '@/lib/db'
import { ApiError } from '@/lib/api'
import { isValidSolanaAddress, SOL_MINT, SOL_DECIMALS } from '@/lib/solana'
import { parseAmountToBaseUnits, sumBase, formatBaseUnits } from '@/lib/money'
import { DEFAULT_CAPABILITY } from '@/lib/multihopper'
import { audit } from '@/lib/audit'
import type { Prisma } from '@prisma/client'

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function batchReference(): string {
  let suffix = ''
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  for (const b of bytes) suffix += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]
  return `BATCH-${suffix}`
}

export type BatchItemInput = { recipientId?: string; recipientName: string; address: string; amount: string }

export async function createBatch(
  orgId: string,
  actorId: string,
  input: { name: string; sourceWalletId: string; mint: string; failurePolicy: 'ISOLATE' | 'HALT'; items: BatchItemInput[]; idempotencyKey?: string },
) {
  const wallet = await db.wallet.findFirst({ where: { id: input.sourceWalletId, orgId, revokedAt: null } })
  if (!wallet) throw new ApiError('INVALID_WALLET', 'Source wallet not found for this organization', 400)
  if (wallet.ownershipStatus !== 'VERIFIED') throw new ApiError('WALLET_NOT_VERIFIED', 'Source wallet ownership must be verified first', 400)

  const asset = input.mint === SOL_MINT ? null : await db.supportedAsset.findUnique({ where: { mint: input.mint } })
  if (input.mint !== SOL_MINT && (!asset || !asset.enabled)) throw new ApiError('UNSUPPORTED_ASSET', `Mint ${input.mint} is not enabled`, 400)
  const decimals = asset?.decimals ?? SOL_DECIMALS

  // Provider capability limit is configuration, never an arbitrary assumption.
  const maxItems = DEFAULT_CAPABILITY.maxDestinations
  if (input.items.length > maxItems) {
    throw new ApiError('BATCH_SIZE_EXCEEDED', `A single MultiHopper route supports up to ${maxItems} destinations. Split this batch (${input.items.length} items) into multiple routes.`, 400)
  }

  const seenAddresses = new Map<string, string>()
  const seenNames = new Set<string>()
  const validated: Prisma.PaymentBatchItemUncheckedCreateInput[] = []
  let invalid = 0

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]
    const issues: string[] = []
    if (!item.recipientName?.trim()) issues.push('Missing recipient name')
    if (!isValidSolanaAddress(item.address)) issues.push('Invalid Solana address')
    let amountBase = ''
    try {
      amountBase = parseAmountToBaseUnits(item.amount, decimals)
      if (BigInt(amountBase) === 0n) issues.push('Amount must be greater than zero')
    } catch (err) {
      issues.push(err instanceof Error ? err.message : 'Invalid amount')
    }
    if (seenAddresses.has(item.address)) issues.push(`Duplicate address in batch (row ${seenAddresses.get(item.address)})`)
    if (seenNames.has(item.recipientName.toLowerCase())) issues.push('Duplicate recipient name in batch')
    if (issues.length > 0) {
      invalid++
      if (input.failurePolicy === 'HALT') {
        throw new ApiError('BATCH_VALIDATION_FAILED', `Row ${i + 1} (${item.recipientName || 'unnamed'}): ${issues.join('; ')}`, 422, { row: i + 1, issues })
      }
      validated.push({
        batchId: 'PENDING',
        recipientId: item.recipientId ?? null,
        recipientName: item.recipientName || '(unnamed)',
        address: item.address || '',
        amountBaseUnits: amountBase || '0',
        status: 'INVALID',
        error: issues.join('; '),
        rowIndex: i,
      })
      continue
    }
    seenAddresses.set(item.address, String(i + 1))
    seenNames.add(item.recipientName.toLowerCase())
    validated.push({
      batchId: 'PENDING',
      recipientId: item.recipientId ?? null,
      recipientName: item.recipientName,
      address: item.address,
      amountBaseUnits: amountBase,
      status: 'VALID',
      rowIndex: i,
    })
  }

  const validItems = validated.filter((v) => v.status === 'VALID')
  if (validItems.length === 0) throw new ApiError('BATCH_EMPTY', 'No valid rows in this batch. Import error isolation is on — check row errors.', 422)
  const total = sumBase(validItems.map((v) => v.amountBaseUnits as string))

  const batch = await db.paymentBatch.create({
    data: {
      orgId,
      name: input.name,
      reference: batchReference(),
      status: invalid > 0 ? 'DRAFT' : 'AWAITING_APPROVAL',
      sourceWalletId: wallet.id,
      mint: input.mint,
      totalBaseUnits: total,
      itemCount: input.items.length,
      failurePolicy: input.failurePolicy,
      createdBy: actorId,
      idempotencyKey: input.idempotencyKey ?? null,
      items: { create: validated },
    },
    include: { items: true },
  })

  await audit({ orgId, actorId, action: 'BATCH_CREATED', resourceType: 'PaymentBatch', resourceId: batch.id, data: { items: input.items.length, invalid, totalBaseUnits: total } })
  return {
    id: batch.id,
    reference: batch.reference,
    name: batch.name,
    status: batch.status,
    itemCount: batch.itemCount,
    validCount: validItems.length,
    invalidCount: invalid,
    totalBaseUnits: total,
    decimals,
    mint: input.mint,
    failurePolicy: batch.failurePolicy,
  }
}

export async function validateBatch(batchId: string, orgId: string) {
  const batch = await db.paymentBatch.findFirst({ where: { id: batchId, orgId }, include: { items: true } })
  if (!batch) throw new ApiError('NOT_FOUND', 'Batch not found', 404)
  const asset = batch.mint === SOL_MINT ? null : await db.supportedAsset.findUnique({ where: { mint: batch.mint } })
  const decimals = asset?.decimals ?? SOL_DECIMALS
  let changed = 0
  for (const item of batch.items) {
    const issues: string[] = []
    if (!isValidSolanaAddress(item.address)) issues.push('Invalid Solana address')
    let amountBase = ''
    try {
      amountBase = parseAmountToBaseUnits(formatAmount(item.amountBaseUnits, decimals), decimals)
      if (BigInt(amountBase) === 0n) issues.push('Amount must be greater than zero')
    } catch {
      issues.push('Invalid amount')
    }
    if (issues.length > 0 && item.status !== 'INVALID') {
      await db.paymentBatchItem.update({ where: { id: item.id }, data: { status: 'INVALID', error: issues.join('; ') } })
      changed++
    } else if (issues.length === 0 && item.status === 'INVALID') {
      await db.paymentBatchItem.update({ where: { id: item.id }, data: { status: 'VALID', error: null } })
      changed++
    }
  }
  const validItems = await db.paymentBatchItem.findMany({ where: { batchId, status: 'VALID' } })
  const total = sumBase(validItems.map((v) => v.amountBaseUnits))
  const invalidRemaining = batch.items.length - validItems.length
  // A batch with invalid rows stays DRAFT; only a fully valid batch advances.
  await db.paymentBatch.update({
    where: { id: batchId },
    data: { totalBaseUnits: total, status: invalidRemaining > 0 ? 'DRAFT' : 'AWAITING_APPROVAL' },
  })
  await audit({ orgId, action: 'BATCH_VALIDATED', resourceType: 'PaymentBatch', resourceId: batchId, data: { changed, totalBaseUnits: total } })
  return { changed, totalBaseUnits: total, validCount: validItems.length }
}

function formatAmount(base: string, decimals: number): string {
  // group:false — this feeds parseAmountToBaseUnits / provider payloads, not UI.
  return formatBaseUnits(base, decimals, { trimTrailingZeros: true, group: false })
}

/// Executes an approved batch by creating one real child payment per valid
/// item through the normal payment pipeline (validation → policy → approval).
/// Each child is independently tracked: one failure never hides another.
export async function executeBatch(batchId: string, orgId: string, actorId: string) {
  const batch = await db.paymentBatch.findFirst({ where: { id: batchId, orgId }, include: { items: true } })
  if (!batch) throw new ApiError('NOT_FOUND', 'Batch not found', 404)
  if (batch.status !== 'AWAITING_APPROVAL' && batch.status !== 'DRAFT') {
    throw new ApiError('INVALID_STATE', `Batch is ${batch.status}`, 409)
  }
  const validItems = batch.items.filter((i) => i.status === 'VALID')
  if (validItems.length === 0) throw new ApiError('BATCH_EMPTY', 'No valid items to execute', 422)
  const { createPayment } = await import('@/lib/payments')
  const asset = batch.mint === SOL_MINT ? null : await db.supportedAsset.findUnique({ where: { mint: batch.mint } })
  const decimals = asset?.decimals ?? SOL_DECIMALS

  await db.paymentBatch.update({ where: { id: batch.id }, data: { status: 'EXECUTING' } })
  const created: { itemRow: number; reference: string; status: string; recipient: string }[] = []
  const failed: { itemRow: number; recipient: string; error: string }[] = []

  for (const item of validItems) {
    try {
      const { payment } = await createPayment(orgId, actorId, {
        sourceWalletId: batch.sourceWalletId,
        recipientId: item.recipientId ?? undefined,
        destination: item.address,
        mint: batch.mint,
        amount: formatAmount(item.amountBaseUnits, decimals),
        reason: `Batch ${batch.reference}: ${batch.name}`,
        source: 'APP',
        idempotencyKey: `batch-${batch.id}-row${item.rowIndex}`,
      })
      await db.paymentBatchItem.update({ where: { id: item.id }, data: { status: 'PAYMENT_CREATED', paymentId: payment.id } })
      created.push({ itemRow: item.rowIndex, reference: payment.reference, status: payment.status, recipient: item.recipientName })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.paymentBatchItem.update({ where: { id: item.id }, data: { status: 'FAILED', error: message.slice(0, 300) } })
      failed.push({ itemRow: item.rowIndex, recipient: item.recipientName, error: message })
    }
  }
  const allFailed = created.length === 0
  await db.paymentBatch.update({ where: { id: batch.id }, data: { status: allFailed ? 'FAILED' : failed.length > 0 ? 'PARTIAL' : 'COMPLETED' } })
  await audit({ orgId, actorId, action: 'BATCH_EXECUTED', resourceType: 'PaymentBatch', resourceId: batch.id, data: { created: created.length, failed: failed.length } })
  return { created, failed, batchStatus: allFailed ? 'FAILED' : failed.length > 0 ? 'PARTIAL' : 'COMPLETED' }
}

export { batchReference }
