import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { approvePayment } from '@/lib/payments'
import { audit, notify } from '@/lib/audit'

const schema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(1000).optional() })

export const POST = route(async ({ org, auth, request }) => {
  const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
  const body = await readJson(request, schema)
  const payment = await approvePayment(paymentId, org.org.id, auth.user.id, org.role, body.decision, body.reason)
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: `PAYMENT_${body.decision}`, resourceType: 'PaymentRequest', resourceId: paymentId, data: { reason: body.reason } })
  if (payment.status === 'APPROVED') {
    await notify(org.org.id, { type: 'PAYMENT_APPROVED', title: `Payment ${payment.reference} approved and ready for quoting`, link: `#/app/payments/${paymentId}` })
  }
  return ok({ id: payment.id, status: payment.status })
}, { permission: 'approval:decide' })
