'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { PageHeader, EmptyState, ErrorState, DataTable, SectionCard } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { timeAgo } from '@/lib/client/format'
import { toast } from 'sonner'
import { KeyRound, Copy, Trash2, Plus } from 'lucide-react'

type KeyRow = { id: string; name: string; prefix: string; environment: string; scopes: string[]; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }

const ALL_SCOPES = ['payments:read', 'payments:create', 'recipients:read', 'recipients:create', 'treasury:read']

export function ApiKeysView() {
  const keys = useApi<{ keys: KeyRow[]; entitlement: { apiKeys: number; apiAccess: boolean } }>(['api-keys'], '/api/api-keys')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState<'TEST' | 'LIVE'>('TEST')
  const [scopes, setScopes] = useState<string[]>(['payments:read'])
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const res = await api<{ key: string }>('/api/api-keys', { json: { name, environment, scopes } })
      setCreatedKey(res.key)
      keys.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Key creation failed')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Revoke this key? Requests using it will fail immediately.')) return
    try {
      await api(`/api/api-keys/${id}`, { method: 'DELETE' })
      toast.success('Key revoked')
      keys.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="API keys"
        description="Scoped programmatic access for your own systems. Keys are stored hashed and shown once."
        breadcrumb={['Relay', 'Administration', 'API keys']}
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreatedKey(null) }}>
            <DialogTrigger asChild><Button className="bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90"><Plus className="mr-1.5 h-4 w-4" /> Create key</Button></DialogTrigger>
            <DialogContent className="border-[#2E2540] bg-[#15111D]">
              <DialogHeader><DialogTitle>Create API key</DialogTitle></DialogHeader>
              {createdKey ? (
                <div>
                  <div className="rounded-lg border border-[#43D48E]/40 bg-[#43D48E]/5 p-3">
                    <div className="text-xs font-medium text-[#43D48E]">Key created — copy it now; it cannot be retrieved again.</div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-[#100D16] px-2 py-1.5 font-mono text-xs text-[#E7B458]">{createdKey}</code>
                      <Button size="sm" variant="outline" className="border-[#2E2540]" onClick={() => { navigator.clipboard.writeText(createdKey); toast.success('Copied') }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Billing system integration" className="mt-1 border-[#2E2540] bg-[#100D16]" /></div>
                  <div>
                    <Label>Environment</Label>
                    <Select value={environment} onValueChange={(v) => setEnvironment(v as 'TEST' | 'LIVE')}>
                      <SelectTrigger className="mt-1 border-[#2E2540] bg-[#100D16]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#2E2540] bg-[#1d1826]"><SelectItem value="TEST">Test (rk_test_)</SelectItem><SelectItem value="LIVE">Live (rk_live_)</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Scopes</Label>
                    <div className="mt-2 space-y-1.5">
                      {ALL_SCOPES.map((s) => (
                        <label key={s} className="flex items-center gap-2 text-xs text-secondary">
                          <Checkbox checked={scopes.includes(s)} onCheckedChange={(c) => setScopes(c ? [...scopes, s] : scopes.filter((x) => x !== s))} />
                          <code className="font-mono text-[11px]">{s}</code>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button onClick={create} disabled={busy || !name || scopes.length === 0} className="w-full bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90">Create key</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      {keys.data && !keys.data.entitlement.apiAccess ? (
        <div className="mb-4 rounded-xl border border-[#F2BB62]/30 bg-[#F2BB62]/5 px-4 py-3 text-xs text-[#F2BB62]">
          Developer API access requires the Growth plan or above. Keys are listed but new key creation is blocked until you upgrade.
        </div>
      ) : null}
      {keys.isError ? <ErrorState message={String(keys.error)} retry={() => keys.refetch()} /> : null}

      <DataTable
        loading={keys.isLoading}
        keyOf={(k) => k.id}
        rows={keys.data?.keys ?? []}
        empty={<EmptyState icon={<KeyRound className="h-8 w-8" />} title="No API keys" description="Create scoped keys for payments and recipients operations from your own systems." />}
        columns={[
          { key: 'name', header: 'Key', render: (k) => <div><div className="text-sm">{k.name}</div><div className="font-mono text-[10px] text-dim">{k.prefix}••••</div></div> },
          { key: 'env', header: 'Environment', render: (k) => <span className="rounded bg-[#1d1826] px-1.5 py-0.5 text-[10px] text-dim">{k.environment}</span> },
          { key: 'scopes', header: 'Scopes', render: (k) => <div className="flex flex-wrap gap-1">{k.scopes.map((s) => <code key={s} className="rounded bg-[#1d1826] px-1 py-0.5 font-mono text-[10px] text-secondary">{s}</code>)}</div> },
          { key: 'used', header: 'Last used', render: (k) => <span className="text-xs text-dim">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : 'never'}</span> },
          { key: 'st', header: 'Status', render: (k) => <span className={`text-xs ${k.revokedAt ? 'text-[#F27683]' : 'text-[#43D48E]'}`}>{k.revokedAt ? 'Revoked' : 'Active'}</span> },
          { key: 'act', header: '', className: 'text-right', render: (k) => !k.revokedAt ? <Button size="sm" variant="ghost" aria-label="Revoke key" className="h-9 w-9 justify-center text-[#F27683]" title="Revoke key" onClick={() => revoke(k.id)}><Trash2 className="h-3 w-3" /></Button> : null },
        ]}
      />

      <SectionCard className="mt-5" title="Using your keys">
        <pre className="overflow-x-auto rounded-lg bg-[#0C0A12] p-3 font-mono text-[11px] leading-relaxed text-[#ABA3BC]">{`curl -X POST /api/v1/payments \\
  -H "Authorization: Bearer rk_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "sourceWalletId": "…",
    "destination": "…",
    "mint": "EPjFWdd5…",
    "amount": "125.50",
    "idempotencyKey": "order-8741-payment-1"
  }'`}</pre>
        <p className="mt-2 text-xs text-dim">The idempotency key is mandatory for payment creation — retries converge on the same payment instead of duplicating transfers. Full specification: <code className="font-mono text-[#E7B458]">/api/openapi</code>.</p>
      </SectionCard>
    </div>
  )
}
