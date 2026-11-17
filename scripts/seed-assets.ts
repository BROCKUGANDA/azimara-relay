// One-off seed: supported-asset registry (safe to re-run).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DEFAULT_ASSETS = [
  { mint: 'native:SOL', symbol: 'SOL', displayName: 'Solana', decimals: 9, verified: true, providerEligible: false },
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', displayName: 'USD Coin', decimals: 6, verified: true, providerEligible: true },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', displayName: 'Tether USD', decimals: 6, verified: true, providerEligible: true },
]

async function main() {
  for (const asset of DEFAULT_ASSETS) {
    await db.supportedAsset.upsert({
      where: { mint: asset.mint },
      create: { ...asset, enabled: true },
      update: { symbol: asset.symbol, displayName: asset.displayName, decimals: asset.decimals },
    })
  }
  const count = await db.supportedAsset.count()
  console.log(JSON.stringify({ ok: true, assets: count }))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
