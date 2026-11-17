import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { aiAvailable } from '@/lib/ai'
import { rpcHealthy } from '@/lib/solana'

export const GET = route(async ({ org }) => {
  const integration = await db.providerIntegration.findUnique({ where: { orgId_provider: { orgId: org.org.id, provider: 'MULTIHOPPER' } } })
  const settings = JSON.parse(org.org.settingsJson) as { network?: string }
  const network = settings.network ?? 'devnet'
  const rpc = await rpcHealthy(network)
  return ok({
    multihopper: {
      configured: !!integration?.apiKeyCipher,
      environment: integration?.environment ?? 'DEVNET',
      status: integration?.status ?? 'NOT_CONFIGURED',
      statusDetail: integration?.statusDetail ?? null,
      lastCheckAt: integration?.lastCheckAt ?? null,
      capability: integration ? JSON.parse(integration.capabilityJson) : { maxDestinations: 20 },
      webhookConfigured: !!integration?.webhookSecretCipher,
      baseUrl: integration?.environment === 'PRODUCTION' ? 'https://multihopper.com' : 'https://devnet.multihopper.com',
      verificationNote: 'Endpoint schemas implemented per the PRD workflow; validate against the live OpenAPI specification before mainnet volume.',
    },
    solana: {
      network,
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
