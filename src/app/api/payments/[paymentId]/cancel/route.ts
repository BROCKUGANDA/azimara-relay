import { ok, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { assertTransition } from '@/lib/state-machine'
import { audit } from '@/lib/audit'

export const POST = route(async ({ org, auth, request }) => {
  const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
  const payment = await db.paymentRequest.findFirst({ where: { id: paymentId, orgId: org.org.id } })
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found', 404)
  // Cancel is only legal from pre-execution states.
  const cancellable = ['DRAFT', 'VALIDATING', 'PENDING_APPROVAL', 'APPROVED', 'QUOTING', 'QUOTED', 'AWAITING_SIGNATURE', 'QUOTE_EXPIRED']
  if (!cancellable.includes(payment.status)) {
    throw new ApiError('INVALID_STATE', `A payment in state ${payment.status} cannot be cancelled. It may already be executing onchain.`, 409)
  }
  assertTransition(payment.status, 'CANCELLED')
  await db.paymentRequest.update({ where: { id: payment.id }, data: { status: 'CANCELLED', statusReason: `Cancelled by ${auth.user.name ?? auth.user.email}`, version: payment.version + 1 } })
  await db.approvalEvent.create({ data: { paymentId: payment.id, type: 'CANCELLED', actorId: auth.user.id, dataJson: '{}' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'PAYMENT_CANCELLED', resourceType: 'PaymentRequest', resourceId: payment.id })
  return ok({ cancelled: true })
}, { permission: 'payment:create' })
