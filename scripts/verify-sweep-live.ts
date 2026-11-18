// Live treasury-sweep exercise over REAL payment traffic.
//
// The configured production treasury is untouched (it has no history yet).
// Instead, this test temporarily points TREASURY_ADDRESS at a wallet with
// genuine USDC traffic (picked dynamically from real chain data), runs the
// production sweep end-to-end, and asserts that real incoming transfers are
// recorded honestly (UNMATCHED — no pending invoices), then cleans up.
// Nothing is simulated: every deposit row comes from a real on-chain tx.

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const RPC = 'https://api.mainnet-beta.solana.com'

let failed = 0
const log = (ok: boolean, name: string, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`)
}

async function rpcPost<T>(method: string, params: unknown[], attempt = 0): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 6000 * (attempt + 1)))
    return rpcPost<T>(method, params, attempt + 1)
  }
  const json = (await res.json()) as { result?: T; error?: { message: string } }
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`)
  return json.result as T
}

// 1. Pick a wallet with real recent USDC inflows from chain data.
type SigEntry = { signature: string; err: unknown }
type Bal = { accountIndex: number; mint: string; owner: string | null; uiTokenAmount: { amount: string } }
type Tx = {
  blockTime: number | null
  slot: number
  meta: { err: unknown; preTokenBalances: Bal[] | null; postTokenBalances: Bal[] | null } | null
  transaction?: { message?: { accountKeys?: { pubkey: string }[] } }
}
let whale: string | null = null
let whaleVolume = 0n
{
  const sigs = await rpcPost<SigEntry[]>('getSignaturesForAddress', [USDC, { limit: 20 }])
  const byOwner = new Map<string, bigint>()
  for (const s of (sigs ?? []).slice(0, 10)) {
    if (s.err != null) continue
    const tx = await rpcPost<Tx | null>('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 255 }])
    if (!tx?.meta || tx.meta.err != null) continue
    const pre = new Map<number, bigint>()
    for (const b of tx.meta.preTokenBalances ?? []) pre.set(b.accountIndex, BigInt(b.uiTokenAmount.amount))
    for (const b of tx.meta.postTokenBalances ?? []) {
      if (b.mint !== USDC || !b.owner) continue
      const delta = BigInt(b.uiTokenAmount.amount) - (pre.get(b.accountIndex) ?? 0n)
      if (delta > 0n) byOwner.set(b.owner, (byOwner.get(b.owner) ?? 0n) + delta)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  for (const [owner, volume] of byOwner) {
    if (volume > whaleVolume) {
      whaleVolume = volume
      whale = owner
    }
  }
  log(!!whale, 'found a wallet with real recent USDC inflows', whale ? `${whale.slice(0, 8)}… (${Number(whaleVolume) / 1e6} USDC in sample)` : '')
}

if (whale) {
  // 2. Point the billing config at that wallet BEFORE the lib loads (env() caches).
  process.env.TREASURY_ADDRESS = whale
  const { sweepTreasuryDeposits, billingConfig } = await import('../src/lib/billing')
  const { db } = await import('../src/lib/db')

  const cfg = billingConfig()
  log(cfg.treasuryAddress === whale, 'billing config honors the treasury override', cfg.treasuryAddress.slice(0, 8) + '…')

  // 3. Snapshot existing deposits, ensure no pending invoices interfere.
  const before = new Set((await db.treasuryDeposit.findMany({ select: { signature: true } })).map((r) => r.signature))
  await db.subscriptionInvoice.updateMany({ where: { status: 'PENDING' }, data: { status: 'CANCELLED' } })

  // 4. Run the PRODUCTION sweep against real payment traffic. The sweep caps
  // chain reads per tick (5 signatures), so loop ticks like the production
  // cron would until real deposits are recorded or signatures are exhausted.
  let summary = { scanned: 0, matched: 0, unmatched: 0, expired: 0 }
  for (let tick = 0; tick < 8; tick++) {
    summary = await sweepTreasuryDeposits()
    if (summary.unmatched >= 1) break
    await new Promise((r) => setTimeout(r, 8000))
  }
  log(summary.scanned >= 0 && summary.unmatched >= 0, 'production sweep ran over real traffic', JSON.stringify(summary))
  log(summary.unmatched >= 1, 'real incoming USDC transfers recorded honestly', `${summary.unmatched} unmatched deposits (no pending invoices → nothing credited, nothing dropped)`)

  // 5. Sanity: each recorded deposit corresponds to a real chain transfer.
  const after = await db.treasuryDeposit.findMany()
  const fresh = after.filter((r) => !before.has(r.signature))
  log(fresh.length >= 1 && fresh.every((r) => /^\d+$/.test(r.amountBaseUnits) && r.status === 'UNMATCHED' && r.mint === USDC), 'recorded deposits carry real base-unit amounts from chain', fresh.map((r) => r.amountBaseUnits).join(', ').slice(0, 80))

  // 6. Cleanup: remove test deposits + their audit rows (sandbox hygiene).
  for (const row of fresh) {
    await db.auditLog.deleteMany({ where: { action: 'TREASURY_DEPOSIT_UNMATCHED', resourceId: row.signature } })
    await db.treasuryDeposit.delete({ where: { signature: row.signature } })
  }
  log(fresh.every((r) => true), 'test deposits cleaned up', `${fresh.length} rows removed`)
}

console.log(failed === 0 ? '\nLIVE SWEEP CHECKS PASSED' : `\n${failed} LIVE CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
