'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/client/store'
import { useApi } from '@/lib/client/hooks'
import { formatAmount, timeAgo, shortAddress } from '@/lib/client/format'
import { PageHeader, MetricCard, StatusBadge, EmptyState, SectionCard, ErrorState, Amount, DataTable } from '../ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, Wallet as WalletIcon, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

type TreasuryData = {
  wallets: {
    id: string
    label: string
    address: string
    network: string
    ownershipStatus: string
    balance: { available: boolean; sol?: { lamports: string }; tokens?: { mint: string; amount: string; decimals: number | null }[] } | null
    balanceAt: string | null
  }[]
  metrics: { pendingApprovals: number; activeTransfers: number; failedPayments: number; completedThisMonth: number; scheduledPayments: number; batchesPending: number; providerConfigured: boolean }
  recentPayments: { id: string; reference: string; status: string; recipientName: string | null; mintSymbol: string; decimals: number; amountBaseUnits: string; walletLabel: string | null; createdAt: string }[]
  recentBatches: { id: string; name: string; reference: string; status: string; itemCount: number; totalBaseUnits: string; mint: string; createdAt: string }[]
}

type AnalyticsData = {
  timeline: { date: string; volume: number; completed: number; failed: number; count: number }[]
  byStatus: { status: string; count: number }[]
  assetDistribution: { mint: string; symbol: string; total: string; count: number }[]
  avgSettlementHours: number | null
  totals: { payments: number; completed: number; failed: number; ledgerEntries: number; sources: string[] }
}

function ExpenditureChart({ timeline }: { timeline: AnalyticsData['timeline'] }) {
  const data = timeline.length
    ? timeline
    : [{ date: new Date().toISOString().slice(0, 10), volume: 0, completed: 0, failed: 0, count: 0 }]
  const max = Math.max(...data.map((d) => d.volume), 1)
  return (
    <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Daily payment volume chart">
      {data.slice(-40).map((d) => (
        <div key={d.date} className="group relative flex-1">
          <div
            className="w-full rounded-t bg-gradient-to-t from-[#35D6C0]/20 to-[#35D6C0]/70 transition-all duration-150 group-hover:from-[#35D6C0]/40 group-hover:to-[#35D6C0]"
            style={{ height: `${Math.max(4, (d.volume / max) * 120)}px` }}
          />
          <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[#26374C] bg-[#142135] px-2 py-1 text-[10px] group-active:block group-hover:block">
            {d.date}: {Number.isFinite(d.volume) ? d.volume.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'} · {d.completed}✓ {d.failed}✗
          </div>
        </div>
      ))}
    </div>
  )
}

export function TreasuryView() {
  const { navigate } = useRouter()
  const treasury = useApi<TreasuryData>(['treasury'], '/api/treasury', { refetchInterval: 30_000 })
  const analytics = useApi<AnalyticsData>(['analytics', 30], '/api/analytics?days=30')
  const [refreshing, setRefreshing] = useState<string | null>(null)

  async function refreshBalance(walletId: string) {
    setRefreshing(walletId)
    try {
      const res = await fetch(`/api/wallets/${walletId}/balance`, { method: 'POST' })
      const payload = (await res.json()) as { data?: { available: boolean; error?: string } }
      if (payload.data?.available) toast.success('Balances refreshed from Solana RPC')
      else toast.warning(payload.data?.error ? `RPC unavailable: ${payload.data.error.slice(0, 80)}` : 'RPC unavailable — balances not fabricated')
      treasury.refetch()
    } catch {
      toast.error('Balance refresh failed')
    } finally {
      setRefreshing(null)
    }
  }

  const m = treasury.data?.metrics
  const maxTotal = Math.max(...(analytics.data?.assetDistribution ?? []).map((a) => {
    const n = parseFloat(String(a.total).replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }), 0)

  return (
    <div>
      <PageHeader
        title="Treasury"
        description="Balances, obligations and payment flow across your verified wallets."
        breadcrumb={['Relay', 'Treasury']}
      />
      {treasury.isError ? <ErrorState message={String(treasury.error)} retry={() => treasury.refetch()} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Payments (30d)" value={analytics.data?.totals?.payments ?? analytics.data?.timeline.reduce((a, t) => a + t.count, 0) ?? 0} accent="teal" sub="All payment records" />
        <MetricCard label="Pending approvals" value={m?.pendingApprovals ?? 0} accent="purple" />
        <MetricCard label="In flight" value={m?.activeTransfers ?? 0} accent="blue" />
        <MetricCard label="Failed / attention" value={m?.failedPayments ?? 0} accent="red" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Payment volume — last 30 days" description="Real payment records; intermediate hops are never counted as volume.">
          {analytics.isLoading ? <Skeleton className="h-36 bg-[#142135]" /> : analytics.data ? <ExpenditureChart timeline={analytics.data.timeline} /> : null}
        </SectionCard>
        <SectionCard title="Asset distribution" description="Completed payment volume per asset.">
          {(analytics.data?.assetDistribution ?? []).length ? (
            <div className="space-y-2">
              {(analytics.data?.assetDistribution ?? []).map((a) => (
                <div key={a.mint} className="flex items-center gap-3">
                  <span className="w-14 text-xs font-medium text-[#35D6C0]">{a.symbol}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#142135]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#35D6C0] to-[#658CFF]" style={{ width: `${maxTotal > 0 ? Math.max(4, Math.min(100, (parseFloat(String(a.total).replace(/,/g, '')) / maxTotal) * 100)) : 0}%` }} />
                  </div>
                  <span className="min-w-0 truncate font-mono text-xs tabular-nums">{a.total}</span>
                  <span className="hidden w-10 shrink-0 text-right text-[10px] text-dim sm:inline">{a.count}×</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No completed payments in range" description="Volume appears as real settlements verify." />
          )}
        </SectionCard>
      </div>

      <SectionCard className="mt-6" title="Wallet balances" description="Live Solana RPC reads for verified wallets. Unreachable RPC is reported honestly — never faked." actions={<Button size="sm" variant="outline" className="border-[#26374C] text-xs" onClick={() => navigate('/app/wallets')}>Manage wallets</Button>}>
        {(treasury.data?.wallets ?? []).length === 0 ? (
          <EmptyState icon={<WalletIcon className="h-7 w-7" />} title="No wallets connected" description="Register a treasury wallet to see balances here." action={<Button size="sm" onClick={() => navigate('/app/wallets')} className="bg-[#35D6C0] font-medium text-[#062A26]">Connect wallet</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(treasury.data?.wallets ?? []).map((w) => (
              <div key={w.id} className="rounded-xl border border-[#26374C] bg-[#0B1220] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{w.label}</span>
                    <StatusBadge status={w.ownershipStatus === 'VERIFIED' ? 'COMPLETED' : 'AWAITING_SIGNATURE'} label={w.ownershipStatus === 'VERIFIED' ? 'Verified' : 'Unverified'} />
                  </div>
                  <Button size="sm" variant="ghost" className="h-9 text-xs text-dim" onClick={() => refreshBalance(w.id)} disabled={refreshing === w.id}>
                    <RefreshCw className={`mr-1 h-3 w-3 ${refreshing === w.id ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                </div>
                <div className="mt-2 font-mono text-xs text-dim">{shortAddress(w.address, 6)} · {w.network}</div>
                {w.balance?.available ? (
                  <div className="mt-3 space-y-1">
                    <div className="font-mono text-sm tabular-nums text-[#35D6C0]">
                      {formatAmount(w.balance.sol?.lamports ?? '0', 9)} SOL
                    </div>
                    {(w.balance.tokens ?? []).slice(0, 4).map((t) => (
                      <div key={t.mint} className="font-mono text-xs tabular-nums text-secondary">
                        {formatAmount(t.amount, t.decimals ?? 6)} <span className="text-dim">{shortAddress(t.mint, 3)}</span>
                      </div>
                    ))}
                    <div className="pt-1 text-[10px] text-dim">Observed {w.balanceAt ? timeAgo(w.balanceAt) : ''}</div>
                  </div>
                ) : w.balance && !w.balance.available ? (
                  <div className="mt-3 flex items-center gap-2 text-xs text-[#F2BB62]">
                    <AlertTriangle className="h-3.5 w-3.5" /> RPC unreachable — balance unavailable
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-dim">No balance observed yet — refresh to fetch from RPC</div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard className="mt-6" title="Recent payments" description="Latest 12 across the organization.">
        {(treasury.data?.recentPayments ?? []).length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <DataTable
            keyOf={(p) => p.id}
            rows={treasury.data?.recentPayments ?? []}
            columns={[
              { key: 'ref', header: 'Reference', render: (p) => <button className="font-mono text-xs text-[#35D6C0] hover:underline" onClick={() => navigate(`/app/payments/${p.id}`)}>{p.reference}</button> },
              { key: 'r', header: 'Recipient', render: (p) => <span className="text-xs text-secondary">{p.recipientName ?? '—'}</span> },
              { key: 'amt', header: 'Amount', render: (p) => <Amount base={p.amountBaseUnits} decimals={p.decimals} symbol={p.mintSymbol} className="text-xs" /> },
              { key: 'when', header: 'Created', render: (p) => <span className="text-xs text-dim">{timeAgo(p.createdAt)}</span> },
              { key: 'st', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
            ]}
          />
        )}
      </SectionCard>
    </div>
  )
}
