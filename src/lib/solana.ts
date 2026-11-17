// Solana service. Real address validation, real ownership verification via
// ed25519 message signatures, and real balance reads over JSON-RPC. The
// system never requests or stores seed phrases or private keys.

import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { env } from './env'

export const SOL_MINT = 'native:SOL'
export const SOL_DECIMALS = 9

const TEXT = new TextEncoder()

export function isValidSolanaAddress(address: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false
  try {
    const decoded = bs58.decode(address)
    return decoded.length === 32
  } catch {
    return false
  }
}

export function verifyWalletOwnership(address: string, message: string, signatureBase58: string): boolean {
  try {
    return nacl.sign.detached.verify(TEXT.encode(message), bs58.decode(signatureBase58), bs58.decode(address))
  } catch {
    return false
  }
}

export function ownershipMessage(orgName: string, address: string, nonce: string): string {
  return [
    `AZIMARA RELAY — Wallet ownership verification`,
    `Organization: ${orgName}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Signing this message proves you control this wallet. This is not a transaction and does not authorize any transfer.`,
  ].join('\n')
}

async function rpc<T>(network: string, method: string, params: unknown[], timeoutMs = 15000): Promise<T> {
  const url = network === env().SOLANA_NETWORK ? env().resolvedRpcUrl : network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
    const json = (await res.json()) as { result?: T; error?: { message: string } }
    if (json.error) throw new Error(`RPC error: ${json.error.message}`)
    return json.result as T
  } finally {
    clearTimeout(timer)
  }
}

export async function getSolBalance(network: string, address: string): Promise<{ lamports: string; blockhashSlot: number }> {
  const result = await rpc<{ context: { slot: number }; value: number }>(network, 'getBalance', [address])
  return { lamports: result.value.toString(), blockhashSlot: result.context.slot }
}

export type TokenAccount = { mint: string; amount: string; decimals: number | null }

export async function getSplBalances(network: string, address: string): Promise<TokenAccount[]> {
  const result = await rpc<{
    value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } }[]
  }>(network, 'getTokenAccountsByOwner', [address, { encoding: 'jsonParsed' }])
  const accounts: TokenAccount[] = []
  for (const v of result.value) {
    const info = v.account.data.parsed?.info
    if (!info || info.tokenAmount.amount === '0') continue
    accounts.push({ mint: info.mint, amount: info.tokenAmount.amount, decimals: info.tokenAmount.decimals ?? null })
  }
  return accounts
}

export async function rpcHealthy(network: string): Promise<{ ok: boolean; slot?: number; error?: string }> {
  try {
    const r = await rpc<{ context: { slot: number } }>(network, 'getHealth', [])
    return { ok: true, slot: r.context?.slot }
  } catch (err) {
    try {
      const r = await rpc<{ context: { slot: number } }>(network, 'getSlot', [])
      return { ok: true, slot: r.context.slot }
    } catch (err2) {
      return { ok: false, error: String(err2) }
    }
  }
}

export async function getSignatureStatus(network: string, signature: string): Promise<{ confirmed: boolean; status: string | null; slot?: number; err?: unknown } | null> {
  try {
    const result = await rpc<{ value: ({ status: string; slot: number; err: unknown } | null)[] }>(network, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])
    const v = result.value?.[0]
    if (!v) return null
    return { confirmed: !!v && !v.err && (v.status === 'confirmed' || v.status === 'finalized'), status: v?.status ?? null, slot: v?.slot, err: v?.err ?? undefined }
  } catch {
    return null
  }
}

export function explorerTxUrl(signature: string, network: string): string {
  return network === 'devnet' ? `https://explorer.solana.com/tx/${signature}?cluster=devnet` : `https://explorer.solana.com/tx/${signature}`
}

export function explorerAddressUrl(address: string, network: string): string {
  return network === 'devnet' ? `https://explorer.solana.com/address/${address}?cluster=devnet` : `https://explorer.solana.com/address/${address}`
}
