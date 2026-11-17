import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'

export const GET = route(async () => {
  const assets = await db.supportedAsset.findMany({ where: { enabled: true }, orderBy: { symbol: 'asc' } })
  return ok({ assets: assets.map((a) => ({ mint: a.mint, symbol: a.symbol, name: a.displayName, decimals: a.decimals, verified: a.verified, providerEligible: a.providerEligible })) })
})
