'use client'

import { useApi, api } from '@/lib/client/hooks'
import { useSession } from '@/lib/client/store'
import { formatDateTime } from '@/lib/client/format'
import { PageHeader, SectionCard, ErrorState } from '../ui'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CheckCircle2, CreditCard } from 'lucide-react'

type BillingData = {
  subscription: { plan: string; status: string; seats: number; seatLimit: number; periodEnd: string } | null
  plan: string
  planStatus: string
  entitlements: { seats: number; maxBatchItems: number; monthlyPayments: number; aiRequestsPerMonth: number; apiKeys: number; treasuryWallets: number; exports: boolean; apiAccess: boolean; multiApprover: boolean; priceMonthlyUsd: number | null }
  usage: { paymentsThisMonth: number; members: number; activeKeys: number; paymentsLimit: number; seatsLimit: number; apiKeysLimit: number }
  plans: { id: string; seats: number; maxBatchItems: number; monthlyPayments: number; aiRequestsPerMonth: number; apiKeys: number; treasuryWallets: number; apiAccess: boolean; multiApprover: boolean; priceMonthlyUsd: number | null }[]
  billingEvents: { id: string; type: string; data: Record<string, unknown>; createdAt: string }[]
  collectionNote: string
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100))
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className="font-mono tabular-nums text-dim">{used} / {limit}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#142135]">
        <div className={`h-full rounded-full ${pct > 90 ? 'bg-[#F27683]' : pct > 70 ? 'bg-[#F2BB62]' : 'bg-[#35D6C0]'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function BillingView() {
  const session = useSession()
  const billing = useApi<BillingData>(['billing'], '/api/billing')

  async function changePlan(plan: string) {
    if (!window.confirm(`Switch plan to ${plan}? Plan changes take effect immediately (no payment collection is configured).`)) return
    try {
      await api('/api/billing', { json: { plan } })
      toast.success(`Plan switched to ${plan}`)
      billing.refetch()
      session.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Plan change failed')
    }
  }

  const d = billing.data
  const canManage = ['OWNER', 'TREASURY_ADMIN'].includes(session.activeOrg?.role ?? '')

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Subscription plans enforce real limits in code. Payment collection activates only with a configured billing provider."
        breadcrumb={['Relay', 'Administration', 'Billing']}
      />
      {billing.isError ? <ErrorState message={String(billing.error)} retry={() => billing.refetch()} /> : null}
      {d ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#35D6C0]/30 bg-[#35D6C0]/5 p-4">
              <div className="text-[10px] uppercase tracking-wide text-[#35D6C0]/70">Current plan</div>
              <div className="mt-1 text-xl font-semibold text-[#35D6C0]">{d.plan}</div>
              <div className="text-xs text-dim">{d.planStatus} · renews {d.subscription ? formatDateTime(d.subscription.periodEnd) : '—'}</div>
            </div>
            <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
              <div className="text-[10px] uppercase tracking-wide text-dim">Monthly price</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{d.entitlements.priceMonthlyUsd ? `$${d.entitlements.priceMonthlyUsd}` : 'Custom'}</div>
            </div>
            <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
              <div className="text-[10px] uppercase tracking-wide text-dim">Seats</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{d.usage.members}/{d.usage.seatsLimit}</div>
            </div>
            <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
              <div className="text-[10px] uppercase tracking-wide text-dim">Payments this month</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{d.usage.paymentsThisMonth}/{d.usage.paymentsLimit}</div>
            </div>
          </div>

          <SectionCard className="mt-5" title="Usage against entitlements" description="Limits are enforced server-side — the UI reflects the same values.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Meter label="Payments this month" used={d.usage.paymentsThisMonth} limit={d.usage.paymentsLimit} />
              <Meter label="Seats" used={d.usage.members} limit={d.usage.seatsLimit} />
              <Meter label="Active API keys" used={d.usage.activeKeys} limit={d.usage.apiKeysLimit} />
              <Meter label="Treasury wallets" used={d.usage.activeKeys === d.usage.apiKeysLimit ? 0 : d.usage.activeKeys} limit={d.entitlements.treasuryWallets} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full border px-2.5 py-1 ${d.entitlements.multiApprover ? 'border-[#36C995]/40 text-[#36C995]' : 'border-[#26374C] text-dim'}`}>Multi-approver policies {d.entitlements.multiApprover ? 'included' : 'not included'}</span>
              <span className={`rounded-full border px-2.5 py-1 ${d.entitlements.apiAccess ? 'border-[#36C995]/40 text-[#36C995]' : 'border-[#26374C] text-dim'}`}>Developer API {d.entitlements.apiAccess ? 'included' : 'not included'}</span>
              <span className={`rounded-full border px-2.5 py-1 ${d.entitlements.exports ? 'border-[#36C995]/40 text-[#36C995]' : 'border-[#26374C] text-dim'}`}>Financial exports {d.entitlements.exports ? 'included' : 'not included'}</span>
            </div>
          </SectionCard>

          <SectionCard className="mt-5" title="Plans" description="Switch any time; entitlements change immediately.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {d.plans.map((p) => (
                <div key={p.id} className={`rounded-xl border p-4 ${p.id === d.plan ? 'border-[#35D6C0]/50 bg-[#35D6C0]/5' : 'border-[#26374C] bg-[#0B1220]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{p.id}</span>
                    {p.id === d.plan ? <CheckCircle2 className="h-4 w-4 text-[#35D6C0]" /> : null}
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{p.priceMonthlyUsd ? `$${p.priceMonthlyUsd}/mo` : 'Custom'}</div>
                  <div className="mt-2 space-y-1 text-[11px] text-dim">
                    <div>{p.seats} seats · {p.maxBatchItems} batch items</div>
                    <div>{p.monthlyPayments.toLocaleString('en-US')} payments/mo</div>
                    <div>{p.apiKeys} API keys · {p.aiRequestsPerMonth.toLocaleString('en-US')} AI req/mo</div>
                  </div>
                  {canManage && p.id !== d.plan ? (
                    <Button size="sm" onClick={() => changePlan(p.id)} variant="outline" className="mt-3 w-full border-[#26374C]">Switch to {p.id}</Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-3 text-[11px] text-[#F2BB62]">
              <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {d.collectionNote}
            </div>
          </SectionCard>

          <SectionCard className="mt-5" title="Billing events">
            <div className="space-y-1.5">
              {d.billingEvents.length === 0 ? <div className="text-xs text-dim">No billing events yet.</div> : null}
              {d.billingEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-[#26374C] bg-[#0B1220] px-3 py-2 text-xs">
                  <span className="text-secondary">{e.type.replaceAll('_', ' ')}{e.data?.to ? ` → ${e.data.to}` : ''}</span>
                  <span className="text-dim">{formatDateTime(e.createdAt)}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
