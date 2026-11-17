import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseAmountToBaseUnits } from '@/lib/money'

export const GET = route(async ({ org }) => {
  const schedules = await db.paymentSchedule.findMany({ where: { orgId: org.org.id }, orderBy: { nextRunAt: 'asc' }, include: { recipient: { select: { name: true } }, wallet: { select: { label: true } } } })
  const assets = await db.supportedAsset.findMany()
  const assetMap = new Map(assets.map((a) => [a.mint, a]))
  return ok({
    schedules: schedules.map((s) => ({
      id: s.id,
      name: s.name,
      recurrence: s.recurrence,
      cronExpr: s.cronExpr,
      status: s.status,
      mint: s.mint,
      mintSymbol: assetMap.get(s.mint)?.symbol ?? s.mint,
      decimals: assetMap.get(s.mint)?.decimals ?? 6,
      amountBaseUnits: s.amountBaseUnits,
      recipientName: s.recipient.name,
      walletLabel: s.wallet.label,
      nextRunAt: s.nextRunAt,
      lastRunAt: s.lastRunAt,
      autoApprove: s.autoApprove,
      createdAt: s.createdAt,
    })),
  })
})

const createSchema = z.object({
  name: z.string().min(1).max(80),
  walletId: z.string().min(1),
  recipientId: z.string().min(1),
  mint: z.string().min(1),
  amount: z.string().min(1),
  recurrence: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY']),
  firstRunAt: z.string().datetime(),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, createSchema)
  const wallet = await db.wallet.findFirst({ where: { id: body.walletId, orgId: org.org.id, revokedAt: null, ownershipStatus: 'VERIFIED' } })
  if (!wallet) throw new ApiError('INVALID_WALLET', 'Verified source wallet required', 400)
  const recipient = await db.recipient.findFirst({ where: { id: body.recipientId, orgId: org.org.id, status: 'ACTIVE' } })
  if (!recipient) throw new ApiError('RECIPIENT_NOT_FOUND', 'Active recipient required', 404)
  const asset = body.mint === 'native:SOL' ? null : await db.supportedAsset.findUnique({ where: { mint: body.mint } })
  if (body.mint !== 'native:SOL' && (!asset || !asset.enabled)) throw new ApiError('UNSUPPORTED_ASSET', 'Unsupported mint', 400)
  let amountBase: string
  try {
    amountBase = parseAmountToBaseUnits(body.amount, asset?.decimals ?? 9)
  } catch (err) {
    throw new ApiError('INVALID_AMOUNT', err instanceof Error ? err.message : 'Invalid amount', 400)
  }
  const schedule = await db.paymentSchedule.create({
    data: {
      orgId: org.org.id,
      name: body.name,
      walletId: wallet.id,
      recipientId: recipient.id,
      mint: body.mint,
      amountBaseUnits: amountBase,
      recurrence: body.recurrence,
      nextRunAt: new Date(body.firstRunAt),
      status: 'ACTIVE',
      createdBy: auth.user.id,
    },
  })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'SCHEDULE_CREATED', resourceType: 'PaymentSchedule', resourceId: schedule.id, data: { recurrence: body.recurrence } })
  return ok({ id: schedule.id, name: schedule.name, nextRunAt: schedule.nextRunAt, note: 'Each run creates a real payment through validation and the approval policy engine — schedules never bypass approvals.' })
}, { permission: 'schedule:manage' })
