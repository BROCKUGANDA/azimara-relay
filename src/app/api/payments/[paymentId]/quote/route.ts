import { ok, route } from '@/lib/api'
import { requestQuote } from '@/lib/payments'
import { audit } from '@/lib/audit'

export const POST = route(async ({ org, request }) => {
  const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
  const result = await requestQuote(paymentId, org.org.id)
  await audit({ orgId: org.org.id, action: 'PAYMENT_QUOTE_REQUESTED', resourceType: 'PaymentRequest', resourceId: paymentId, data: result })
  if (!result.ok && result.setupRequired) {
    return Response.json({ error: { code: 'PROVIDER_SETUP_REQUIRED', message: result.detail, requestId: '', details: [] } }, { status: 409 })
  }
  if (!result.ok) {
    return Response.json({ error: { code: 'QUOTE_FAILED', message: result.detail, requestId: '', details: [] } }, { status: 502 })
  }
  return ok({ quoteId: result.quoteId })
}, { permission: 'payment:create' })
