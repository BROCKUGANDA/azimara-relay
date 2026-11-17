// Bootstrap: seed the supported-asset registry and start the background
// worker exactly once per server instance.

import { db } from '@/lib/db'

const g = globalThis as unknown as { __relayBootstrapped?: boolean }

const DEFAULT_ASSETS = [
  { mint: 'native:SOL', symbol: 'SOL', displayName: 'Solana', decimals: 9, verified: true, providerEligible: false },
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', displayName: 'USD Coin', decimals: 6, verified: true, providerEligible: true },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', displayName: 'Tether USD', decimals: 6, verified: true, providerEligible: true },
]

export async function bootstrap() {
  if (g.__relayBootstrapped) return
  g.__relayBootstrapped = true
  try {
    for (const asset of DEFAULT_ASSETS) {
      await db.supportedAsset.upsert({
        where: { mint: asset.mint },
        create: { ...asset, enabled: true },
        update: { symbol: asset.symbol, displayName: asset.displayName, decimals: asset.decimals },
      })
    }
    // Importing worker-processor registers every job processor; then boot the worker.
    await import('./worker-processor')
    const { startWorker } = await import('./jobs')
    startWorker()
    console.log(JSON.stringify({ level: 'info', msg: 'bootstrap_complete', worker: true }))
  } catch (err) {
    g.__relayBootstrapped = false
    console.error(JSON.stringify({ level: 'error', msg: 'bootstrap_failed', err: String(err) }))
  }
}
