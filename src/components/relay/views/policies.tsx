'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { PageHeader, EmptyState, ErrorState, SectionCard } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, ShieldCheck, History } from 'lucide-react'

type PolicyRow = { id: string; name: string; version: number; active: boolean; rules: { id: string; description: string; condition: Record<string, unknown>; approversRequired: number }[]; createdAt: string }

const AMOUNT_PRESETS = [
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
]

export function PoliciesView() {
  const policies = useApi<{ policies: PolicyRow[]; defaults: { id: string; description: string }[] }>(['policies'], '/api/policies')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [ruleType, setRuleType] = useState<'AMOUNT_GTE' | 'AMOUNT_LT' | 'NEW_RECIPIENT' | 'ALWAYS'>('AMOUNT_GTE')
  const [amount, setAmount] = useState('1000')
  const [withinDays, setWithinDays] = useState('7')
  const [approvers, setApprovers] = useState('2')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const active = policies.data?.policies.find((p) => p.active)
  const amountValid = (() => {
    const a = amount.trim()
    if (a === '' || a === '.') return false
    if (!/^\d*(\.\d*)?$/.test(a)) return false
    const [, f = ''] = a.split('.')
    return f.length <= AMOUNT_PRESETS[0].decimals
  })()

  async function createPolicy() {
    const usdc = AMOUNT_PRESETS[0]
    const baseAmount = (() => {
      const a = amount.trim()
      if (!/^\d*(\.\d*)?$/.test(a)) return null
      const [w, f = ''] = a.split('.')
      return `${w || '0'}${(f + '0'.repeat(usdc.decimals)).slice(0, usdc.decimals)}`.replace(/^0+(?=\d)/, '') || '0'
    })()
    const newRecipientDays = Math.max(1, Math.floor(Number(withinDays) || 0))
    const rule = ruleType === 'AMOUNT_GTE'
      ? { id: `gte-${Date.now()}`, description: description || `Payments of ${amount}+ ${usdc.symbol} require ${approvers} approvers`, condition: { field: 'AMOUNT_GTE', mint: usdc.mint, amountBaseUnits: baseAmount }, approversRequired: Number(approvers) }
      : ruleType === 'AMOUNT_LT'
        ? { id: `lt-${Date.now()}`, description: description || `Payments under ${amount} ${usdc.symbol} require ${approvers} approver`, condition: { field: 'AMOUNT_LT', mint: usdc.mint, amountBaseUnits: baseAmount }, approversRequired: Number(approvers) }
        : ruleType === 'NEW_RECIPIENT'
          ? { id: `new-${Date.now()}`, description: description || `Recipients registered within ${newRecipientDays} days require ${approvers} approvers`, condition: { field: 'NEW_RECIPIENT', withinDays: newRecipientDays }, approversRequired: Number(approvers) }
          : { id: `always-${Date.now()}`, description: description || `All payments require ${approvers} approver`, condition: { field: 'ALWAYS' }, approversRequired: Number(approvers) }

    const rules = [...(active?.rules ?? []).map((r) => ({ ...r, condition: r.condition as never })), rule]
    setBusy(true)
    try {
      await api('/api/policies', { json: { name: name || `Policy v${(policies.data?.policies.length ?? 0) + 1}`, rules } })
      toast.success('New policy version created — pending payments stay bound to their original policy')
      setOpen(false)
      policies.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Policy creation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Approval policies"
        description="Deterministic rules evaluated in code. New versions never retroactively reuse approvals issued under a previous policy."
        breadcrumb={['Relay', 'Payments', 'Approval policies']}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90"><Plus className="mr-1.5 h-4 w-4" /> New rule version</Button></DialogTrigger>
            <DialogContent className="border-[#26374C] bg-[#0E1725]">
              <DialogHeader><DialogTitle>Add rule (creates a new version)</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Policy name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Treasury policy" className="mt-1 border-[#26374C] bg-[#0B1220]" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Condition</Label>
                    <Select value={ruleType} onValueChange={(v) => setRuleType(v as typeof ruleType)}>
                      <SelectTrigger className="mt-1 w-full border-[#26374C] bg-[#0B1220]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#26374C] bg-[#142135]">
                        <SelectItem value="AMOUNT_GTE">Amount ≥ threshold</SelectItem>
                        <SelectItem value="AMOUNT_LT">Amount &lt; threshold</SelectItem>
                        <SelectItem value="NEW_RECIPIENT">New recipient (within N days)</SelectItem>
                        <SelectItem value="ALWAYS">Every payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Approvers required</Label>
                    <Select value={approvers} onValueChange={setApprovers}>
                      <SelectTrigger className="mt-1 w-full border-[#26374C] bg-[#0B1220]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#26374C] bg-[#142135]">
                        {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {ruleType.startsWith('AMOUNT') ? (
                  <div>
                    <Label>Threshold (USDC)</Label>
                    <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="mt-1 border-[#26374C] bg-[#0B1220] font-mono" />
                  </div>
                ) : ruleType === 'NEW_RECIPIENT' ? (
                  <div>
                    <Label>Recipient age (days)</Label>
                    <Input value={withinDays} onChange={(e) => setWithinDays(e.target.value.replace(/[^0-9]/g, ''))} className="mt-1 border-[#26374C] bg-[#0B1220] font-mono" />
                  </div>
                ) : null}
                <div>
                  <Label>Description (shown as approval evidence)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Displayed to approvers" className="mt-1 border-[#26374C] bg-[#0B1220]" />
                </div>
                <Button onClick={createPolicy} disabled={busy || (ruleType.startsWith('AMOUNT') && !amountValid)} className="w-full bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">Create new version</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {policies.isError ? <ErrorState message={String(policies.error)} retry={() => policies.refetch()} /> : null}

      <SectionCard title="Active policy" description="Evaluated server-side on every payment submission.">
        {active ? (
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#35D6C0]" />
              <span className="text-sm font-medium">{active.name}</span>
              <span className="rounded bg-[#142135] px-1.5 py-0.5 text-[10px] text-dim">v{active.version}</span>
            </div>
            <ul className="mt-3 space-y-2">
              {active.rules.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
                  {/* min-w-0: the condition JSON must be able to shrink and
                      truncate — a long unbreakable string otherwise inflates
                      the flex item and the whole page horizontally. */}
                  <div className="min-w-0">
                    <div className="text-xs text-secondary">{r.description}</div>
                    <div className="mt-1 font-mono text-[10px] text-dim"><span className="block max-w-full truncate break-all font-mono text-[10px]">{JSON.stringify(r.condition)}</span></div>
                  </div>
                  <span className="shrink-0 rounded bg-[#A18BEB]/10 px-2 py-0.5 text-[10px] text-[#A18BEB]">{r.approversRequired} approver{r.approversRequired > 1 ? 's' : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState title="No active policy" description="A default policy is created with every organization." />
        )}
      </SectionCard>

      <SectionCard className="mt-5" title="Version history" description="Approvals store the policy context; policy changes flag pending payments for re-review.">
        <div className="space-y-2">
          {(policies.data?.policies ?? []).filter((p) => !p.active).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#26374C] bg-[#0B1220] p-3 text-xs">
              <History className="h-3.5 w-3.5 text-dim" />
              <span className="min-w-0 max-w-full truncate text-secondary sm:max-w-none">{p.name}</span>
              <span className="rounded bg-[#142135] px-1.5 py-0.5 text-[10px] text-dim">v{p.version}</span>
              <span className="text-dim">{p.rules.length} rules · superseded</span>
            </div>
          ))}
          {(policies.data?.policies ?? []).filter((p) => !p.active).length === 0 ? <div className="text-xs text-dim">No superseded versions yet.</div> : null}
        </div>
      </SectionCard>
    </div>
  )
}
