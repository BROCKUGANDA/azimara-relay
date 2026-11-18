import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { aiAvailable } from '@/lib/ai'
import { rpcHealthy } from '@/lib/solana'
import { safeJsonParse } from '@/lib/safe-json'
import { env } from '@/lib/env'

export const GET = route(async ({ org }) => {
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId: org.org.id, provider: 'MULTIHOPPER' } } })
  const settings = safeJsonParse<{ network?: string } | null>(org.org.settingsJson, null)
  // Orgs default to the deployment network (mainnet-beta) unless explicitly
  // pinned to devnet in workspace settings.
  const network = settings?.network ?? env().SOLANA_NETWORK
  const rpc = await rpcHealthy(network)
  return ok({
    multihopper: {
      configured: !!integration?.apiKeyCipher,
      environment: integration?.environment ?? 'DEVNET',
      status: integration?.status ?? 'NOT_CONFIGURED',
      statusDetail: integration?.statusDetail ?? null,
      lastCheckAt: integration?.lastCheckAt ?? null,
      capability: integration ? safeJsonParse<unknown>(integration.capabilityJson, null) : { maxDestinations: 20 },
      webhookConfigured: !!integration?.webhookSecretCipher,
      verificationNote: 'Endpoint schemas implemented per the PRD workflow; validate against the live OpenAPI specification before mainnet volume.',
    },
    solana: {
      network,
      rpcProvider: env().rpcIsPaid ? 'paid' : 'public-rate-limited',
      rpc: rpc.ok ? { available: true, slot: rpc.slot } : { available: false, error: rpc.error },
    },
    intelligence: { available: aiAvailable(), provider: 'ZAI' },
    nonCustodialAttestation: {
      seedPhrasesStored: false,
      privateKeysStored: false,
      omnibusFundsHeld: false,
      aiCanExecutePayments: false,
    },
  })
})
