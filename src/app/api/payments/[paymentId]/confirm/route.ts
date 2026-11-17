import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { confirmBroadcastFinal } from '@/lib/payments'
import { SetupRequiredError, MultiHopperError } from '@/lib/multihopper'

const schema = z.object({ routeInitSignatures: z.array(z.string().min(32)).max(30) })

/// Final confirmation: remaining signatures submitted only after actual
/// onchain confirmation of the prepared transactions.
export const POST = route(async ({ org, request }) => {
    const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
    const body = await readJson(request, schema)
    try {
      const raw = await confirmBroadcastFinal(paymentId, org.org.id, body.routeInitSignatures)
      return ok({ finalConfirmed: true, providerResponse: raw })
    } catch (err) {
      if (err instanceof SetupRequiredError) throw new ApiError('PROVIDER_SETUP_REQUIRED', err.detail, 409)
      if (err instanceof MultiHopperError) throw new ApiError(err.code, err.message, 502, err.providerPayload)
      throw err
    }
  }, { permission: 'payment:execute' })