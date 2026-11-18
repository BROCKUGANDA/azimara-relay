'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { PageHeader, EmptyState, ErrorState, DataTable, Amount, StatusBadge } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatAmount, formatDateTime } from '@/lib/client/format'
import { toast } from 'sonner'
import { CalendarClock, Plus, Pause, Play, XCircle, Pencil, FastForward } from 'lucide-react'

type ScheduleRow = { id: string; name: string; recurrence: string; status: string; mintSymbol: string; decimals: number; amountBaseUnits: string; recipientName: string; walletLabel: string; nextRunAt: string; lastRunAt: string | null; autoApprove: boolean }

export function SchedulesView() {
  const schedules = useApi<{ schedules: ScheduleRow[] }>(['schedules'], '/api/schedules')
  const wallets = useApi<{ wallets: { id: string; label: string; ownershipStatus: string }[] }>(['wallets'], '/api/wallets')
  const recipients = useApi<{ recipients: { id: string; name: string; address: string }[] }>(['recipients-schedules'], '/api/recipients?status=ACTIVE&pageSize=100')
  const assets = useApi<{ assets: { mint: string; symbol: string; decimals: number }[] }>(['assets'], '/api/assets')

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', walletId: '', recipientId: '', mint: '', amount: '', recurrence: 'MONTHLY', firstRunAt: '' })
  const [busy, setBusy] = useState(false)
  // Edit flow: the schedule being edited + a pre-filled editable form.
  const [editing, setEditing] = useState<ScheduleRow | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', recipientId: '', amount: '', recurrence: 'MONTHLY', nextRunAt: '' })

  function openEdit(s: ScheduleRow) {
    setEditing(s)
    setEditForm({
      name: s.name,
      recipientId: '',
      amount: formatAmount(s.amountBaseUnits, s.decimals).replace(/[^0-9.]/g, ''),
      recurrence: s.recurrence,
      nextRunAt: '',
    })
  }

  async function saveEdit() {
    if (!editing) return
    if (!editForm.name.trim()) return toast.error('Name is required')
    if (!editForm.amount || Number(editForm.amount) <= 0) return toast.error('Amount must be greater than zero')
    if (editForm.nextRunAt && Number.isNaN(new Date(editForm.nextRunAt).getTime())) return toast.error('Enter a valid next-run date')
    setBusy(true)
    try {
      await api(`/api/schedules/${editing.id}`, {
        method: 'PATCH',
        json: {
          name: editForm.name.trim(),
          amount: editForm.amount,
          recurrence: editForm.recurrence,
          ...(editForm.recipientId ? { recipientId: editForm.recipientId } : {}),
          ...(editForm.nextRunAt ? { nextRunAt: new Date(editForm.nextRunAt).toISOString() } : {}),
        },
      })
      toast.success('Schedule updated')
      setEditing(null)
      schedules.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function runNow(s: ScheduleRow) {
    try {
      await api(`/api/schedules/${s.id}`, { method: 'PATCH', json: { nextRunAt: new Date().toISOString() } })
      toast.success('Prepared to run now — the worker picks it up and the approval policy still applies')
      schedules.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function setStatus(id: string, status: 'ACTIVE' | 'PAUSED' | 'CANCELLED') {
    try {
      await api(`/api/schedules/${id}`, { method: 'PATCH', json: { status } })
      toast.success(`Schedule ${status.toLowerCase()}`)
      schedules.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function create() {
    if (form.firstRunAt && Number.isNaN(new Date(form.firstRunAt).getTime())) {
      toast.error('Enter a valid first run date')
      return
    }
    setBusy(true)
    try {
      await api('/api/schedules', {
        json: {
          name: form.name,
          walletId: form.walletId,
          recipientId: form.recipientId,
          mint: form.mint,
          amount: form.amount,
          recurrence: form.recurrence,
          firstRunAt: new Date(form.firstRunAt || Date.now() + 86400_000).toISOString(),
        },
      })
      toast.success('Schedule created — runs always pass through the approval policy engine')
      setOpen(false)
      schedules.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Schedule creation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Scheduled payments"
        description="Recurring obligations prepared on schedule. Every run creates a real payment through validation and policy — schedules never bypass approvals."
        breadcrumb={['Relay', 'Payments', 'Schedules']}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90"><Plus className="mr-1.5 h-4 w-4" /> New schedule</Button></DialogTrigger>
            <DialogContent aria-describedby={undefined} className="border-[#1D2E42] bg-[#101C2C]">
              <DialogHeader><DialogTitle>Create schedule</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly contractor retainer" className="mt-1 border-[#1D2E42] bg-[#0D1622]" /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Source wallet</Label>
                    <Select value={form.walletId} onValueChange={(v) => setForm({ ...form, walletId: v })}>
                      <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue placeholder="Verified wallet" /></SelectTrigger>
                      <SelectContent className="border-[#1D2E42] bg-[#142436]">
                        {(wallets.data?.wallets ?? []).filter((w) => w.ownershipStatus === 'VERIFIED').map((w) => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Recipient</Label>
                    <Select value={form.recipientId} onValueChange={(v) => setForm({ ...form, recipientId: v })}>
                      <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue placeholder="Active recipient" /></SelectTrigger>
                      <SelectContent className="border-[#1D2E42] bg-[#142436]">
                        {(recipients.data?.recipients ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Asset</Label>
                    <Select value={form.mint} onValueChange={(v) => setForm({ ...form, mint: v })}>
                      <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent className="border-[#1D2E42] bg-[#142436]">
                        {(assets.data?.assets ?? []).filter((a) => a.mint !== 'native:SOL').map((a) => <SelectItem key={a.mint} value={a.mint}>{a.symbol}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount</Label>
                    <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })} className="mt-1 border-[#1D2E42] bg-[#0D1622] font-mono" />
                  </div>
                  <div>
                    <Label>Recurrence</Label>
                    <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                      <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#1D2E42] bg-[#142436]">
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>First run</Label>
                  <Input type="datetime-local" value={form.firstRunAt} onChange={(e) => setForm({ ...form, firstRunAt: e.target.value })} className="mt-1 border-[#1D2E42] bg-[#0D1622]" />
                </div>
                <Button onClick={create} disabled={busy || !form.name.trim() || !form.walletId || !form.recipientId || !form.mint || !form.amount} className="w-full bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">Create schedule</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {schedules.isError ? <ErrorState message={String(schedules.error)} retry={() => schedules.refetch()} /> : null}

      {/* Edit dialog (portal-free, rendered inline when a schedule is being edited) */}
      {editing ? (
        <Dialog open onOpenChange={(o) => { if (!o) setEditing(null) }}>
          <DialogContent aria-describedby={undefined} className="border-[#1D2E42] bg-[#101C2C]">
            <DialogHeader><DialogTitle>Edit schedule</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1 border-[#1D2E42] bg-[#0D1622]" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Recipient (leave as is to keep)</Label>
                  <Select value={editForm.recipientId || '__keep__'} onValueChange={(v) => setEditForm({ ...editForm, recipientId: v === '__keep__' ? '' : v })}>
                    <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#1D2E42] bg-[#142436]">
                      <SelectItem value="__keep__">Keep {editing.recipientName}</SelectItem>
                      {(recipients.data?.recipients ?? []).filter((r) => r.id !== editing.id).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Recurrence</Label>
                  <Select value={editForm.recurrence} onValueChange={(v) => setEditForm({ ...editForm, recurrence: v })}>
                    <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#1D2E42] bg-[#142436]">
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Amount ({editing.mintSymbol})</Label>
                  <Input value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value.replace(/[^0-9.]/g, '') })} className="mt-1 border-[#1D2E42] bg-[#0D1622] font-mono" />
                </div>
                <div>
                  <Label>Next run (optional — now to run immediately)</Label>
                  <Input type="datetime-local" value={editForm.nextRunAt} onChange={(e) => setEditForm({ ...editForm, nextRunAt: e.target.value })} className="mt-1 border-[#1D2E42] bg-[#0D1622]" />
                </div>
              </div>
              <p className="text-[11px] text-dim">Wallet and asset are fixed for the life of the schedule — cancel and recreate to change them. Runs always pass through the approval policy engine.</p>
              <div className="flex gap-2">
                <Button onClick={saveEdit} disabled={busy} className="flex-1 bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">Save changes</Button>
                <Button variant="outline" onClick={() => setEditing(null)} disabled={busy} className="border-[#1D2E42]">Discard</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <DataTable
        loading={schedules.isLoading}
        keyOf={(s) => s.id}
        rows={schedules.data?.schedules ?? []}
        empty={
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" />}
            title="No schedules"
            description="Recurring payments are prepared automatically and always pass through validation and approvals."
          />
        }
        columns={[
          { key: 'name', header: 'Schedule', render: (s) => <div><div className="text-sm">{s.name}</div><div className="text-[10px] text-dim">{s.recurrence.toLowerCase()}</div></div> },
          { key: 'recipient', header: 'Recipient', render: (s) => <span className="text-xs text-secondary">{s.recipientName}</span> },
          { key: 'amount', header: 'Amount', render: (s) => <Amount base={s.amountBaseUnits} decimals={s.decimals} symbol={s.mintSymbol} className="text-xs" /> },
          { key: 'wallet', header: 'Wallet', render: (s) => <span className="text-xs text-dim">{s.walletLabel}</span> },
          { key: 'next', header: 'Next run', render: (s) => <span className="text-xs text-dim">{formatDateTime(s.nextRunAt)}</span> },
          { key: 'last', header: 'Last run', render: (s) => <span className="text-xs text-dim">{s.lastRunAt ? formatDateTime(s.lastRunAt) : 'never'}</span> },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status === 'ACTIVE' ? 'PROCESSING' : s.status === 'PAUSED' ? 'QUOTE_EXPIRED' : 'CANCELLED'} label={s.status} /> },
          { key: 'act', header: '', className: 'text-right', render: (s) => (
            <div className="flex justify-end gap-1">
              {['ACTIVE', 'PAUSED'].includes(s.status) ? (
                <>
                  <Button size="sm" variant="ghost" aria-label="Edit schedule" className="h-9 w-9 justify-center text-xs text-dim" title="Edit schedule" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Run now" className="h-9 w-9 justify-center text-xs text-dim" title="Run now" onClick={() => runNow(s)}><FastForward className="h-3 w-3" /></Button>
                </>
              ) : null}
              {s.status === 'ACTIVE' ? (
                <Button size="sm" variant="ghost" aria-label="Pause schedule" className="h-9 w-9 justify-center text-xs text-dim" title="Pause schedule" onClick={() => setStatus(s.id, 'PAUSED')}><Pause className="h-3 w-3" /></Button>
              ) : s.status === 'PAUSED' ? (
                <Button size="sm" variant="ghost" aria-label="Resume schedule" className="h-9 w-9 justify-center text-xs text-dim" title="Resume schedule" onClick={() => setStatus(s.id, 'ACTIVE')}><Play className="h-3 w-3" /></Button>
              ) : null}
              {s.status !== 'CANCELLED' ? (
                cancelConfirm === s.id ? (
                  <>
                    <Button size="sm" variant="destructive" className="h-9 px-2 text-[11px]" disabled={busy} onClick={async () => { await setStatus(s.id, 'CANCELLED'); setCancelConfirm(null) }}>Confirm</Button>
                    <Button size="sm" variant="ghost" className="h-9 px-2 text-[11px] text-dim" onClick={() => setCancelConfirm(null)}>Keep</Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" aria-label="Cancel schedule" className="h-9 w-9 justify-center text-xs text-[#F27683]" title="Cancel schedule" onClick={() => setCancelConfirm(s.id)}><XCircle className="h-3 w-3" /></Button>
                )
              ) : null}
            </div>
          ) },
        ]}
      />
    </div>
  )
}
