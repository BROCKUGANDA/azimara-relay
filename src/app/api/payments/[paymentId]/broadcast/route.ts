import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { confirmKeeperFunding } from '@/lib/payments'
import { SetupRequiredError, MultiHopperError } from '@/lib/multihopper'

const schema = z.object({ keeperSignature: z.string().min(32) })

/// Records the wallet-signed keeper funding signature and immediately submits
/// the intermediate confirm-broadcast call with an EMPTY routeInitSignatures
/// list — exactly the documented provider sequence.
export const POST = route(async ({ org, auth, request }) => {
    const paymentId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
    const body = await readJson(request, schema)
    try {
      const raw = await confirmKeeperFunding(paymentId, org.org.id, auth.user.id, body.keeperSignature)
      return ok({ intermediateConfirmed: true, providerResponse: raw, next: 'Broadcast route/orchestrator/session/dispersion transactions, wait for onchain confirmation, then POST /confirm with the route-init signatures.' })
    } catch (err) {
      if (err instanceof SetupRequiredError) throw new ApiError('PROVIDER_SETUP_REQUIRED', err.detail, 409)
      if (err instanceof MultiHopperError) throw new ApiError(err.code, err.message, 502, err.providerPayload)
      throw err
    }
  }, { permission: 'payment:execute' })