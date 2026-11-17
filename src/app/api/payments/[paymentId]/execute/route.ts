import { ok, route, ApiError } from '@/lib/api'
import { startExecution } from '@/lib/payments'
import { SetupRequiredError } from '@/lib/multihopper'
import { audit } from '@/lib/audit'

/// Creates the idempotent provider transfer (externalId = relay-<paymentId>)
/// and moves the payment to AWAITING_SIGNATURE. Re-running is safe.
export const POST = route(async ({ org, auth, request }) => {
    const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
    try {
      const { transfer } = await startExecution(paymentId, org.org.id, auth.user.id)
      await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'PAYMENT_EXECUTION_STARTED', resourceType: 'PaymentRequest', resourceId: paymentId })
      return ok({
        providerTransferId: transfer.providerTransferId,
        externalId: transfer.externalId,
        state: 'AWAITING_SIGNATURE',
        note: 'Provider transfer created. Prepare the transaction bundle, then authorize the keeper funding transaction in your wallet.',
      })
    } catch (err) {
      if (err instanceof SetupRequiredError) throw new ApiError('PROVIDER_SETUP_REQUIRED', err.detail, 409)
      throw err
    }
  }, { permission: 'payment:execute' })