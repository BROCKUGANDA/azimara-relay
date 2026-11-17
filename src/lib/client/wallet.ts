'use client'

// Lightweight Solana wallet provider access (Phantom / Solflare injected
// providers). The platform never sees a seed phrase or private key — only
// public keys, message signatures and (for real transfers) signed
// transactions produced by the user's own wallet.

export type InjectedSolana = {
  isPhantom?: boolean
  publicKey?: { toString(): string } | null
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
  disconnect: () => Promise<void>
  signMessage: (message: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array } | Uint8Array>
  signTransaction?: (tx: unknown) => Promise<{ serialize: () => Uint8Array }>
  signAllTransactions?: (txs: unknown[]) => Promise<{ serialize: () => Uint8Array }[]>
}

export function getInjected(): InjectedSolana | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { phantom?: { solana?: InjectedSolana }; solana?: InjectedSolana }
  return w.phantom?.solana ?? w.solana ?? null
}

export function walletAvailable(): boolean {
  return getInjected() !== null
}

export function walletName(): string {
  const p = getInjected()
  if (!p) return 'none'
  return p.isPhantom ? 'Phantom' : 'Injected wallet'
}

export async function connectWallet(): Promise<string> {
  const p = getInjected()
  if (!p) throw new Error('NO_WALLET: No Solana wallet extension detected. Install Phantom, or use read-only registration with a paste address.')
  const res = await p.connect()
  return res.publicKey.toString()
}

export async function signMessageBytes(message: string): Promise<Uint8Array> {
  const p = getInjected()
  if (!p) throw new Error('NO_WALLET: No Solana wallet extension detected.')
  const encoded = new TextEncoder().encode(message)
  const res = await p.signMessage(encoded, 'utf8')
  if (res instanceof Uint8Array) return res
  return res.signature
}

export function toBase58(bytes: Uint8Array): string {
  // bs58 is a server dependency; a compact client implementation avoids
  // shipping it to the browser bundle.
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  if (bytes.length === 0) return ''
  let num = BigInt(0)
  for (const b of bytes) num = (num << 8n) | BigInt(b)
  let out = ''
  while (num > 0n) {
    out = ALPHABET[Number(num % 58n)] + out
    num /= 58n
  }
  for (const b of bytes) {
    if (b === 0) out = '1' + out
    else break
  }
  return out
}
