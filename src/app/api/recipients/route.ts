import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { isValidSolanaAddress } from '@/lib/solana'
import { parsePage, parsePageSize } from '@/lib/safe-json'

export const GET = route(async ({ org, request }) => {
  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? ''
  const status = url.searchParams.get('status') ?? 'ACTIVE'
  const category = url.searchParams.get('category')
  const groupId = url.searchParams.get('groupId')
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 50, 100)
  const { page, skip, take } = parsePage(url.searchParams.get('page'), pageSize)
  const where = {
    orgId: org.org.id,
    ...(status !== 'ALL' ? { status } : {}),
    ...(category ? { category } : {}),
    ...(groupId ? { groupId } : {}),
    // SQLite `contains` is case-sensitive: match lowercase and uppercase
    // variants so searches behave case-insensitively.
    ...(q
      ? {
          OR: [
            { name: { contains: q } }, { name: { contains: q.toLowerCase() } }, { name: { contains: q.toUpperCase() } },
            { address: { contains: q } }, { address: { contains: q.toLowerCase() } }, { address: { contains: q.toUpperCase() } },
            { reference: { contains: q } }, { reference: { contains: q.toLowerCase() } }, { reference: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  }
  const [total, recipients] = await Promise.all([
    db.recipient.count({ where }),
    db.recipient.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { group: true } }),
  ])
  return ok({
    recipients: recipients.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      reference: r.reference,
      category: r.category,
      assetPreference: r.assetPreference,
      notes: r.notes,
      status: r.status,
      verificationStatus: r.verificationStatus,
      groupId: r.groupId,
      groupName: r.group?.name ?? null,
      lastPaymentAt: r.lastPaymentAt,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  })
})

const createSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(32).max(44),
  reference: z.string().max(80).optional(),
  category: z.enum(['CONTRACTOR', 'VENDOR', 'CONTRIBUTOR', 'AFFILIATE', 'ROYALTIES', 'OTHER']).optional(),
  assetPreference: z.string().optional(),
  notes: z.string().max(2000).optional(),
  groupId: z.string().optional(),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, createSchema)
  if (!isValidSolanaAddress(body.address)) throw new ApiError('INVALID_ADDRESS', 'The recipient address is not a valid Solana public key', 400)
  const dupe = await db.recipient.findFirst({ where: { orgId: org.org.id, address: body.address, status: { not: 'ARCHIVED' } } })
  if (dupe) throw new ApiError('DUPLICATE_RECIPIENT', `A recipient with this address already exists: ${dupe.name}`, 409)
  const recipient = await db.recipient.create({
    data: {
      orgId: org.org.id,
      name: body.name,
      address: body.address,
      reference: body.reference ?? null,
      category: body.category ?? null,
      assetPreference: body.assetPreference ?? null,
      notes: body.notes ?? null,
      groupId: body.groupId ?? null,
    },
  })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECIPIENT_CREATED', resourceType: 'Recipient', resourceId: recipient.id, data: { name: body.name } })
  return ok({ id: recipient.id, name: recipient.name, address: recipient.address, status: recipient.status })
}, { permission: 'recipient:manage' })
