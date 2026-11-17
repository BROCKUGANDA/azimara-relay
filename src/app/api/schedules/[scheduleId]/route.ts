import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

function idFrom(request: Request): string {
  // Direct-child route: /api/<resource>/<id> → last segment.
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-1)[0]
}

const patchSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']) })

export const PATCH = route(async ({ org, auth, request }) => {
  const schedule = await db.paymentSchedule.findFirst({ where: { id: idFrom(request), orgId: org.org.id } })
  if (!schedule) throw new ApiError('NOT_FOUND', 'Schedule not found', 404)
  const body = await readJson(request, patchSchema)
  await db.paymentSchedule.update({ where: { id: schedule.id }, data: { status: body.status } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'SCHEDULE_STATUS_CHANGED', resourceType: 'PaymentSchedule', resourceId: schedule.id, data: { status: body.status } })
  return ok({ status: body.status })
}, { permission: 'schedule:manage' })

export const DELETE = route(async ({ org, auth, request }) => {
  const schedule = await db.paymentSchedule.findFirst({ where: { id: idFrom(request), orgId: org.org.id } })
  if (!schedule) throw new ApiError('NOT_FOUND', 'Schedule not found', 404)
  await db.paymentSchedule.update({ where: { id: schedule.id }, data: { status: 'CANCELLED' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'SCHEDULE_CANCELLED', resourceType: 'PaymentSchedule', resourceId: schedule.id })
  return ok({ cancelled: true, note: 'Schedule retained for history; past payment records are never destroyed.' })
}, { permission: 'schedule:manage' })
