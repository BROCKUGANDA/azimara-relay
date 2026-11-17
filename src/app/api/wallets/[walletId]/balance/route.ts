import { ok, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { getSolBalance, getSplBalances } from '@/lib/solana'

function walletIdFrom(request: Request): string {
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
}

/// Refreshes real balances for a registered wallet over the Solana JSON-RPC.
/// When the RPC is unreachable the platform reports a genuine unavailable
/// state — fabricated balances never enter the system.
export const POST = route(async ({ org, request }) => {
  const wallet = await db.wallet.findFirst({ where: { id: walletIdFrom(request), orgId: org.org.id } })
  if (!wallet) throw new ApiError('NOT_FOUND', 'Wallet not found', 404)
  if (wallet.revokedAt) throw new ApiError('WALLET_REVOKED', 'This wallet has been revoked', 409)
  try {
    const [sol, spl] = await Promise.all([getSolBalance(wallet.network, wallet.address), getSplBalances(wallet.network, wallet.address)])
    const snapshot = {
      available: true,
      sol: { lamports: sol.lamports },
      tokens: spl,
      rpcSlot: sol.blockhashSlot,
      observedAt: new Date().toISOString(),
      source: 'SOLANA_RPC',
    }
    await db.wallet.update({ where: { id: wallet.id }, data: { balanceJson: JSON.stringify(snapshot), balanceAt: new Date() } })
    await db.walletEvent.create({ data: { walletId: wallet.id, type: 'BALANCE_OBSERVED', dataJson: JSON.stringify({ slot: sol.blockhashSlot }) } })
    return ok(snapshot)
  } catch (err) {
    return ok({
      available: false,
      error: err instanceof Error ? err.message : String(err),
      note: 'Solana RPC is unreachable from this environment. Balances are reported as unavailable rather than fabricated.',
    })
  }
}, { permission: 'wallet:read' })
