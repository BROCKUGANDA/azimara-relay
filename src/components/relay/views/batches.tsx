'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { formatAmount, shortAddress, formatDateTime } from '@/lib/client/format'
import { PageHeader, StatusBadge, Amount, EmptyState, ErrorState, DataTable, SectionCard } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Layers, Upload, CheckCircle2, XCircle, AlertTriangle, Play, ArrowLeft } from 'lucide-react'

type PreviewRow = {
  row: number
  name: string
  address: string
  amount: string
  amountBase: string
  decimals: number
  valid: boolean
  issues: string[]
  matchedRecipient: { id: string | null; name: string; registered: boolean } | null
}

type Preview = { headers: string[]; rows: PreviewRow[]; summary: { totalRows: number; validRows: number; invalidRows: number; duplicates: number; totalBaseUnits: string; decimals: number } }

type BatchRow = { id: string; name: string; reference: string; status: string; mint: string; mintSymbol: string; totalBaseUnits: string; decimals: number; itemCount: number; walletLabel: string; failurePolicy: string; createdAt: string }

type BatchDetail = {
  batch: { id: string; name: string; reference: string; status: string; mint: string; mintSymbol: string; decimals: number; totalBaseUnits: string; itemCount: number; failurePolicy: string; wallet: { label: string; address: string; network: string } }
  items: { id: string; row: number; recipientName: string; address: string; amountBaseUnits: string; decimals: number; status: string; error: string | null; payment: { id: string; reference: string; status: string } | null }[]
}

const TEMPLATE = 'name,address,amount\nAcme Contributors,9xQeWvG816bUx9EPjHmaTprYpRxpVkYnTdC8kP7d2wTE,1250.50\nLab Services LLC,4Nd1mBQtrMJVYVfKf2PJy9NZBCZd2ZQhRZk3Z5nL6dWx,892.25'

export function BatchesView({ initialBatchId }: { initialBatchId?: string }) {
  const { navigate } = useRouter()
  const [selected, setSelected] = useState<string | null>(initialBatchId ?? null)
  const batches = useApi<{ batches: BatchRow[] }>(['batches'], '/api/batches')
  const detail = useApi<BatchDetail>(selected ? ['batch', selected] : ['batch', 'none'], selected ? `/api/batches/${selected}/actions`.replace('/actions', '') : '/api/batches', { enabled: !!selected })
  const [buildOpen, setBuildOpen] = useState(false)

  if (selected && detail.data) {
    return <BatchDetailPanel detail={detail.data} batchId={selected} onBack={() => { setSelected(null); batches.refetch() }} onChanged={() => detail.refetch()} navigate={navigate} />
  }

  return (
    <div>
      <PageHeader
        title="Batch payouts"
        description="The platform's core differentiator: CSV import, per-row validation, exact-integer allocations, error isolation and independently tracked items."
        breadcrumb={['Relay', 'Payments', 'Batch payouts']}
        actions={
          <Dialog open={buildOpen} onOpenChange={setBuildOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90"><Layers className="mr-1.5 h-4 w-4" /> New batch</Button>
            </DialogTrigger>
            <DialogContent className="border-[#26374C] bg-[#0E1725] sm:max-w-3xl">
              <DialogHeader><DialogTitle>Batch payment builder</DialogTitle></DialogHeader>
              <BatchBuilder onClose={(id) => { setBuildOpen(false); if (id) setSelected(id) }} />
            </DialogContent>
          </Dialog>
        }
      />

      {batches.isError ? <ErrorState message={String(batches.error)} retry={() => batches.refetch()} /> : null}

      <DataTable
        keyOf={(b) => b.id}
        rows={batches.data?.batches ?? []}
        empty={
          <EmptyState
            icon={<Layers className="h-8 w-8" />}
            title="No batches yet"
            description="Import a CSV of recipients and amounts; Relay validates every row before anything is submitted."
            action={<Button size="sm" onClick={() => setBuildOpen(true)} className="bg-[#35D6C0] font-medium text-[#062A26]">Build a batch</Button>}
          />
        }
        columns={[
          { key: 'ref', header: 'Reference', render: (b) => <button className="font-mono text-xs text-[#35D6C0] hover:underline" onClick={() => setSelected(b.id)}>{b.reference}</button> },
          { key: 'name', header: 'Batch', render: (b) => <span className="text-xs text-secondary">{b.name}</span> },
          { key: 'mint', header: 'Asset', render: (b) => <span className="text-xs">{b.mintSymbol}</span> },
          { key: 'total', header: 'Total', render: (b) => <Amount base={b.totalBaseUnits} decimals={b.decimals} symbol={b.mintSymbol} className="text-xs" /> },
          { key: 'items', header: 'Items', render: (b) => <span className="text-xs text-dim">{b.itemCount}</span> },
          { key: 'when', header: 'Created', render: (b) => <span className="text-xs text-dim">{formatDateTime(b.createdAt)}</span> },
          { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
        ]}
      />
    </div>
  )
}

function BatchBuilder({ onClose }: { onClose: (id?: string) => void }) {
  const wallets = useApi<{ wallets: { id: string; label: string; address: string; ownershipStatus: string; network: string }[] }>(['wallets'], '/api/wallets')
  const assets = useApi<{ assets: { mint: string; symbol: string; decimals: number; providerEligible: boolean }[] }>(['assets'], '/api/assets')
  const [name, setName] = useState('')
  const [walletId, setWalletId] = useState('')
  const [mint, setMint] = useState('')
  const [failurePolicy, setFailurePolicy] = useState<'ISOLATE' | 'HALT'>('ISOLATE')
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useState<HTMLInputElement | null>(null)

  const verifiedWallets = (wallets.data?.wallets ?? []).filter((w) => w.ownershipStatus === 'VERIFIED')
  const asset = assets.data?.assets.find((a) => a.mint === mint)

  async function runPreview() {
    if (!mint) return toast.error('Select an asset first')
    setBusy(true)
    try {
      const res = await api<Preview>('/api/batches/preview', { json: { csv, mint } })
      setPreview(res)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (!preview) return
    const items = preview.rows.filter((r) => r.valid).map((r) => ({ recipientName: r.name, address: r.address, amount: r.amount }))
    setBusy(true)
    try {
      const res = await api<{ id: string; reference: string; validCount: number; invalidCount: number; totalBaseUnits: string }>('/api/batches', {
        json: { name, sourceWalletId: walletId, mint, failurePolicy, items },
      })
      toast.success(`Batch ${res.reference} created: ${res.validCount} valid items${res.invalidCount ? `, ${res.invalidCount} isolated` : ''}`)
      onClose(res.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Batch creation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Batch name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="March contributor payouts" className="mt-1 border-[#26374C] bg-[#0B1220]" />
        </div>
        <div>
          <Label>Source wallet (verified)</Label>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger className="mt-1 border-[#26374C] bg-[#0B1220]"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="border-[#26374C] bg-[#142135]">
              {verifiedWallets.map((w) => <SelectItem key={w.id} value={w.id}>{w.label} · {w.network}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Asset</Label>
          <Select value={mint} onValueChange={(v) => { setMint(v); setPreview(null) }}>
            <SelectTrigger className="mt-1 border-[#26374C] bg-[#0B1220]"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="border-[#26374C] bg-[#142135]">
              {(assets.data?.assets ?? []).filter((a) => a.mint !== 'native:SOL').map((a) => <SelectItem key={a.mint} value={a.mint}>{a.symbol}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Recipients CSV</Label>
          <button className="text-[11px] text-[#35D6C0] hover:underline" onClick={() => setCsv(TEMPLATE)}>Insert template</button>
        </div>
        <textarea
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setPreview(null) }}
          rows={6}
          className="mt-1 w-full rounded-lg border border-[#26374C] bg-[#0B1220] p-3 font-mono text-xs text-secondary"
          placeholder={TEMPLATE}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={runPreview} disabled={busy || !csv.trim() || !mint} variant="outline" className="border-[#26374C]"><Upload className="mr-1.5 h-3.5 w-3.5" /> Validate rows</Button>
        <Select value={failurePolicy} onValueChange={(v) => setFailurePolicy(v as 'ISOLATE' | 'HALT')}>
          <SelectTrigger className="w-56 border-[#26374C] bg-[#0B1220]"><SelectValue /></SelectTrigger>
          <SelectContent className="border-[#26374C] bg-[#142135]">
            <SelectItem value="ISOLATE">Error isolation — keep valid rows</SelectItem>
            <SelectItem value="HALT">Halt — reject batch on any invalid row</SelectItem>
          </SelectContent>
        </Select>
        <p className="ml-auto text-[11px] text-dim">Provider limit: 20 destinations per transfer route</p>
      </div>

      {preview ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-[#36C995]"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{preview.summary.validRows} valid</span>
            {preview.summary.invalidRows > 0 ? <span className="text-[#F27683]"><XCircle className="mr-1 inline h-3.5 w-3.5" />{preview.summary.invalidRows} invalid</span> : null}
            {preview.summary.duplicates > 0 ? <span className="text-[#F2BB62]"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{preview.summary.duplicates} duplicates</span> : null}
            <span className="ml-auto text-dim">Total principal: <strong className="font-mono tabular-nums text-[#35D6C0]">{formatAmount(preview.summary.totalBaseUnits, preview.summary.decimals, asset?.symbol)}</strong></span>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-[#26374C]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#0B1220]">
                <tr className="text-left text-dim">
                  <th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Address</th><th className="px-2 py-1.5 text-right">Amount</th><th className="px-2 py-1.5">Checks</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} className={`border-t border-[#1A293D] ${r.valid ? '' : 'bg-[#F27683]/5'}`}>
                    <td className="px-2 py-1.5 text-dim">{r.row}</td>
                    <td className="px-2 py-1.5">{r.name || <span className="text-[#F27683]">missing</span>}{r.matchedRecipient?.registered ? <span className="ml-1 rounded bg-[#36C995]/10 px-1 text-[9px] text-[#36C995]">registered</span> : <span className="ml-1 rounded bg-[#F2BB62]/10 px-1 text-[9px] text-[#F2BB62]">new</span>}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-dim">{shortAddress(r.address, 4)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{r.amount}</td>
                    <td className="px-2 py-1.5">
                      {r.valid ? <span className="text-[#36C995]">OK</span> : <span className="text-[#F27683]">{r.issues.join('; ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={create} disabled={busy || preview.summary.validRows === 0 || !name || !walletId} className="mt-3 w-full bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
            <Layers className="mr-1.5 h-4 w-4" /> Create batch with {preview.summary.validRows} items
          </Button>
          <p className="mt-2 text-[11px] text-dim">Creating a batch validates again server-side, then enters the approval flow. Execution creates one real payment per item through the normal pipeline — approvals still apply.</p>
        </div>
      ) : null}
    </div>
  )
}

function BatchDetailPanel({ detail, batchId, onBack, onChanged, navigate }: { detail: BatchDetail; batchId: string; onBack: () => void; onChanged: () => void; navigate: (to: string) => void }) {
  const [busy, setBusy] = useState(false)
  const b = detail.batch

  async function run(action: 'validate' | 'execute') {
    setBusy(true)
    try {
      const res = await api<{ created?: { reference: string }[]; failed?: unknown[]; batchStatus?: string }>(`/api/batches/${batchId}/actions`, { json: { action } })
      if (action === 'execute') {
        toast.success(`Batch executed: ${res.created?.length ?? 0} payments created${res.failed?.length ? `, ${res.failed.length} failed` : ''}`)
      } else {
        toast.success('Batch revalidated')
      }
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-2">
        <Button variant="ghost" size="sm" className="text-xs text-dim" onClick={onBack}><ArrowLeft className="mr-1 h-3 w-3" /> All batches</Button>
      </div>
      <PageHeader
        title={`Batch ${b.reference}`}
        description={b.name}
        breadcrumb={['Relay', 'Payments', 'Batches', b.reference]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={b.status} />
            {['DRAFT', 'AWAITING_APPROVAL'].includes(b.status) ? (
              <>
                <Button size="sm" variant="outline" onClick={() => run('validate')} disabled={busy} className="border-[#26374C]">Revalidate</Button>
                <Button size="sm" onClick={() => run('execute')} disabled={busy} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90"><Play className="mr-1.5 h-3.5 w-3.5" /> Create payments</Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
          <div className="text-[10px] uppercase tracking-wide text-dim">Total principal</div>
          <Amount base={b.totalBaseUnits} decimals={b.decimals} symbol={b.mintSymbol} className="mt-1 text-lg text-[#35D6C0]" />
        </div>
        <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
          <div className="text-[10px] uppercase tracking-wide text-dim">Items</div>
          <div className="mt-1 text-lg tabular-nums">{b.itemCount}</div>
        </div>
        <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
          <div className="text-[10px] uppercase tracking-wide text-dim">Source wallet</div>
          <div className="mt-1 text-sm">{b.wallet.label} <span className="font-mono text-[10px] text-dim">{shortAddress(b.wallet.address, 4)}</span></div>
        </div>
        <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
          <div className="text-[10px] uppercase tracking-wide text-dim">Failure policy</div>
          <div className="mt-1 text-sm">{b.failurePolicy === 'ISOLATE' ? 'Isolate errors' : 'Halt on error'}</div>
        </div>
      </div>

      <SectionCard className="mt-5" title="Items" description="Each row is independently tracked. Per-item payment records carry their own lifecycle.">
        <DataTable
          keyOf={(i) => i.id}
          rows={detail.items}
          columns={[
            { key: 'row', header: '#', render: (i) => <span className="text-xs text-dim">{i.row + 1}</span> },
            { key: 'name', header: 'Recipient', render: (i) => <span className="text-xs">{i.recipientName}</span> },
            { key: 'addr', header: 'Address', render: (i) => <span className="font-mono text-[10px] text-dim">{shortAddress(i.address, 4)}</span> },
            { key: 'amt', header: 'Amount', render: (i) => <Amount base={i.amountBaseUnits} decimals={i.decimals} symbol={b.mintSymbol} className="text-xs" /> },
            { key: 'pay', header: 'Payment', render: (i) => i.payment ? <button className="font-mono text-xs text-[#35D6C0] hover:underline" onClick={() => navigate(`/app/payments/${i.payment!.id}`)}>{i.payment.reference}</button> : <span className="text-xs text-dim">—</span> },
            { key: 'err', header: 'Detail', render: (i) => <span className="text-[11px] text-[#F27683]">{i.error ?? ''}</span> },
            { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status === 'VALID' ? 'QUOTED' : i.status === 'INVALID' ? 'FAILED' : i.status === 'PAYMENT_CREATED' ? 'APPROVED' : i.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING_APPROVAL'} label={i.status.replaceAll('_', ' ')} /> },
          ]}
        />
      </SectionCard>
    </div>
  )
}
