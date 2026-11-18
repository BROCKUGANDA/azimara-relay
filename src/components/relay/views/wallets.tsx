'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo, shortAddress, formatAmount } from '@/lib/client/format'
import { PageHeader, StatusBadge, EmptyState, SectionCard, ErrorState, DataTable, SetupRequiredState } from '../ui'
import { CardSkeleton } from '../states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Wallet, RefreshCw, Trash2, ShieldCheck, PenLine } from 'lucide-react'
import { walletAvailable, walletName, connectWallet, signMessageBytes, toBase58 } from '@/lib/client/wallet'

type WalletRow = {
  id: string
  label: string
  address: string
  network: string
  kind: string
  ownershipStatus: string
  balance: { available: boolean; sol?: { lamports: string }; tokens?: { mint: string; amount: string; decimals: number | null }[] } | null
  balanceAt: string | null
  verifiedAt: string | null
  revokedAt: string | null
  createdAt: string
  recentEvents: { id: string; type: string; createdAt: string }[]
}

export function WalletsView() {
  const { navigate } = useRouter()
  const wallets = useApi<{ wallets: WalletRow[] }>(['wallets'], '/api/wallets')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ label: '', address: '', network: 'devnet', kind: 'TREASURY' })
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<{ walletId: string; message: string } | null>(null)

  const extensionAvailable = walletAvailable()

  async function registerWallet(mode: 'WALLET' | 'READ_ONLY') {
    setBusy(true)
    try {
      let address = form.address.trim()
      if (mode === 'WALLET') {
        address = await connectWallet()
        setForm((f) => ({ ...f, address }))
      }
      const res = await api<{ wallet: { id: string }; verification: { message: string } }>('/api/wallets', {
        json: { label: form.label, address, network: form.network, kind: form.kind },
      })
      toast.success('Wallet registered — now verify ownership')
      setVerifyMsg({ walletId: res.wallet.id, message: res.verification.message })
      setAddOpen(false)
      wallets.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/^NO_WALLET: /, '') : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  async function verifyOwnership(walletId: string) {
    if (verifying) return
    setVerifying(true)
    const target = verifyMsg?.walletId === walletId ? verifyMsg : null
    try {
      let message = target?.message
      if (!message) {
        const res = await fetch(`/api/wallets/${walletId}/verify`, { headers: { 'content-type': 'application/json' } })
        const payload = (await res.json()) as { data?: { message: string }; error?: { message: string } }
        if (!res.ok || !payload.data) throw new Error(payload.error?.message ?? 'Failed to get challenge')
        message = payload.data.message
      }
      if (!walletAvailable()) {
        toast.error(`No wallet extension detected (${walletName()}). Verification requires signing; read-only wallets stay unverified and cannot source payments.`)
        return
      }
      const sig = await signMessageBytes(message)
      await api(`/api/wallets/${walletId}/verify`, { json: { signature: toBase58(sig) } })
      toast.success('Ownership verified — wallet can now source payments')
      setVerifyMsg(null)
      wallets.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  async function revoke(walletId: string) {
    if (!window.confirm('Revoke this wallet? It will no longer source payments. Records are retained.')) return
    try {
      await api(`/api/wallets/${walletId}`, { method: 'DELETE' })
      toast.success('Wallet revoked')
      wallets.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed')
    }
  }

  async function refreshBalance(walletId: string) {
    try {
      const res = await fetch(`/api/wallets/${walletId}/balance`, { method: 'POST' })
      const payload = (await res.json()) as { data?: { available: boolean; error?: string } }
      if (payload.data?.available) toast.success('Balances refreshed')
      else toast.warning('RPC unavailable — balances reported as unavailable, never fabricated')
      wallets.refetch()
    } catch {
      toast.error('Refresh failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Wallets"
        description="Register treasury and operational wallets. Ownership is verified with an ed25519 message signature — never a seed phrase."
        breadcrumb={['Relay', 'Wallets']}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90"><Wallet className="mr-1.5 h-4 w-4" /> Register wallet</Button>
            </DialogTrigger>
            <DialogContent className="border-[#1D2E42] bg-[#101C2C]">
              <DialogHeader>
                <DialogTitle>Register a wallet</DialogTitle>
                <DialogDescription>
                  Connect an injected wallet (Phantom) or paste any address in read-only mode. Read-only wallets must be verified by signature before sourcing payments.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Label</Label>
                  <Input placeholder="Main treasury" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="mt-1 border-[#1D2E42] bg-[#0D1622]" />
                </div>
                <div>
                  <Label>Address (read-only mode)</Label>
                  <Input placeholder="Solana public key" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 border-[#1D2E42] bg-[#0D1622] font-mono text-xs" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Network</Label>
                    <Select value={form.network} onValueChange={(v) => setForm({ ...form, network: v })}>
                      <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#1D2E42] bg-[#142436]">
                        <SelectItem value="devnet">Devnet</SelectItem>
                        <SelectItem value="mainnet-beta">Mainnet-beta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Kind</Label>
                    <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                      <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#1D2E42] bg-[#142436]">
                        <SelectItem value="TREASURY">Treasury</SelectItem>
                        <SelectItem value="OPERATIONAL">Operational</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  <Button disabled={busy || !form.label.trim()} onClick={() => registerWallet('WALLET')} className="flex-1 bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
                    <PenLine className="mr-1.5 h-3.5 w-3.5" /> Connect {walletAvailable() ? walletName() : 'wallet'}
                  </Button>
                  <Button disabled={busy || !form.label.trim() || !form.address.trim()} onClick={() => registerWallet('READ_ONLY')} variant="outline" className="flex-1 border-[#1D2E42]">
                    Register read-only
                  </Button>
                </div>
                {!extensionAvailable ? (
                  <p className="text-[11px] text-[#F2BB62]">No Solana extension detected — connect requires Phantom (or similar) in this browser. Read-only registration works without it; balances still fetch from RPC.</p>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {wallets.isError ? <ErrorState message={String(wallets.error)} retry={() => wallets.refetch()} /> : null}
      {verifyMsg ? (
        <div className="mb-4">
          <SetupRequiredState
            title="Ownership challenge ready"
            detail="Sign the displayed message with the wallet to complete verification. The message is NOT a transaction and authorizes nothing."
            action={
              <Button size="sm" onClick={() => verifyOwnership(verifyMsg.walletId)} disabled={verifying} className="bg-[#39C6D8] font-medium text-[#04121A]">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Sign challenge
              </Button>
            }
          />
          <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3 font-mono text-[11px] text-secondary">{verifyMsg.message}</pre>
        </div>
      ) : null}

      {wallets.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (wallets.data?.wallets ?? []).length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No wallets registered"
          description="Register your first treasury wallet to enable payments. Relay stores only the public key and verification state."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(wallets.data?.wallets ?? []).map((w) => (
            <div key={w.id} className={`rounded-xl border bg-[#101C2C] p-4 ${w.revokedAt ? 'border-[#1D2E42]/50 opacity-60' : 'border-[#1D2E42]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{w.label}</span>
                  <span className="rounded bg-[#142436] px-1.5 py-0.5 text-[10px] text-dim">{w.kind}</span>
                  <span className="rounded bg-[#142436] px-1.5 py-0.5 text-[10px] text-dim">{w.network}</span>
                </div>
                <StatusBadge
                  status={w.revokedAt ? 'CANCELLED' : w.ownershipStatus === 'VERIFIED' ? 'COMPLETED' : 'AWAITING_SIGNATURE'}
                  label={w.revokedAt ? 'Revoked' : w.ownershipStatus === 'VERIFIED' ? 'Ownership verified' : w.ownershipStatus === 'FAILED' ? 'Verification failed' : 'Pending verification'}
                />
              </div>
              <div className="mt-2 font-mono text-xs text-secondary">{shortAddress(w.address, 8)}</div>
              {w.balance?.available ? (
                <div className="mt-3 rounded-lg border border-[#16273C] bg-[#0D1622] p-3">
                  <div className="font-mono text-sm tabular-nums text-[#39C6D8]">{formatAmount(w.balance.sol?.lamports ?? '0', 9)} SOL</div>
                  {(w.balance.tokens ?? []).slice(0, 6).map((t) => (
                    <div key={t.mint} className="mt-1 font-mono text-xs tabular-nums text-secondary">{formatAmount(t.amount, t.decimals ?? 6)} · {shortAddress(t.mint, 3)}</div>
                  ))}
                </div>
              ) : w.balance && !w.balance.available ? (
                <div className="mt-3 rounded-lg border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-3 text-xs text-[#F2BB62]">RPC unreachable — balance unavailable (never fabricated)</div>
              ) : (
                <div className="mt-3 text-xs text-dim">No balance observed — refresh to query Solana RPC</div>
              )}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 truncate text-[10px] text-dim">
                  {w.verifiedAt ? `Verified ${timeAgo(w.verifiedAt)} · ` : ''}Last event {w.recentEvents[0] ? `${w.recentEvents[0].type} ${timeAgo(w.recentEvents[0].createdAt)}` : '—'}
                </div>
                <div className="flex gap-1.5">
                  {!w.revokedAt && w.ownershipStatus !== 'VERIFIED' ? (
                    <Button size="sm" variant="outline" className="h-9 border-[#1D2E42] px-3 text-xs" onClick={() => verifyOwnership(w.id)} disabled={verifying}>
                      <ShieldCheck className="mr-1 h-3 w-3" /> Verify
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" className="h-9 px-3 text-xs text-dim" onClick={() => refreshBalance(w.id)}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Balance
                  </Button>
                  {!w.revokedAt ? (
                    <Button size="sm" variant="ghost" aria-label="Remove wallet" className="h-9 w-9 justify-center text-xs text-[#F27683]" onClick={() => revoke(w.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionCard className="mt-6" title="How wallet security works">
        <ul className="space-y-2 text-xs leading-relaxed text-dim">
          <li>• Registration stores the public key only. Seed phrases and private keys are never requested or transmitted.</li>
          <li>• Ownership is proven by signing a nonce-bound message; signatures are verified server-side against the address (ed25519).</li>
          <li>• A verified wallet still authorizes nothing by itself — every payment additionally passes policy approval, payload-hash binding, and your wallet&apos;s own transaction prompt.</li>
        </ul>
      </SectionCard>
    </div>
  )
}
