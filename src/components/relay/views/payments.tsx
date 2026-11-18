'use client'

import { useEffect, useRef, useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo, shortAddress } from '@/lib/client/format'
import { PageHeader, StatusBadge, EmptyState, ErrorState, DataTable, Amount } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send, Layers, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { haptic } from '@/lib/client/motion'

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

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(value), delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, delay])
  return debounced
}

export function PaymentsView() {
  const { navigate } = useRouter()
  const [status, setStatus] = useState('ALL')
  const [q, setQ] = useState('')
  const [walletId, setWalletId] = useState('ALL')
  const [requestedPage, setPageRaw] = useState(1)
  const debouncedQ = useDebouncedValue(q, 300)
  const PAGE_SIZE = 50
  const wallets = useApi<{ wallets: { id: string; label: string; revokedAt: string | null }[] }>(['wallets-filter'], '/api/wallets')
  const payments = useApi<{ payments: PaymentRow[]; total: number }>(
    ['payments', status, debouncedQ, walletId, requestedPage],
    `/api/payments?status=${status}&q=${encodeURIComponent(debouncedQ)}&walletId=${walletId === 'ALL' ? '' : walletId}&page=${requestedPage}&pageSize=${PAGE_SIZE}`,
  )
  const total = payments.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // Derived clamp: shrinking filters pull the view back to page 1 without an
  // effect-driven cascading render — the query key simply uses the clamped page.
  const page = Math.max(1, Math.min(requestedPage, pageCount))
  function setPage(next: number) {
    setPageRaw(Math.max(1, Math.min(next, pageCount)))
  }

  function exportCsv() {
    haptic('select')
    toast.promise(
      api<{ id: string; rowCount: number; csv: string }>('/api/exports', { json: { kind: 'PAYMENTS', days: 90 } }).then((res) => {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `azimara-payments-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return res
      }),
      { loading: 'Building payments CSV…', success: (res) => `Exported ${res.rowCount} rows (last 90 days)`, error: (e) => e instanceof Error ? e.message : 'Export failed' },
    )
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Every payment operation with its full lifecycle state. Sources: app, AI proposals (converted), API and schedules."
        breadcrumb={['Relay', 'Payments']}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} className="border-[#1D2E42] text-xs"><Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV</Button>
            <Button variant="outline" onClick={() => navigate('/app/batches')} className="border-[#1D2E42] text-xs"><Layers className="mr-1.5 h-3.5 w-3.5" /> Batch builder</Button>
            <Button onClick={() => navigate('/app/payments/new')} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90"><Send className="mr-1.5 h-4 w-4" /> New payment</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search reference, destination, reason…" value={q} onChange={(e) => { setQ(e.target.value); setPageRaw(1) }} className="w-full border-[#1D2E42] bg-[#0D1622] sm:w-64" />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPageRaw(1) }}>
          <SelectTrigger className="w-52 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
          <SelectContent className="border-[#1D2E42] bg-[#142436]">
            {STATUS_GROUPS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={walletId} onValueChange={(v) => { setWalletId(v); setPageRaw(1) }}>
          <SelectTrigger className="w-44 border-[#1D2E42] bg-[#0D1622]" aria-label="Filter by source wallet"><SelectValue /></SelectTrigger>
          <SelectContent className="border-[#1D2E42] bg-[#142436]">
            <SelectItem value="ALL">All wallets</SelectItem>
            {(wallets.data?.wallets ?? []).filter((w) => !w.revokedAt).map((w) => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3 self-center text-xs text-dim">
          <span>{total} payment{total === 1 ? '' : 's'}</span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 justify-center p-0" disabled={page <= 1} onClick={() => { haptic('tap'); setPage(page - 1) }} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="tabular-nums">{page} / {pageCount}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 justify-center p-0" disabled={page >= pageCount} onClick={() => { haptic('tap'); setPage(page + 1) }} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          ) : null}
        </div>
      </div>

      {payments.isError ? <ErrorState message={String(payments.error)} retry={() => payments.refetch()} /> : null}

      <DataTable
        loading={payments.isLoading}
        keyOf={(p) => p.id}
        rows={payments.data?.payments ?? []}
        empty={
          <EmptyState
            icon={<Send className="h-8 w-8" />}
            title="No payments found"
            description="Create a single payment or import a batch. Payments move through validation → approval → quote → wallet signature → settlement → reconciliation."
            action={<Button size="sm" onClick={() => navigate('/app/payments/new')} className="bg-[#39C6D8] font-medium text-[#04121A]">Create payment</Button>}
          />
        }
        columns={[
          { key: 'ref', header: 'Reference', render: (p) => (
            <button className="text-left" onClick={() => navigate(`/app/payments/${p.id}`)}>
              <div className="font-mono text-xs text-[#39C6D8] hover:underline">{p.reference}</div>
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
