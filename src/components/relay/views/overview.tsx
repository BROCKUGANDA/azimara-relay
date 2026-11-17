'use client'

import { useRouter, useSession } from '@/lib/client/store'
import { useApi } from '@/lib/client/hooks'
import { formatAmount, timeAgo } from '@/lib/client/format'
import { PageHeader, MetricCard, StatusBadge, EmptyState, SectionCard, ErrorState, Amount } from '../ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, Circle, ArrowRight, Landmark, CheckCheck, Send, Layers, Blocks, Wallet, Users, ShieldCheck } from 'lucide-react'

type TreasuryData = {
  wallets: { id: string; label: string; address: string; network: string; ownershipStatus: string; balance: { available: boolean; sol?: { lamports: string }; tokens?: { mint: string; amount: string; decimals: number }[] } | null; balanceAt: string | null }[]
  metrics: { pendingApprovals: number; activeTransfers: number; failedPayments: number; completedThisMonth: number; scheduledPayments: number; batchesPending: number; providerConfigured: boolean; providerEnvironment: string }
  recentPayments: { id: string; reference: string; status: string; recipientName: string | null; mintSymbol: string; decimals: number; amountBaseUnits: string; walletLabel: string | null; createdAt: string }[]
  recentBatches: { id: string; name: string; reference: string; status: string; itemCount: number; createdAt: string }[]
}

type Onboarding = {
  steps: { id: string; label: string; route: string; done: boolean }[]
  completed: number
  total: number
  dismissed: boolean
}

export function OverviewView() {
  const { navigate } = useRouter()
  const session = useSession()
  const treasury = useApi<TreasuryData>(['treasury'], '/api/treasury', { refetchInterval: 20_000 })
  const onboarding = useApi<Onboarding>(['onboarding'], '/api/onboarding')
  const m = treasury.data?.metrics

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${session.user?.name?.split(' ')[0] ?? 'operator'}`}
        description="Your payment operations at a glance. Everything below is real application state — nothing simulated."
        actions={
          <Button onClick={() => navigate('/app/payments/new')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
            <Send className="mr-1.5 h-4 w-4" /> New payment
          </Button>
        }
      />

      {!m?.providerConfigured ? (
        <button onClick={() => navigate('/app/integrations')} className="mb-6 block w-full rounded-xl border border-[#F2BB62]/30 bg-[#F2BB62]/5 px-4 py-3 text-left transition-colors hover:bg-[#F2BB62]/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[#F2BB62]">MultiHopper integration is not configured</div>
              <div className="mt-0.5 text-xs text-[#F2BB62]/70">Payments can be created and approved now; quoting and execution activate once you add provider credentials ({m?.providerEnvironment ?? 'DEVNET'}).</div>
            </div>
            <Blocks className="h-5 w-5 shrink-0 text-[#F2BB62]" />
          </div>
        </button>
      ) : null}

      {treasury.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl bg-[#142135]" />)}
        </div>
      ) : treasury.isError ? (
        <ErrorState message={String(treasury.error)} retry={() => treasury.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Pending approvals" value={m?.pendingApprovals ?? 0} accent="purple" sub={m?.pendingApprovals ? 'Needs review' : 'Nothing waiting'} />
          <MetricCard label="Transfers in flight" value={m?.activeTransfers ?? 0} accent="blue" sub="Signing → settlement" />
          <MetricCard label="Completed this month" value={m?.completedThisMonth ?? 0} accent="teal" sub="Verified settlements" />
          <MetricCard label="Failed / attention" value={m?.failedPayments ?? 0} accent="red" sub="Failed or recoverable" />
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Onboarding checklist */}
        <SectionCard title="Workspace setup" description="Guided checklist — real completion state, not decorative progress." className="lg:col-span-1">
          {onboarding.isLoading ? (
            <Skeleton className="h-40 bg-[#142135]" />
          ) : (
            <div className="space-y-2.5">
              {(onboarding.data?.steps ?? []).map((s) => (
                <button key={s.id} onClick={() => navigate(s.route.replace('#', ''))} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[#142135]">
                  {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#36C995]" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-dim" />}
                  <span className="flex-1">
                    <span className={`block text-xs ${s.done ? 'text-dim line-through' : 'text-secondary'}`}>{s.label}</span>
                    {!s.done ? <span className="text-[10px] text-[#35D6C0]">Go →</span> : null}
                  </span>
                </button>
              ))}
              <div className="pt-1 text-[11px] text-dim">{onboarding.data?.completed ?? 0}/{onboarding.data?.total ?? 5} complete</div>
            </div>
          )}
        </SectionCard>

        {/* Recent payments */}
        <SectionCard title="Recent payments" description="Latest activity across all sources." className="lg:col-span-2" actions={<Button variant="ghost" size="sm" className="text-xs text-dim" onClick={() => navigate('/app/payments')}>View all <ArrowRight className="ml-1 h-3 w-3" /></Button>}>
          {treasury.data?.recentPayments.length === 0 ? (
            <EmptyState
              icon={<Send className="h-7 w-7" />}
              title="No payments yet"
              description="Create your first payment or batch — the full lifecycle from validation to settlement is live."
              action={<Button size="sm" onClick={() => navigate('/app/payments/new')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">Create payment</Button>}
            />
          ) : (
            <div className="space-y-1">
              {(treasury.data?.recentPayments ?? []).map((p) => (
                <button key={p.id} onClick={() => navigate(`/app/payments/${p.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#142135]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-[#35D6C0]">{p.reference}</span>
                      <span className="text-dim">·</span>
                      <span className="truncate text-secondary">{p.recipientName ?? p.walletLabel ?? 'Unknown'}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-dim">{timeAgo(p.createdAt)}</div>
                  </div>
                  <Amount base={p.amountBaseUnits} decimals={p.decimals} symbol={p.mintSymbol} className="text-xs" />
                  <StatusBadge status={p.status} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: <Wallet className="h-5 w-5" />, label: 'Connect wallet', route: '/app/wallets' },
          { icon: <Users className="h-5 w-5" />, label: 'Add recipients', route: '/app/recipients' },
          { icon: <Layers className="h-5 w-5" />, label: 'Batch payouts', route: '/app/batches' },
          { icon: <Landmark className="h-5 w-5" />, label: 'Treasury detail', route: '/app/treasury' },
        ].map((a) => (
          <button key={a.route} onClick={() => navigate(a.route)} className="flex items-center gap-3 rounded-xl border border-[#26374C] bg-[#0E1725] p-4 text-left transition-colors duration-150 hover:bg-[#142135]">
            <span className="text-[#35D6C0]">{a.icon}</span>
            <span className="flex-1 text-sm">{a.label}</span>
            <ArrowRight className="h-4 w-4 text-dim" />
          </button>
        ))}
      </div>

      {/* Approvals shortcut */}
      {m?.pendingApprovals ? (
        <button onClick={() => navigate('/app/approvals')} className="mt-6 block w-full rounded-xl border border-[#A18BEB]/30 bg-[#A18BEB]/5 px-4 py-3 text-left hover:bg-[#A18BEB]/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCheck className="h-5 w-5 text-[#A18BEB]" />
              <div>
                <div className="text-sm font-medium text-[#A18BEB]">{m.pendingApprovals} payment{m.pendingApprovals > 1 ? 's' : ''} awaiting approval</div>
                <div className="text-xs text-[#A18BEB]/70">Open the approval center to review with full policy evidence.</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-[#A18BEB]" />
          </div>
        </button>
      ) : null}

      <div className="mt-8 flex items-center gap-2 text-[11px] text-dim">
        <ShieldCheck className="h-3.5 w-3.5 text-[#36C995]" />
        Non-custodial: no seed phrases or private keys are stored; no omnibus wallet holds customer funds; AI never signs or approves.
      </div>
    </div>
  )
}
