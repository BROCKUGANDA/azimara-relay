import { ok, route, ApiError } from '@/lib/api'
import { prepareExecution } from '@/lib/payments'
import { SetupRequiredError, MultiHopperError } from '@/lib/multihopper'

export const POST = route(async ({ org, request }) => {
    const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
    try {
      const bundles = await prepareExecution(paymentId, org.org.id)
      return ok({ bundles, note: 'Sign and broadcast the keeper funding transaction first; submit its signature to /broadcast.' })
    } catch (err) {
      if (err instanceof SetupRequiredError) throw new ApiError('PROVIDER_SETUP_REQUIRED', err.detail, 409)
      if (err instanceof MultiHopperError) throw new ApiError(err.code, err.message, 502, err.providerPayload)
      throw err
    }
  }, { permission: 'payment:execute' })