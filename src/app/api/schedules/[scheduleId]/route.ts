import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseAmountToBaseUnits } from '@/lib/money'

function idFrom(request: Request): string {
  // Direct-child route: /api/<resource>/<id> → last segment.
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-1)[0]
}

/// Status transitions stay the simple path; content edits (name, recipient,
/// amount, recurrence, next run) are validated with the same rules as create.
/// Editing is blocked once a schedule is terminal (CANCELLED/COMPLETED).
const patchSchema = z
  .object({
    status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    recipientId: z.string().min(1).optional(),
    amount: z.string().min(1).max(40).optional(),
    recurrence: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY']).optional(),
    nextRunAt: z.string().datetime().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' })

export const PATCH = route(async ({ org, auth, request }) => {
  const schedule = await db.paymentSchedule.findFirst({ where: { id: idFrom(request), orgId: org.org.id } })
  if (!schedule) throw new ApiError('NOT_FOUND', 'Schedule not found', 404)
  const body = await readJson(request, patchSchema)

  const terminal = ['CANCELLED', 'COMPLETED'].includes(schedule.status)
  const editsContent = body.name !== undefined || body.recipientId !== undefined || body.amount !== undefined || body.recurrence !== undefined || body.nextRunAt !== undefined
  if (editsContent && terminal) {
    throw new ApiError('INVALID_STATE', `A ${schedule.status.toLowerCase()} schedule can no longer be edited`, 409)
  }

  const data: { status?: string; name?: string; recipientId?: string; amountBaseUnits?: string; recurrence?: string; nextRunAt?: Date } = {}
  if (body.status) data.status = body.status
  if (body.name) data.name = body.name
  if (body.recurrence) data.recurrence = body.recurrence
  if (body.recipientId) {
    const recipient = await db.recipient.findFirst({ where: { id: body.recipientId, orgId: org.org.id, status: 'ACTIVE' } })
    if (!recipient) throw new ApiError('RECIPIENT_NOT_FOUND', 'Active recipient required', 404)
    data.recipientId = recipient.id
  }
  if (body.amount !== undefined) {
    const asset = schedule.mint === 'native:SOL' ? null : await db.supportedAsset.findUnique({ where: { mint: schedule.mint } })
    let amountBase: string
    try {
      amountBase = parseAmountToBaseUnits(body.amount, asset?.decimals ?? 9)
    } catch (err) {
      throw new ApiError('INVALID_AMOUNT', err instanceof Error ? err.message : 'Invalid amount', 400)
    }
    if (BigInt(amountBase) === 0n) throw new ApiError('INVALID_AMOUNT', 'Amount must be greater than zero', 400)
    data.amountBaseUnits = amountBase
  }
  if (body.nextRunAt) {
    const next = new Date(body.nextRunAt)
    // "Run now" is implemented by the UI as nextRunAt=now — allow the
    // immediate past by one minute, reject anything older as a mistake.
    if (next.getTime() < Date.now() - 60_000) throw new ApiError('INVALID_DATE', 'Next run cannot be in the past', 400)
    data.nextRunAt = next
  }

  await db.paymentSchedule.update({ where: { id: schedule.id }, data })
  await audit({
    orgId: org.org.id,
    actorId: auth.user.id,
    action: body.status && Object.keys(body).length === 1 ? 'SCHEDULE_STATUS_CHANGED' : 'SCHEDULE_UPDATED',
    resourceType: 'PaymentSchedule',
    resourceId: schedule.id,
    data: body,
  })
  return ok({ updated: true })
}, { permission: 'schedule:manage' })

export const DELETE = route(async ({ org, auth, request }) => {
  const schedule = await db.paymentSchedule.findFirst({ where: { id: idFrom(request), orgId: org.org.id } })
  if (!schedule) throw new ApiError('NOT_FOUND', 'Schedule not found', 404)
  await db.paymentSchedule.update({ where: { id: schedule.id }, data: { status: 'CANCELLED' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'SCHEDULE_CANCELLED', resourceType: 'PaymentSchedule', resourceId: schedule.id })
  return ok({ cancelled: true, note: 'Schedule retained for history; past payment records are never destroyed.' })
}, { permission: 'schedule:manage' })
