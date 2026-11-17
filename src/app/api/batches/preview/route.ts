import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { isValidSolanaAddress } from '@/lib/solana'
import { parseAmountToBaseUnits } from '@/lib/money'
import { csvToObjects } from '@/lib/csv'

const schema = z.object({ csv: z.string().min(1).max(2_000_000), mint: z.string().min(1) })

/// Dry-run CSV validation for the batch builder: no persistence, per-row
/// errors, duplicate detection and an exact-integer total preview.
export const POST = route(async ({ org, request }) => {
  const body = await readJson(request, schema)
  const asset = body.mint === 'native:SOL' ? null : await db.supportedAsset.findUnique({ where: { mint: body.mint } })
  if (body.mint !== 'native:SOL' && (!asset || !asset.enabled)) throw new ApiError('UNSUPPORTED_ASSET', `Mint ${body.mint} is not enabled`, 400)
  const decimals = asset?.decimals ?? 9
  const { headers, rows } = csvToObjects(body.csv)
  if (rows.length === 0) throw new ApiError('EMPTY_CSV', 'No data rows found', 400)
  const recipients = await db.recipient.findMany({ where: { orgId: org.org.id, status: 'ACTIVE' } })
  const byAddress = new Map(recipients.map((r) => [r.address, r]))

  const seen = new Map<string, number>()
  const rowsOut = rows.map((row, idx) => {
    const name = row['name'] ?? row['Name'] ?? row['recipient_name'] ?? ''
    const address = row['address'] ?? row['Address'] ?? row['wallet'] ?? row['wallet_address'] ?? ''
    const amount = row['amount'] ?? row['Amount'] ?? row['value'] ?? ''
    const issues: string[] = []
    if (!name) issues.push('Missing name')
    if (!address) issues.push('Missing address')
    else if (!isValidSolanaAddress(address)) issues.push('Invalid Solana address')
    if (seen.has(address)) issues.push(`Duplicate address (first seen row ${seen.get(address)})`)
    else if (address) seen.set(address, idx + 2)
    let amountBase = ''
    try {
      amountBase = parseAmountToBaseUnits(amount, decimals)
      if (BigInt(amountBase) === 0n) issues.push('Amount must be greater than zero')
    } catch (err) {
      issues.push(err instanceof Error ? err.message : 'Invalid amount')
    }
    const matched = byAddress.get(address)
    return {
      row: idx + 2,
      name,
      address,
      amount,
      amountBase,
      decimals,
      valid: issues.length === 0,
      issues,
      matchedRecipient: matched ? { id: matched.id, name: matched.name, registered: true } : name ? { id: null, name, registered: false } : null,
    }
  })
  const valid = rowsOut.filter((r) => r.valid)
  let total = '0'
  try {
    total = valid.reduce<bigint>((acc, r) => acc + BigInt(r.amountBase || '0'), 0n).toString()
  } catch {
    total = '0'
  }
  return ok({
    headers,
    rows: rowsOut,
    summary: {
      totalRows: rows.length,
      validRows: valid.length,
      invalidRows: rows.length - valid.length,
      duplicates: rowsOut.filter((r) => r.issues.some((i) => i.startsWith('Duplicate'))).length,
      totalBaseUnits: total,
      decimals,
    },
  })
}, { permission: 'payment:create' })
