import { ok, route } from '@/lib/api'
import { syncTransfer } from '@/lib/payments'
import { audit } from '@/lib/audit'

export const POST = route(async ({ org, request }) => {
  const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
  const result = await syncTransfer(paymentId, org.org.id)
  await audit({ orgId: org.org.id, action: 'PAYMENT_SYNC', resourceType: 'PaymentRequest', resourceId: paymentId, data: result ?? {} })
  return ok(result ?? { providerStatus: null, mapped: null })
}, { permission: 'payment:read' })
