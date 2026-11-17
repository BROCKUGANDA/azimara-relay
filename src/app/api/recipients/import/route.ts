import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { isValidSolanaAddress } from '@/lib/solana'
import { csvToObjects } from '@/lib/csv'

const importSchema = z.object({ csv: z.string().min(1).max(2_000_000), mode: z.enum(['SKIP_DUPLICATES', 'FAIL_ON_DUPLICATE']).default('SKIP_DUPLICATES') })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, importSchema)
  const { headers, rows } = csvToObjects(body.csv)
  if (rows.length === 0) throw new ApiError('EMPTY_IMPORT', 'The CSV contains no data rows', 400)
  const currentCount = await db.recipient.count({ where: { orgId: org.org.id } })
  if (currentCount + rows.length > 5000) throw new ApiError('IMPORT_TOO_LARGE', 'Recipient import is limited to 5000 records per organization', 413)

  const results: { row: number; name: string; status: 'CREATED' | 'SKIPPED_DUPLICATE' | 'ERROR'; error?: string; recipientId?: string }[] = []
  let created = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = row['name'] ?? row['Name'] ?? row['recipient_name'] ?? ''
    const address = row['address'] ?? row['Address'] ?? row['wallet'] ?? row['wallet_address'] ?? ''
    const category = row['category'] ?? row['Category'] ?? undefined
    const reference = row['reference'] ?? row['Reference'] ?? undefined
    const notes = row['notes'] ?? row['Notes'] ?? undefined
    try {
      if (!name) throw new Error('Missing name')
      if (!address) throw new Error('Missing address')
      if (!isValidSolanaAddress(address)) throw new Error('Invalid Solana address')
      const dupe = await db.recipient.findFirst({ where: { orgId: org.org.id, address, status: { not: 'ARCHIVED' } } })
      if (dupe) {
        if (body.mode === 'FAIL_ON_DUPLICATE') throw new Error(`Duplicate address: already registered as ${dupe.name}`)
        results.push({ row: i + 2, name, status: 'SKIPPED_DUPLICATE', error: `Duplicate of ${dupe.name}` })
        skipped++
        continue
      }
      const validCategories = ['CONTRACTOR', 'VENDOR', 'CONTRIBUTOR', 'AFFILIATE', 'ROYALTIES', 'OTHER']
      const recipient = await db.recipient.create({
        data: {
          orgId: org.org.id,
          name: name.slice(0, 120),
          address,
          reference: reference ?? null,
          category: category && validCategories.includes(category.toUpperCase()) ? category.toUpperCase() : 'OTHER',
          notes: notes ?? null,
        },
      })
      results.push({ row: i + 2, name, status: 'CREATED', recipientId: recipient.id })
      created++
    } catch (err) {
      results.push({ row: i + 2, name: name || '(missing)', status: 'ERROR', error: err instanceof Error ? err.message : String(err) })
      failed++
    }
  }
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECIPIENTS_IMPORTED', resourceType: 'Recipient', data: { created, skipped, failed, total: rows.length } })
  return ok({ created, skipped, failed, totalRows: rows.length, headers, results })
}, { permission: 'recipient:manage' })
