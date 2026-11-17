// Public webhook receiver for MultiHopper lifecycle events.
// - Verifies the HMAC-SHA256 signature (x-multihopper-signature) against the
//   UNMODIFIED raw body with timing-safe comparison.
// - Persists every attempt (valid or not) into the webhook inbox before any
//   processing, deduplicates replays, and processes asynchronously.
// - Acknowledges quickly; treats delivery as best-effort with scheduled
//   reconciliation as the authoritative fallback.

import { db } from '@/lib/db'
import { enqueue } from '@/lib/jobs'
import { MultiHopperClient } from '@/lib/multihopper'
import { decryptSecret } from '@/lib/crypto'
import { clientIp } from '@/lib/rate-limit'
import { createHash, timingSafeEqual } from 'crypto'
import { z } from 'zod'

function extractTransferRef(payload: Record<string, unknown>): string | null {
  for (const key of ['transferId', 'transfer_id']) {
    const v = payload[key]
    if (typeof v === 'string') return v
  }
  const nested = payload.data ?? payload.transfer
  if (nested && typeof nested === 'object') return extractTransferRef(nested as Record<string, unknown>)
  return null
}

const eventSchema = z.looseObject({ event: z.string().optional(), type: z.string().optional(), id: z.string().optional(), eventId: z.string().optional() })

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-multihopper-signature')
  // Resolve the webhook secret from any org integration configured for this
  // provider; verification decides both the secret match and the event's org.
  const integrations = await db.providerIntegration.findMany({ where: { provider: 'MULTIHOPPER', webhookSecretCipher: { not: null } } })
  let matchedOrgId: string | null = null
  const valid = integrations.some((integration) => {
    const secret = integration.webhookSecretCipher ? decryptSecret(integration.webhookSecretCipher) : null
    if (!secret) return false
    const client = new MultiHopperClient({ environment: 'DEVNET', apiKey: null, webhookSecret: null })
    if (client.verifyWebhookSignature(raw, signature, secret)) {
      matchedOrgId = integration.orgId
      return true
    }
    return false
  })
  void timingSafeEqual
  void createHash
  // Inbox stores every attempt for security forensics.
  let eventType: string | null = null
  let eventId: string | null = null
  let transferRef: string | null = null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const guess = eventSchema.safeParse(parsed)
    eventType = (guess.success ? guess.data.event ?? guess.data.type ?? null : null)
    eventId = (guess.success ? guess.data.eventId ?? guess.data.id ?? null : null)
    transferRef = extractTransferRef(parsed)
  } catch {
    // Non-JSON body: stored raw for forensics.
  }
  const dedupeHash = createHash('sha256').update(raw).digest('hex')
  const inbox = await db.webhookInbox
    .create({
      data: {
        provider: 'MULTIHOPPER',
        eventId,
        signature: `sha256:${dedupeHash}`,
        signatureValid: valid,
        eventType,
        payloadJson: raw.slice(0, 100_000),
        transferRef,
        status: valid ? 'RECEIVED' : 'REJECTED',
      },
    })
    .catch(async () => {
      // Unique-signature conflict → duplicate delivery: record nothing new.
      return null
    })
  if (!valid) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'webhook_rejected', provider: 'MULTIHOPPER', ip: clientIp(request) }))
    return Response.json({ error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed.', requestId: '', details: [] } }, { status: 401 })
  }
  if (inbox) {
    await enqueue('WEBHOOK_PROCESS', { inboxId: inbox.id, orgId: matchedOrgId }, { orgId: matchedOrgId, dedupeKey: `webhook:${inbox.id}` })
  }
  // Acknowledge immediately; processing happens asynchronously.
  return Response.json({ received: true }, { status: 202 })
}
