'use client'

import { useState } from 'react'
import { useApi } from '@/lib/client/hooks'
import { PageHeader, MetricCard, EmptyState, ErrorState, SectionCard } from '../ui'
import { MetricSkeleton, ChartSkeleton } from '../states'
import { MiniBars } from '../widgets'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '../ui'
import { BarChart3 } from 'lucide-react'

type Analytics = {
  rangeDays: number
  timeline: { date: string; volume: number; completed: number; failed: number; count: number }[]
  byStatus: { status: string; count: number }[]
  assetDistribution: { mint: string; symbol: string; total: string; count: number }[]
  feeBreakdown: { type: string; total: string }[]
  topRecipients: { name: string; category: string | null; count: number }[]
  batchCompletion: { total: number; completed: number }
  byCategory: { category: string; count: number }[]
  avgSettlementHours: number | null
  totals: { payments: number; completed: number; failed: number; ledgerEntries: number; sources: string[] }
}

export function AnalyticsView() {
  const [days, setDays] = useState('30')
  const data = useApi<Analytics>(['analytics', days], `/api/analytics?days=${days}`)

  const maxVolume = Math.max(1, ...(data.data?.timeline ?? []).map((t) => t.volume))

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Business analytics from real records — never decorative charts or synthetic volume."
        breadcrumb={['Relay', 'Assurance', 'Analytics']}
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
            <SelectContent className="border-[#1D2E42] bg-[#142436]">
              {[7, 30, 90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      {data.isError ? <ErrorState message={String(data.error)} retry={() => data.refetch()} /> : null}

      {data.isLoading ? <MetricSkeleton /> : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Payments" value={data.data?.totals?.payments ?? 0} accent="teal" sub={`${data.data?.totals?.completed ?? 0} completed · ${data.data?.totals?.failed ?? 0} failed`} />
        <MetricCard label="Ledger entries" value={data.data?.totals?.ledgerEntries ?? 0} accent="blue" sub="Observed events only" />
        <MetricCard label="Batch completion" value={data.data?.batchCompletion?.total ? `${Math.round((data.data.batchCompletion.completed / data.data.batchCompletion.total) * 100)}%` : '0%'} accent="purple" sub={`${data.data?.batchCompletion?.completed ?? 0}/${data.data?.batchCompletion?.total ?? 0} batches`} />
        <MetricCard label="Avg settlement" value={data.data?.avgSettlementHours ? `${Math.max(0, data.data.avgSettlementHours).toFixed(1)}h` : '—'} accent="amber" sub="Creation → verified settlement" />
      </div>
      )}

      <SectionCard className="mt-5" title="Payment volume over time" description="Daily totals from payment records. Tooltips show completed vs failed counts.">
        {data.isLoading ? (
          <ChartSkeleton />
        ) : (data.data?.timeline ?? []).length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-7 w-7" />} title="No payment activity in range" description="Charts populate from real records as operations run." />
        ) : (
          <div>
            <div className="flex h-48 items-end gap-1" role="img" aria-label="Payment volume by day">
              {(data.data?.timeline ?? []).map((t) => (
                <div key={t.date} className="group relative flex-1">
                  <div className="w-full rounded-t bg-gradient-to-t from-[#F17FA8]/20 to-[#F17FA8]/70 transition-all duration-150 hover:to-[#F17FA8]" style={{ height: `${Math.max(4, (t.volume / maxVolume) * 170)}px` }} />
                  <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[#1D2E42] bg-[#142436] px-2 py-1 text-[10px] group-active:block group-hover:block">
                    {t.date}: {t.volume.toLocaleString('en-US', { maximumFractionDigits: 2 })} ({t.count})
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-dim">
              <span>{(data.data?.timeline ?? [])[0]?.date}</span>
              <span>{(data.data?.timeline ?? []).slice(-1)[0]?.date}</span>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title="Lifecycle distribution" description="Payments by current state.">
          <div className="space-y-2">
            {(data.data?.byStatus ?? []).length === 0 ? <div className="text-xs text-dim">No data yet.</div> : (
              <>
                {/* Relative magnitude of each state at a glance. */}
                <MiniBars data={(data.data?.byStatus ?? []).map((s) => s.count)} color="#8AA2F0" height={36} label="Payments per lifecycle state" />
                {(data.data?.byStatus ?? []).map((s) => (
                  <div key={s.status} className="flex items-center justify-between gap-2">
                    <StatusBadge status={s.status} />
                    <span className="font-mono text-xs tabular-nums">{s.count}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Asset distribution" description="Completed volume per asset.">
          <div className="space-y-2">
            {(data.data?.assetDistribution ?? []).length === 0 ? <div className="text-xs text-dim">No completed payments yet.</div> : null}
            {(data.data?.assetDistribution ?? []).map((a) => (
              <div key={a.mint} className="flex items-center justify-between text-xs">
                <span className="text-[#39C6D8]">{a.symbol}</span>
                <span className="font-mono tabular-nums text-secondary">{a.total} <span className="text-dim">({a.count}×)</span></span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Payment activity by category" description="Recipient categories in range.">
          <div className="space-y-2">
            {(data.data?.byCategory ?? []).length === 0 ? <div className="text-xs text-dim">No recipients yet.</div> : null}
            {(data.data?.byCategory ?? []).map((c) => (
              <div key={c.category} className="flex items-center justify-between text-xs">
                <span className="text-secondary">{c.category}</span>
                <span className="font-mono tabular-nums">{c.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Top recipients" description="Payment counts in range.">
          <div className="space-y-2">
            {(data.data?.topRecipients ?? []).length === 0 ? <div className="text-xs text-dim">No payments yet.</div> : null}
            {(data.data?.topRecipients ?? []).map((r, i) => (
              <div key={`${r.name}-${i}`} className="flex items-center gap-3 text-xs">
                <span className="w-4 text-dim">{i + 1}.</span>
                <span className="flex-1 text-secondary">{r.name}</span>
                <span className="text-dim">{r.category ?? ''}</span>
                <span className="font-mono tabular-nums">{r.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Fee breakdown" description="Observed provider, network and screening fees from the ledger.">
          <div className="space-y-2">
            {(data.data?.feeBreakdown ?? []).length === 0 ? <div className="text-xs text-dim">No fees recorded yet — fees post to the ledger from confirmed settlements.</div> : null}
            {(data.data?.feeBreakdown ?? []).map((f) => (
              <div key={f.type} className="flex items-center justify-between text-xs">
                <span className="text-secondary">{f.type.replaceAll('_', ' ')}</span>
                <span className="font-mono tabular-nums">{f.total}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
