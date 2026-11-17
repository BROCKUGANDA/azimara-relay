// Developer API v1 — recipients (scope-enforced).
import { z } from 'zod'
import { apiRoute, ok, readJson, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { isValidSolanaAddress } from '@/lib/solana'
import { audit } from '@/lib/audit'

export const GET = apiRoute('recipients:read', async (request, ctx) => {
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit') ?? '50')))
  const recipients = await db.recipient.findMany({
    where: { orgId: ctx.orgId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, name: true, address: true, category: true, createdAt: true },
  })
  return ok({ recipients, count: recipients.length })
})

const createSchema = z.object({ name: z.string().min(1).max(120), address: z.string().min(32).max(44), category: z.enum(['CONTRACTOR', 'VENDOR', 'CONTRIBUTOR', 'AFFILIATE', 'ROYALTIES', 'OTHER']).optional() })

export const POST = apiRoute('recipients:create', async (request, ctx) => {
  const body = await readJson(request, createSchema)
  if (!isValidSolanaAddress(body.address)) throw new ApiError('INVALID_ADDRESS', 'Invalid Solana address', 400)
  const dupe = await db.recipient.findFirst({ where: { orgId: ctx.orgId, address: body.address, status: { not: 'ARCHIVED' } } })
  if (dupe) throw new ApiError('DUPLICATE_RECIPIENT', `Address already registered as ${dupe.name}`, 409)
  const recipient = await db.recipient.create({ data: { orgId: ctx.orgId, name: body.name, address: body.address, category: body.category ?? 'OTHER' } })
  await audit({ orgId: ctx.orgId, actorType: 'API', action: 'API_RECIPIENT_CREATED', resourceType: 'Recipient', resourceId: recipient.id })
  return ok({ recipient: { id: recipient.id, name: recipient.name, address: recipient.address } })
})
