'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo, shortAddress } from '@/lib/client/format'
import { PageHeader, StatusBadge, EmptyState, ErrorState, DataTable, Amount } from '../ui'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, ShieldCheck, Clock, Ban } from 'lucide-react'

type ApprovalItem = {
  id: string
  reference: string
  recipientName: string | null
  destination: string
  mint: string
  mintSymbol: string
  decimals: number
  amountBaseUnits: string
  reason: string | null
  walletLabel: string | null
  source: string
  approvalsRequired: number
  decidedByOthers: string[]
  createdByMe: boolean
  iCanDecide: boolean
  waitingOn: number
  createdAt: string
}

export function ApprovalsView() {
  const { navigate } = useRouter()
  const queue = useApi<{ items: ApprovalItem[]; total: number }>(['approvals'], '/api/approvals', { refetchInterval: 15_000 })
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(item: ApprovalItem, decision: 'APPROVED' | 'REJECTED') {
    const reason = decision === 'REJECTED' ? window.prompt('Rejection reason:') ?? '' : window.prompt('Approval note (optional):') ?? ''
    if (decision === 'REJECTED' && !reason) return
    setBusy(item.id)
    try {
      await api(`/api/payments/${item.id}/approve`, { json: { decision, reason: reason || undefined } })
      toast.success(`${item.reference} ${decision.toLowerCase()}`)
      queue.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Approval center"
        description="Maker-checker review with full policy evidence. Approvals bind the exact payload — any material change voids them."
        breadcrumb={['Relay', 'Payments', 'Approval center']}
      />
      {queue.isError ? <ErrorState message={String(queue.error)} retry={() => queue.refetch()} /> : null}
      {queue.data?.items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="Approval queue is clear" description="New payment requests appear here with policy evidence, recipient history and payload hashes." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(queue.data?.items ?? []).map((item) => (
            <Card key={item.id} className="border-[#26374C] bg-[#0E1725] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <button className="font-mono text-sm text-[#35D6C0] hover:underline" onClick={() => navigate(`/app/payments/${item.id}`)}>{item.reference}</button>
                  <div className="mt-0.5 text-[11px] text-dim">submitted {timeAgo(item.createdAt)} · via {item.source}{item.createdByMe ? ' · created by you' : ''}</div>
                </div>
                <div className="text-right">
                  <Amount base={item.amountBaseUnits} decimals={item.decimals} symbol={item.mintSymbol} className="text-base text-[#35D6C0]" />
                  <div className="mt-1"><StatusBadge status="PENDING_APPROVAL" /></div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 rounded-lg border border-[#26374C] bg-[#0B1220] p-3 text-xs">
                <div className="flex justify-between"><span className="text-dim">Recipient</span><span className="text-secondary">{item.recipientName ?? 'Unregistered'} · <span className="font-mono">{shortAddress(item.destination, 4)}</span></span></div>
                <div className="flex justify-between"><span className="text-dim">Asset</span><span className="text-secondary">{item.mintSymbol}</span></div>
                <div className="flex justify-between"><span className="text-dim">Wallet</span><span className="text-secondary">{item.walletLabel ?? '—'}</span></div>
                {item.reason ? <div className="flex justify-between gap-4"><span className="shrink-0 text-dim">Reason</span><span className="text-right text-secondary">{item.reason}</span></div> : null}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-dim">
                <ShieldCheck className="h-3.5 w-3.5 text-[#A18BEB]" />
                {item.approvalsRequired} independent approver{item.approvalsRequired > 1 ? 's' : ''} required
                {item.decidedByOthers.length > 0 ? ` · ${item.decidedByOthers.length} decision(s) recorded` : ''}
                {item.waitingOn > 0 ? ` · waiting on ${item.waitingOn}` : ''}
              </div>
              <div className="mt-3 flex gap-2">
                {item.iCanDecide ? (
                  <>
                    <Button size="sm" onClick={() => decide(item, 'APPROVED')} disabled={busy === item.id} className="bg-[#36C995] font-medium text-[#06221A] hover:bg-[#36C995]/90">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide(item, 'REJECTED')} disabled={busy === item.id} className="border-[#F27683]/40 text-[#F27683]">
                      <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#F2BB62]">
                    {item.createdByMe && item.approvalsRequired > 1 ? <><Ban className="h-3 w-3" /> Separation of duties: the creator cannot approve a multi-approver payment</> : <><Clock className="h-3 w-3" /> You have already decided on this payment</>}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
