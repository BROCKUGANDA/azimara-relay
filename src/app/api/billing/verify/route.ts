import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { verifySignatureClaim } from '@/lib/billing'

const schema = z.object({ signature: z.string().min(64).max(88) })

/// Claim path: the customer pastes the Solana transaction signature of their
/// USDC payment; the platform fetches the REAL transaction from the chain,
/// verifies the transfer to the treasury and settles the matching invoice.
/// Never simulates — every failure is a typed, honest error.
export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, schema)
  const result = await verifySignatureClaim(org.org.id, body.signature)
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'PAYMENT_SIGNATURE_VERIFIED', resourceType: 'SubscriptionInvoice', resourceId: result.invoice.id, data: { signature: body.signature, idempotent: result.idempotent } })
  return ok(result)
}, { permission: 'billing:manage', rate: { max: 8, windowMs: 60_000 } })
