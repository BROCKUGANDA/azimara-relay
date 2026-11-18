'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { PageHeader, ErrorState, SectionCard, SetupRequiredState } from '../ui'
import { PanelSkeleton } from '../states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDateTime } from '@/lib/client/format'
import { toast } from 'sonner'
import { RefreshCw, Trash2, CheckCircle2, XCircle, ShieldCheck, Wallet, Droplets, ArrowRightLeft } from 'lucide-react'

type Status = {
  multihopper: { configured: boolean; environment: string; status: string; statusDetail: string | null; lastCheckAt: string | null; capability: { maxDestinations: number }; webhookConfigured: boolean; verificationNote: string }
  solana: { network: string; rpcProvider: string; rpc: { available: boolean; slot?: number; error?: string } }
  intelligence: { available: boolean; provider: string }
  nonCustodialAttestation: { seedPhrasesStored: boolean; privateKeysStored: boolean; omnibusFundsHeld: boolean; aiCanExecutePayments: boolean }
}

type Config = { environment: string; configured: boolean; apiKeyLast4: string | null; webhookConfigured: boolean; status: string; statusDetail: string | null; lastCheckAt: string | null }

export function IntegrationsView() {
  const status = useApi<Status>(['integration-status'], '/api/integrations/status', { refetchInterval: 60_000 })
  const config = useApi<Config>(['execution-rail-config'], '/api/integrations/execution-rail')
  const [environment, setEnvironment] = useState<'DEVNET' | 'PRODUCTION'>('DEVNET')
  const [apiKey, setApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [destCount, setDestCount] = useState(5)

  // Documented mainnet screening fee per destination wallet (provider agentic
  // integration guide). Exact pre-charge is always confirmed from the live
  // create-transfer response before any broadcast.
  const SCREENING_FEE_SOL = 0.002
  const screeningEstimate = Math.max(0, destCount) * SCREENING_FEE_SOL

  async function save() {
    setBusy(true)
    try {
      await api('/api/integrations/execution-rail', { json: { environment, apiKey, webhookSecret: webhookSecret || undefined } })
      toast.success('Credentials stored (encrypted at rest)')
      setApiKey('')
      setWebhookSecret('')
      config.refetch()
      status.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Configuration failed')
    } finally {
      setBusy(false)
    }
  }

  async function probe() {
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; detail: string }>(`/api/integrations/execution-rail`, { method: 'PUT', json: { action: 'probe' } })
      if (res.ok) toast.success('Provider connectivity verified: ' + res.detail)
      else toast.warning('Probe result: ' + (res.detail ?? '').slice(0, 160))
      config.refetch()
      status.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Probe failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Remove stored execution-rail credentials from this organization?')) return
    try {
      await api('/api/integrations/execution-rail', { method: 'DELETE' })
      toast.success('Credentials removed')
      config.refetch()
      status.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const s = status.data
  const c = config.data

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Provider connections, RPC health and platform attestations. Environments are isolated by design."
        breadcrumb={['Relay', 'Administration', 'Integrations']}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard
          title="Execution rail"
          description="Programmable transaction routing provider — connected under NDA; provider identity is disclosed in the admin integration record."
          actions={c?.configured ? <Button size="sm" variant="ghost" className="h-7 text-xs text-[#F27683]" onClick={remove}><Trash2 className="mr-1 h-3 w-3" /> Remove</Button> : undefined}
        >
          {!c?.configured ? (
            <div className="space-y-3">
              <SetupRequiredState
                title="Credentials not configured"
                detail="Payments can be created, validated and approved. Quoting and execution activate with real provider credentials — no simulated transfers are ever produced."
              />
              <div className="space-y-3 rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                <div>
                  <Label>Environment</Label>
                  <Select value={environment} onValueChange={(v) => setEnvironment(v as 'DEVNET' | 'PRODUCTION')}>
                    <SelectTrigger className="mt-1 w-full border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#1D2E42] bg-[#142436]">
                      <SelectItem value="DEVNET">Devnet — test keys (mh_test_)</SelectItem>
                      <SelectItem value="PRODUCTION">Production — live keys (mh_live_)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>API key</Label>
                  <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={environment === 'DEVNET' ? 'mh_test_…' : 'mh_live_…'} className="mt-1 border-[#1D2E42] bg-[#0D1622] font-mono text-xs" />
                </div>
                <div>
                  <Label>Webhook signing secret (recommended)</Label>
                  <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="whsec_…" className="mt-1 border-[#1D2E42] bg-[#0D1622] font-mono text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={save} disabled={busy || !apiKey} className="flex-1 bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">Save credentials</Button>
                  <Button onClick={probe} disabled={busy || !c?.configured} variant="outline" className="border-[#1D2E42]"><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Probe</Button>
                </div>
                <p className="text-[11px] text-dim">Environment isolation is enforced server-side: test keys are rejected against production and vice versa. Endpoint hostnames are shown in the admin integration record once credentials are saved.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                <div>
                  <div className="text-sm font-medium">{c.environment}</div>
                  <div className="font-mono text-[10px] text-dim">key …{c.apiKeyLast4 ?? '—'}</div>
                </div>
                <div className={`flex items-center gap-1.5 text-xs ${c.status === 'ACTIVE' ? 'text-[#2ED3A6]' : c.status === 'ERROR' ? 'text-[#F27683]' : 'text-[#F2BB62]'}`}>
                  {c.status === 'ACTIVE' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {c.status}
                </div>
              </div>
              {c.statusDetail ? <div className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3 text-xs text-dim">{c.statusDetail}</div> : null}
              <div className="text-xs text-dim">
                <div>Capability limit: {s?.multihopper?.capability?.maxDestinations ?? 20} destinations per transfer route</div>
                <div className="mt-1">Webhook secret: {c.webhookConfigured ? 'configured (HMAC-SHA256 verified, timing-safe)' : 'not configured — configure before expecting provider callbacks'}</div>
                {c.lastCheckAt ? <div className="mt-1">Last probe: {formatDateTime(c.lastCheckAt)}</div> : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={probe} disabled={busy} variant="outline" className="border-[#1D2E42]"><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Run connectivity probe</Button>
              </div>
              <div className="rounded-lg border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-3 text-[11px] text-[#F2BB62]">
                <ShieldCheck className="mr-1 inline h-3 w-3" /> {s?.multihopper?.verificationNote}
                <div className="mt-1">Webhook endpoint to register with the provider: <code className="font-mono text-[#39C6D8]">/api/webhooks/execution-rail</code></div>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title="Wallet funding requirements"
            description="What the provider's agentic integration guide requires before a transfer can execute."
          >
            <div className="space-y-2">
              {[
                'Transfer amount — must sit on the source wallet at deploy time.',
                'Keeper up-front funding — requiredSolUpFrontLamports, returned by the provider per transfer, must be present before broadcasting.',
                'Gas — every transaction in the sequence (keeper funding → route init → orchestrator init → session init → dispersion init) is signed by you and paid from the wallet.',
                'Screening fee — 0.002 SOL per destination wallet on mainnet, non-refundable, charged per wallet screened.',
              ].map((line, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-[#1D2E42] bg-[#0D1622] px-3 py-2 text-xs text-secondary">
                  <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#39C6D8]" />
                  <span>{line}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
              <Label>Screening fee estimate</Label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={destCount}
                  onChange={(e) => setDestCount(Number(e.target.value) || 0)}
                  className="w-24 border-[#1D2E42] bg-[#0D1622]"
                  aria-label="Destination wallets"
                />
                <span className="text-xs text-dim">destination wallets ×</span>
                <span className="font-mono text-xs text-secondary">{SCREENING_FEE_SOL} SOL</span>
                <span className="text-[#1D2E42]">=</span>
                <span className="font-mono text-sm font-semibold text-[#39C6D8]">{screeningEstimate.toFixed(4)} SOL</span>
              </div>
              <p className="mt-2 text-[10px] text-dim">Estimate only — excludes transfer amount, keeper up-front lamports and gas. The provider returns exact requirements before anything is broadcast, and Relay surfaces them for approval first. Destinations are capped at {s?.multihopper?.capability?.maxDestinations ?? 20} per route.</p>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-2 rounded-lg border border-[#2ED3A6]/30 bg-[#2ED3A6]/5 px-3 py-2 text-xs text-[#2ED3A6]">
                <Droplets className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><span className="font-medium">No real funds needed to validate the flow:</span> the devnet rail uses test keys — acquire devnet SOL from the Solana faucet and run the full create → sign → broadcast → monitor sequence with zero mainnet exposure.</span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-[#F17FA8]/30 bg-[#F17FA8]/5 px-3 py-2 text-xs text-[#F17FA8]">
                <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><span className="font-medium">Alternative without the provider rail:</span> direct SOL/SPL transfers to registered recipients need only ordinary gas on your own wallet — no keeper funding, no screening fee. Enable the provider rail later; nothing is simulated in the meantime.</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Solana RPC" description="Balance reads and confirmation checks for the deployment network.">
            {status.isLoading ? (
              <PanelSkeleton count={1} />
            ) : s ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                  <div>
                    <div className="text-sm font-medium capitalize">{s.solana.network}</div>
                    <div className="text-[10px] text-dim">
                      {s.solana.rpc.available ? `Slot ${s.solana.rpc.slot}` : 'Unreachable'} · {s.solana.rpcProvider === 'paid' ? 'paid RPC' : 'public RPC — rate-limited; set HELIUS_API_KEY before real volume'}
                    </div>
                  </div>
                  {s.solana.rpc.available ? <StatusPill ok /> : <StatusPill ok={false} />}
                </div>
                {s.solana.rpcProvider !== 'paid' ? (
                  <div className="rounded-lg border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-2.5 text-[11px] text-[#F2BB62]">
                    The public mainnet endpoint throttles aggressively. Configure <code className="font-mono">HELIUS_API_KEY</code> (or <code className="font-mono">SOLANA_RPC_URL</code>) before running real volume.
                  </div>
                ) : null}
              </div>
            ) : null}
          </SectionCard>
          <SectionCard title="Relay Intelligence" description="AI provider state.">
            {status.isLoading ? (
              <PanelSkeleton count={1} />
            ) : s ? (
              <div className="flex items-center justify-between rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                <div>
                  <div className="text-sm font-medium">{s.intelligence.provider} provider</div>
                  <div className="text-[10px] text-dim">{s.intelligence.available ? 'Available' : 'Unavailable — deterministic tools remain live'}</div>
                </div>
                {s.intelligence.available ? <StatusPill ok /> : <StatusPill ok={false} />}
              </div>
            ) : null}
          </SectionCard>
          <SectionCard title="Non-custodial attestation" description="Verified platform behavior — checked, not claimed.">
            <div className="space-y-1.5 text-xs">
              {s ? Object.entries(s.nonCustodialAttestation).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-[#1D2E42] bg-[#0D1622] px-3 py-2">
                  <span className="text-secondary">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (ch) => ch.toUpperCase())}</span>
                  <span className={v ? 'text-[#2ED3A6]' : 'text-[#F27683]'}>{v ? 'Yes' : 'No'} <CheckCircle2 className="inline h-3 w-3" /></span>
                </div>
              )) : null}
              <p className="pt-1 text-[10px] text-dim">All values above are permanently false by platform design.</p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs ${ok ? 'text-[#2ED3A6]' : 'text-[#F27683]'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {ok ? 'Available' : 'Unavailable'}
    </span>
  )
}

