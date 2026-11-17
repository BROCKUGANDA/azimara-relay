'use client'

import { useEffect, useRef, useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo, shortAddress } from '@/lib/client/format'
import { PageHeader, StatusBadge, EmptyState, ErrorState, DataTable, SectionCard } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Users, Upload, Download, Pencil, Archive } from 'lucide-react'

type RecipientRow = {
  id: string
  name: string
  address: string
  reference: string | null
  category: string | null
  notes: string | null
  status: string
  verificationStatus: string
  groupName: string | null
  lastPaymentAt: string | null
  createdAt: string
}

const EMPTY_FORM = { name: '', address: '', reference: '', category: 'VENDOR', notes: '' }

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

export function RecipientsView() {
  const { navigate } = useRouter()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const debouncedQ = useDebouncedValue(q, 300)
  const recipients = useApi<{ recipients: RecipientRow[]; total: number }>(['recipients', debouncedQ, status], `/api/recipients?q=${encodeURIComponent(debouncedQ)}&status=${status}`)
  const [addOpen, setAddOpen] = useState(false)
  const [editRecipient, setEditRecipient] = useState<RecipientRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; failed: number; results: { row: number; name: string; status: string; error?: string }[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function openEdit(r: RecipientRow) {
    setEditRecipient(r)
    setForm({ name: r.name, address: r.address, reference: r.reference ?? '', category: r.category ?? 'OTHER', notes: r.notes ?? '' })
  }

  async function save() {
    setBusy(true)
    try {
      if (editRecipient) {
        await api(`/api/recipients/${editRecipient.id}`, { method: 'PATCH', json: form })
        toast.success('Recipient updated')
        setEditRecipient(null)
      } else {
        await api('/api/recipients', { json: form })
        toast.success('Recipient added')
        setAddOpen(false)
      }
      setForm(EMPTY_FORM)
      recipients.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function archive(r: RecipientRow) {
    if (!window.confirm(`Archive "${r.name}"? History is retained.`)) return
    try {
      await api(`/api/recipients/${r.id}`, { method: 'DELETE' })
      toast.success('Recipient archived')
      recipients.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function importCsv(text: string) {
    setBusy(true)
    try {
      const res = await api<{ created: number; skipped: number; failed: number; results: { row: number; name: string; status: string; error?: string }[] }>('/api/recipients/import', { json: { csv: text, mode: 'SKIP_DUPLICATES' } })
      setImportResult(res)
      toast.success(`Imported ${res.created}, skipped ${res.skipped}, failed ${res.failed}`)
      recipients.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Recipient directory"
        description="Approved payment destinations with validation, duplicate prevention and full change history."
        breadcrumb={['Relay', 'Recipients']}
        actions={
          <>
            <Button variant="outline" className="border-[#26374C] text-xs" onClick={() => setImportOpen(true)}><Upload className="mr-1.5 h-3.5 w-3.5" /> Import CSV</Button>
            <a href="/api/recipients/export" download className="inline-flex h-9 items-center rounded-md border border-[#26374C] px-3 text-xs text-secondary hover:bg-[#142135]"><Download className="mr-1.5 h-3.5 w-3.5" /> Export</a>
            <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setForm(EMPTY_FORM) }}>
              <DialogTrigger asChild>
                <Button className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90"><Users className="mr-1.5 h-4 w-4" /> Add recipient</Button>
              </DialogTrigger>
              <DialogContent className="border-[#26374C] bg-[#0E1725]">
                <DialogHeader><DialogTitle>Add recipient</DialogTitle></DialogHeader>
                <RecipientForm form={form} setForm={setForm} busy={busy} onSave={save} saveLabel="Add recipient" />
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search name, address, reference…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full border-[#26374C] bg-[#0B1220] sm:w-64" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40 border-[#26374C] bg-[#0B1220]"><SelectValue /></SelectTrigger>
          <SelectContent className="border-[#26374C] bg-[#142135]">
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DISABLED">Disabled</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {recipients.isError ? <ErrorState message={String(recipients.error)} retry={() => recipients.refetch()} /> : null}

      <DataTable
        keyOf={(r) => r.id}
        rows={recipients.data?.recipients ?? []}
        empty={
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No recipients yet"
            description="Add recipients manually or import a CSV. Every address is validated and checked for duplicates."
            action={<Button size="sm" onClick={() => setAddOpen(true)} className="bg-[#35D6C0] font-medium text-[#062A26]">Add first recipient</Button>}
          />
        }
        columns={[
          { key: 'name', header: 'Recipient', render: (r) => (
            <div>
              <div className="text-sm font-medium">{r.name}</div>
              <div className="font-mono text-[11px] text-dim">{shortAddress(r.address, 6)}</div>
            </div>
          ) },
          { key: 'cat', header: 'Category', render: (r) => <span className="text-xs text-secondary">{r.category ?? '—'}</span> },
          { key: 'ref', header: 'Reference', render: (r) => <span className="text-xs text-dim">{r.reference ?? '—'}</span> },
          { key: 'last', header: 'Last payment', render: (r) => <span className="text-xs text-dim">{r.lastPaymentAt ? timeAgo(r.lastPaymentAt) : 'never'}</span> },
          { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status === 'ACTIVE' ? 'COMPLETED' : r.status === 'DISABLED' ? 'QUOTE_EXPIRED' : 'CANCELLED'} label={r.status} /> },
          { key: 'act', header: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" aria-label="Edit recipient" className="h-9 w-9 justify-center text-xs text-dim" title="Edit recipient" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" aria-label="Archive recipient" className="h-9 w-9 justify-center text-xs text-[#F27683]" title="Archive recipient" onClick={() => archive(r)}><Archive className="h-3 w-3" /></Button>
            </div>
          ) },
        ]}
      />

      {/* Edit dialog */}
      <Dialog open={!!editRecipient} onOpenChange={(o) => { if (!o) setEditRecipient(null) }}>
        <DialogContent className="border-[#26374C] bg-[#0E1725]">
          <DialogHeader><DialogTitle>Edit recipient</DialogTitle></DialogHeader>
          <RecipientForm form={form} setForm={setForm} busy={busy} onSave={save} saveLabel="Save changes" editMode />
          <p className="text-[11px] text-[#F2BB62]">Changing a recipient&apos;s address invalidates pending approvals and forces a new review — recorded in the change history.</p>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportResult(null) }}>
        <DialogContent className="border-[#26374C] bg-[#0E1725] sm:max-w-2xl">
          <DialogHeader><DialogTitle>Import recipients from CSV</DialogTitle></DialogHeader>
          <p className="text-xs text-dim">Columns: <code className="font-mono text-[#35D6C0]">name</code>, <code className="font-mono text-[#35D6C0]">address</code>, optional <code className="font-mono">category, reference, notes</code>. Duplicates are skipped with reasons.</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (file.size > 2_000_000) {
                toast.error('CSV must be under 2 MB')
                return
              }
              importCsv(await file.text())
            }}
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 border-[#26374C]" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="mr-1.5 h-3.5 w-3.5" /> Choose file</Button>
          </div>
          {importResult ? (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
              <div className="mb-2 text-xs"><span className="text-[#36C995]">{importResult.created} created</span> · <span className="text-[#F2BB62]">{importResult.skipped} skipped</span> · <span className="text-[#F27683]">{importResult.failed} failed</span></div>
              {importResult.results.filter((r) => r.status !== 'CREATED').slice(0, 20).map((r, i) => (
                <div key={i} className="text-[11px] text-dim">Row {r.row}: {r.name} — {r.status.replace('_', ' ')}{r.error ? ` (${r.error})` : ''}</div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RecipientForm({ form, setForm, busy, onSave, saveLabel, editMode }: {
  form: { name: string; address: string; reference: string; category: string; notes: string }
  setForm: (f: { name: string; address: string; reference: string; category: string; notes: string }) => void
  busy: boolean
  onSave: () => void
  saveLabel: string
  editMode?: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Legal or display name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 border-[#26374C] bg-[#0B1220]" placeholder="Contributor name / company" />
      </div>
      <div>
        <Label>Solana wallet address</Label>
        <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={`mt-1 border-[#26374C] bg-[#0B1220] font-mono text-xs ${editMode ? 'border-[#F2BB62]/40' : ''}`} placeholder="Base58 public key" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="mt-1 border-[#26374C] bg-[#0B1220]"><SelectValue /></SelectTrigger>
            <SelectContent className="border-[#26374C] bg-[#142135]">
              {['CONTRACTOR', 'VENDOR', 'CONTRIBUTOR', 'AFFILIATE', 'ROYALTIES', 'OTHER'].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Reference (optional)</Label>
          <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="mt-1 border-[#26374C] bg-[#0B1220]" placeholder="PO / contract #" />
        </div>
      </div>
      <div>
        <Label>Internal notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-1 border-[#26374C] bg-[#0B1220]" />
      </div>
      <Button onClick={onSave} disabled={busy || !form.name.trim() || !form.address.trim()} className="w-full bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">{saveLabel}</Button>
    </div>
  )
}

void SectionCard
