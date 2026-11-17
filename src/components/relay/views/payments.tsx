'use client'

import { useState } from 'react'
import { useApi } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo, shortAddress } from '@/lib/client/format'
import { PageHeader, StatusBadge, EmptyState, ErrorState, DataTable, Amount } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send, Layers } from 'lucide-react'

type PaymentRow = {
  id: string
  reference: string
  type: string
  status: string
  statusReason: string | null
  recipientName: string | null
  destination: string
  mintSymbol: string
  amountBaseUnits: string
  decimals: number
  reason: string | null
  walletLabel: string | null
  source: string
  approvalsRequired: number
  providerTransferId: string | null
  createdAt: string
}

const STATUS_GROUPS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'PENDING_APPROVAL', label: 'Awaiting approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'QUOTED', label: 'Quoted' },
  { value: 'ACTIVE_EXECUTION', label: 'In execution' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'RECOVERABLE', label: 'Recoverable' },
  { value: 'MANUAL_REVIEW', label: 'Manual review' },
]

export function PaymentsView() {
  const { navigate } = useRouter()
  const [status, setStatus] = useState('ALL')
  const [q, setQ] = useState('')
  const payments = useApi<{ payments: PaymentRow[]; total: number }>(['payments', status, q], `/api/payments?status=${status}&q=${encodeURIComponent(q)}`)

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Every payment operation with its full lifecycle state. Sources: app, AI proposals (converted), API and schedules."
        breadcrumb={['Relay', 'Payments']}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/app/batches')} className="border-[#26374C] text-xs"><Layers className="mr-1.5 h-3.5 w-3.5" /> Batch builder</Button>
            <Button onClick={() => navigate('/app/payments/new')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90"><Send className="mr-1.5 h-4 w-4" /> New payment</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search reference, destination, reason…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64 border-[#26374C] bg-[#0B1220]" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52 border-[#26374C] bg-[#0B1220]"><SelectValue /></SelectTrigger>
          <SelectContent className="border-[#26374C] bg-[#142135]">
            {STATUS_GROUPS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto self-center text-xs text-dim">{payments.data?.total ?? 0} payments</div>
      </div>

      {payments.isError ? <ErrorState message={String(payments.error)} retry={() => payments.refetch()} /> : null}

      <DataTable
        keyOf={(p) => p.id}
        rows={payments.data?.payments ?? []}
        empty={
          <EmptyState
            icon={<Send className="h-8 w-8" />}
            title="No payments found"
            description="Create a single payment or import a batch. Payments move through validation → approval → quote → wallet signature → settlement → reconciliation."
            action={<Button size="sm" onClick={() => navigate('/app/payments/new')} className="bg-[#35D6C0] font-medium text-[#062A26]">Create payment</Button>}
          />
        }
        columns={[
          { key: 'ref', header: 'Reference', render: (p) => (
            <button className="text-left" onClick={() => navigate(`/app/payments/${p.id}`)}>
              <div className="font-mono text-xs text-[#35D6C0] hover:underline">{p.reference}</div>
              <div className="mt-0.5 text-[10px] text-dim">{p.source}{p.providerTransferId ? ' · routed' : ''}</div>
            </button>
          ) },
          { key: 'recipient', header: 'Recipient', render: (p) => (
            <div>
              <div className="text-xs text-secondary">{p.recipientName ?? 'Unregistered'}</div>
              <div className="font-mono text-[10px] text-dim">{shortAddress(p.destination, 4)}</div>
            </div>
          ) },
          { key: 'amount', header: 'Amount', render: (p) => <Amount base={p.amountBaseUnits} decimals={p.decimals} symbol={p.mintSymbol} className="text-xs" /> },
          { key: 'wallet', header: 'Wallet', render: (p) => <span className="text-xs text-dim">{p.walletLabel ?? '—'}</span> },
          { key: 'need', header: 'Approvals', render: (p) => <span className="text-xs text-dim">{p.approvalsRequired} required</span> },
          { key: 'when', header: 'Created', render: (p) => <span className="text-xs text-dim">{timeAgo(p.createdAt)}</span> },
          { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} label={p.statusReason === 'PROVIDER_SETUP_REQUIRED' ? 'Setup required' : undefined} /> },
        ]}
      />
    </div>
  )
}
