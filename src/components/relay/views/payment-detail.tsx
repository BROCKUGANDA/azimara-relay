'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/client/hooks'
import { formatAmount, shortAddress, shortHash, formatDateTime, timeAgo } from '@/lib/client/format'
import { copyText } from '@/lib/client/clipboard'
import { PageHeader, StatusBadge, Amount, SectionCard, ErrorState, SetupRequiredState } from '../ui'
import { DetailSkeleton } from '../states'
import { ProgressFlow } from '../motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { haptic } from '@/lib/client/motion'
import { ArrowLeft, CheckCircle2, Circle, XCircle, ExternalLink, Quote, RefreshCw, Play, FileSignature, ShieldCheck, Ban, Copy, Wallet } from 'lucide-react'

type Detail = {
  payment: {
    id: string
    reference: string
    type: string
    status: string
    statusReason: string | null
    source: string
    destination: string
    mint: string
    mintSymbol: string
    decimals: number
    amountBaseUnits: string
    reason: string | null
    invoiceRef: string | null
    approvalsRequired: number
    createdAt: string
    updatedAt: string
    completedAt: string | null
    lastError: string | null
  }
  wallet: { id: string; label: string; address: string; network: string } | null
  recipient: { id: string; name: string; address: string; registeredAt: string } | null
  quote: {
    id: string
    status: string
    principalBase: string
    feePctBps: number | null
    flatChargesBase: string | null
    perHopBase: string | null
    networkCostBase: string | null
    screeningBase: string | null
    recipientGetsBase: string | null
    expiresAt: string
    rawResponse: unknown
  } | null
  approvals: { id: string; approverName: string; approverEmail: string; decision: string; reason: string | null; payloadHashValid: boolean; createdAt: string; expiresAt: string | null }[]
  payloadHash: string
  canApprove: boolean
  hasDecided: boolean
  providerTransfer: { id: string; externalId: string; providerTransferId: string | null; providerStatus: string | null; internalPhase: string; progress: unknown } | null
  signatures: { id: string; purpose: string; signature: string; confirmedAt: string | null; submittedAt: string }[]
  settlement: { expectedBase: string; observedBase: string | null; providerStatus: string | null; chainStatus: string | null; signature: string | null; reconciledAt: string | null } | null
  lifecycle: { at: string; kind: string; type: string; detail: Record<string, unknown> }[]
}

const LIFECYCLE_STEPS = ['PENDING_APPROVAL', 'APPROVED', 'QUOTED', 'AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST', 'PROCESSING', 'SETTLEMENT_VERIFICATION', 'COMPLETED']

// Condensed 5-node pipeline position for the ProgressFlow widget. Unknown
// states (terminal failures, refunds) clamp to the last node they could
// have reached; the tone color communicates the outcome instead.
function flowIndex(status: string): number {
  if (['DRAFT', 'VALIDATING'].includes(status)) return 0
  if (['PENDING_APPROVAL'].includes(status)) return 0
  if (['APPROVED', 'QUOTED', 'QUOTE_EXPIRED'].includes(status)) return 1
  if (['AWAITING_SIGNATURE'].includes(status)) return 2
  if (['FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST', 'PROCESSING'].includes(status)) return 3
  return 4 // SETTLEMENT_VERIFICATION, COMPLETED, terminal states
}

export function PaymentDetailView({ paymentId, navigate }: { paymentId: string; navigate: (to: string) => void }) {
  const detail = useQuery<Detail>({
    queryKey: ['payment', paymentId],
    queryFn: () => api<Detail>(`/api/payments/${paymentId}`),
    refetchInterval: (query) => {
      const s = query.state.data?.payment?.status
      return s && ['COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(s) ? false : 15_000
    },
    retry: 1,
  })
  const [busy, setBusy] = useState<string | null>(null)

  const d = detail.data
  const network = d?.wallet?.network ?? 'devnet'
  const idx = d ? LIFECYCLE_STEPS.indexOf(d.payment.status) : -1
  const terminated = d ? ['REJECTED', 'CANCELLED', 'FAILED', 'QUOTE_EXPIRED', 'TRANSFER_EXPIRED', 'REFUNDED', 'RECOVERABLE', 'RESCUED', 'MANUAL_REVIEW', 'RECONCILIATION_REQUIRED'].includes(d.payment.status) : false
  const rawQuote = d?.quote ? (JSON.stringify(d.quote.rawResponse, null, 2) ?? '') : ''

  // Signing workflow state — the non-custodial execution sequence runs in the
  // user's own wallet, so the UI orchestrates it instead of hiding it.
  const [preparedBundles, setPreparedBundles] = useState<string | null>(null)
  const [keeperSig, setKeeperSig] = useState('')
  const [routeInitSigs, setRouteInitSigs] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Return visitors land mid-workflow (page reload, deep link): hydrate the
  // prepared bundles from the stored provider progress so the panel is usable
  // without re-calling prepare (prepare is idempotent but costs a provider round-trip).
  useEffect(() => {
    if (!d || preparedBundles !== null) return
    const progress = d.providerTransfer?.progress
    if (progress && typeof progress === 'object' && Object.keys(progress).length > 0) {
      try {
        setPreparedBundles(JSON.stringify(progress, null, 2))
      } catch {
        // progressJson is provider-controlled; a malformed blob simply means
        // the user re-prepares explicitly.
      }
    }
    // d (the fetched detail) is the only intentional trigger: preparedBundles
    // acts as a run-once guard, not a dependency.
  }, [d])

  async function act(action: string, body?: Record<string, unknown>, method: string = 'POST') {
    setBusy(action)
    haptic('tap')
    try {
      await api(`/api/payments/${paymentId}/${action}`, { method, json: body })
      haptic('success')
      toast.success(`${action.replace('-', ' ')} completed`)
      detail.refetch()
      return true
    } catch (err) {
      haptic('error')
      toast.error(err instanceof Error ? err.message : 'Action failed')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function prepare() {
    setBusy('prepare')
    haptic('tap')
    try {
      const res = await api<{ bundles: Record<string, unknown>; note: string }>(`/api/payments/${paymentId}/prepare`, { json: {} })
      setPreparedBundles(JSON.stringify(res.bundles, null, 2))
      haptic('success')
      toast.success('Bundle prepared — sign the keeper funding transaction in your wallet')
      detail.refetch()
    } catch (err) {
      haptic('error')
      toast.error(err instanceof Error ? err.message : 'Prepare failed')
    } finally {
      setBusy(null)
    }
  }

  async function submitKeeperSignature() {
    const sig = keeperSig.trim()
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(sig)) return toast.error('That does not look like a Solana transaction signature (base58)')
    const okFlag = await act('broadcast', { keeperSignature: sig })
    if (okFlag) { setKeeperSig(''); toast.info('Next: broadcast the remaining transactions, wait for onchain confirmation, then submit route-init signatures below') }
  }

  async function submitRouteInitSignatures() {
    const sigs = routeInitSigs.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    if (sigs.length === 0) return toast.error('Paste at least one signature (or an empty line to confirm with none)')
    for (const s of sigs) {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(s)) return toast.error(`Invalid signature format: ${s.slice(0, 16)}…`)
    }
    const okFlag = await act('confirm', { routeInitSignatures: sigs })
    if (okFlag) { setRouteInitSigs(''); toast.info('Route-init confirmed — use Sync status to track provider processing') }
  }

  async function approve(decision: 'APPROVED' | 'REJECTED') {
    const reason = decision === 'REJECTED' ? window.prompt('Rejection reason:') : window.prompt('Approval note (optional):')
    if (reason === null) return
    if (decision === 'REJECTED' && !reason) return
    // Two-step confirm gets its own deliberate pattern — the same triple-pulse
    // used for the duties-separation moment in the approval center.
    haptic('approve')
    await act('approve', { decision, reason: reason || undefined })
  }

  return (
    <div>
      <div className="mb-2">
        <Button variant="ghost" size="sm" className="text-xs text-dim" onClick={() => navigate('/app/payments')}><ArrowLeft className="mr-1 h-3 w-3" /> All payments</Button>
      </div>
      {detail.isError ? <ErrorState message={String(detail.error)} retry={() => detail.refetch()} /> : null}
      {!d ? (
        <div className="mt-6 space-y-4" aria-hidden>
          <div className="h-8 w-64 rounded bg-[#142436] relay-shimmer" />
          <DetailSkeleton />
        </div>
      ) : (
        <>
          <PageHeader
            title={`Payment ${d.payment.reference}`}
            description={`Created ${formatDateTime(d.payment.createdAt)} via ${d.payment.source}${d.payment.type ? ` · ${d.payment.type.toLowerCase()}` : ''}`}
            breadcrumb={['Relay', 'Payments', d.payment.reference]}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={d.payment.status} />
                {d.payment.status === 'PENDING_APPROVAL' && d.canApprove ? (
                  <>
                    <Button size="sm" onClick={() => approve('APPROVED')} disabled={busy !== null} className="bg-[#2ED3A6] font-medium text-[#06251C] hover:bg-[#2ED3A6]/90">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => approve('REJECTED')} disabled={busy !== null} className="border-[#F27683]/40 text-[#F27683]">
                      <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </>
                ) : null}
                {d.hasDecided && d.payment.status === 'PENDING_APPROVAL' ? <span className="text-xs text-dim">You already decided on this payment</span> : null}
                {(d.payment.status === 'APPROVED' || d.payment.status === 'QUOTE_EXPIRED') ? (
                  <Button size="sm" onClick={() => act('quote')} disabled={busy !== null} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
                    <Quote className="mr-1.5 h-3.5 w-3.5" /> Request quote
                  </Button>
                ) : null}
                {d.payment.status === 'QUOTED' ? (
                  <Button size="sm" onClick={() => act('execute')} disabled={busy !== null} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Start execution
                  </Button>
                ) : null}
                {['AWAITING_SIGNATURE', 'FUNDING_BROADCAST'].includes(d.payment.status) ? (
                  <Button size="sm" onClick={prepare} disabled={busy !== null} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
                    <FileSignature className="mr-1.5 h-3.5 w-3.5" /> Prepare bundle
                  </Button>
                ) : null}
                {['AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'PROCESSING', 'SETTLEMENT_VERIFICATION', 'RECOVERABLE', 'RECONCILIATION_REQUIRED'].includes(d.payment.status) ? (
                  <Button size="sm" variant="outline" onClick={() => act('sync')} disabled={busy !== null} className="border-[#1D2E42]">
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Sync status
                  </Button>
                ) : null}
                {['DRAFT', 'VALIDATING', 'PENDING_APPROVAL', 'APPROVED', 'QUOTED', 'AWAITING_SIGNATURE', 'QUOTE_EXPIRED'].includes(d.payment.status) ? (
                  confirmCancel ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)} disabled={busy !== null} className="border-[#1D2E42]">Keep payment</Button>
                      <Button size="sm" variant="destructive" onClick={async () => { const okFlag = await act('cancel'); if (okFlag) setConfirmCancel(false) }} disabled={busy !== null}>Confirm cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy !== null} className="text-[#F27683]">
                      <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancel
                    </Button>
                  )
                ) : null}
              </div>
            }
          />

          {/* Condensed lifecycle pipeline — position derives from the same
              state machine that gates server actions, not from decoration. */}
          {d.payment.status !== 'DRAFT' ? (
            <div className="mt-1 mb-6 overflow-x-auto rounded-xl border border-[#1D2E42] bg-[#0D1622]/60 px-4 py-3">
              <ProgressFlow
                steps={['Request', 'Approve', 'Quote', 'Sign', 'Settle']}
                current={flowIndex(d.payment.status)}
                tone={d.payment.status === 'COMPLETED' ? 'green' : ['REJECTED', 'CANCELLED', 'FAILED'].includes(d.payment.status) ? 'red' : ['RECOVERABLE', 'RECONCILIATION_REQUIRED', 'MANUAL_REVIEW', 'QUOTE_EXPIRED'].includes(d.payment.status) ? 'amber' : 'teal'}
                className="min-w-[420px]"
              />
            </div>
          ) : null}

          {d.payment.statusReason === 'PROVIDER_SETUP_REQUIRED' ? (
            <div className="mb-5">
              <SetupRequiredState
                title="Execution rail credentials required"
                detail="The payment is approved but the provider adapter has no configured credentials, so quoting cannot run. No fake or simulated quote will be shown."
                action={<Button size="sm" onClick={() => navigate('/app/integrations')} className="bg-[#39C6D8] font-medium text-[#04121A]">Configure integration</Button>}
              />
            </div>
          ) : null}
          {d.payment.lastError ? (
            <div className="mb-5 rounded-xl border border-[#F27683]/30 bg-[#F27683]/5 px-4 py-3 text-xs text-[#F27683]">
              <span className="font-medium">Last error:</span> {d.payment.lastError}
            </div>
          ) : null}

          {/* Non-custodial signing workflow — the actual execution hand-off.
              Shown from AWAITING_SIGNATURE until the provider takes over. */}
          {['AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST'].includes(d.payment.status) ? (
            <SectionCard
              className="mb-5"
              title="Signing workflow"
              description="Relay is non-custodial: the transactions are signed in your own wallet, then handed back to the relay step by step."
            >
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1D2E42] bg-[#0D1622] text-[11px] font-bold text-[#39C6D8]">1</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">Prepare the transaction bundle</div>
                    <p className="mt-0.5 text-[11px] text-dim">Fetches the unsigned transactions from the execution rail. Nothing is submitted yet.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={prepare} disabled={busy !== null} className="border-[#1D2E42]">
                        <FileSignature className="mr-1.5 h-3.5 w-3.5" /> {preparedBundles ? 'Re-prepare' : 'Prepare bundle'}
                      </Button>
                      {preparedBundles ? (
                        <Button size="sm" variant="ghost" className="text-xs text-dim" onClick={async () => {
                          const okFlag = await copyText(preparedBundles)
                          if (okFlag) toast.success('Bundle copied — sign the keeper funding transaction in your wallet')
                          else toast.error('Copy failed — select the JSON manually')
                        }}>
                          <Copy className="mr-1 h-3 w-3" /> Copy bundle JSON
                        </Button>
                      ) : null}
                    </div>
                    {preparedBundles ? (
                      <pre className="mt-2 max-h-44 overflow-auto rounded-lg border border-[#1D2E42] bg-[#0A1220] p-3 font-mono text-[10px] leading-relaxed text-dim">{preparedBundles.length > 12000 ? preparedBundles.slice(0, 12000) + '\n… truncated (use Copy for the full bundle)' : preparedBundles}</pre>
                    ) : null}
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1D2E42] bg-[#0D1622] text-[11px] font-bold text-[#39C6D8]">2</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">Submit the keeper funding signature</div>
                    <p className="mt-0.5 text-[11px] text-dim">Sign and broadcast the keeper funding transaction in your wallet, then paste its transaction signature here.</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={keeperSig}
                        onChange={(e) => setKeeperSig(e.target.value)}
                        placeholder="Keeper funding transaction signature (base58)"
                        className="min-w-0 flex-1 border-[#1D2E42] bg-[#0D1622] font-mono text-xs"
                        aria-label="Keeper funding signature"
                      />
                      <Button size="sm" onClick={submitKeeperSignature} disabled={busy !== null || !keeperSig.trim()} className="shrink-0 bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
                        <Wallet className="mr-1.5 h-3.5 w-3.5" /> Submit signature
                      </Button>
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1D2E42] bg-[#0D1622] text-[11px] font-bold text-[#39C6D8]">3</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">Confirm route-init signatures after onchain confirmation</div>
                    <p className="mt-0.5 text-[11px] text-dim">After the remaining transactions reach onchain confirmation, paste their signatures — one per line — to finalize the hand-off.</p>
                    <textarea
                      value={routeInitSigs}
                      onChange={(e) => setRouteInitSigs(e.target.value)}
                      rows={3}
                      placeholder="Signature 1\nSignature 2"
                      className="mt-2 w-full rounded-lg border border-[#1D2E42] bg-[#0D1622] p-2.5 font-mono text-xs text-secondary"
                      aria-label="Route-init signatures"
                    />
                    <Button size="sm" onClick={submitRouteInitSignatures} disabled={busy !== null || !routeInitSigs.trim()} className="mt-2 bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Finalize confirmation
                    </Button>
                  </div>
                </li>
              </ol>
              <p className="mt-4 border-t border-[#16273C] pt-3 text-[11px] text-dim">
                Every submitted signature is recorded under Transaction signatures below with a Solana Explorer link. Status only advances on verified evidence — use <span className="text-secondary">Sync status</span> after onchain confirmations.
              </p>
            </SectionCard>
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {/* Lifecycle timeline */}
              <SectionCard title="Lifecycle" description="Ordered provider sequence — status changes only on verified evidence.">
                {terminated && idx < 0 ? (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${['REJECTED', 'FAILED', 'CANCELLED'].includes(d.payment.status) ? 'border-[#F27683]/30 bg-[#F27683]/5 text-[#F27683]' : 'border-[#F2BB62]/30 bg-[#F2BB62]/5 text-[#F2BB62]'}`}>
                    Current state: <strong>{d.payment.status.replaceAll('_', ' ')}</strong>
                    {d.payment.statusReason ? ` — ${d.payment.statusReason.replaceAll('_', ' ')}` : ''}
                  </div>
                ) : (
                  <ol className="relative ml-3 space-y-0 border-l border-[#1D2E42]">
                    {LIFECYCLE_STEPS.map((s, i) => {
                      const done = idx > i || d.payment.status === 'COMPLETED'
                      const current = idx === i
                      return (
                        <li key={s} className="relative flex items-start gap-3 pb-4 pl-5 last:pb-0">
                          {done ? <CheckCircle2 className="absolute -left-[9px] h-4 w-4 bg-[#101C2C] text-[#2ED3A6]" />
                            : current ? <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center bg-[#101C2C]"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#39C6D8]" /></span>
                              : <Circle className="absolute -left-[9px] h-4 w-4 bg-[#101C2C] text-[#1D2E42]" />}
                          <div>
                            <div className={`text-xs font-medium ${current ? 'text-[#39C6D8]' : done ? 'text-secondary' : 'text-dim'}`}>{s.replaceAll('_', ' ')}</div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </SectionCard>

              {/* Quote */}
              {d.quote ? (
                <SectionCard title="Provider quote" description="From the live execution-rail estimate — authoritative at sign time, with expiry.">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-dim">Principal</div>
                      <Amount base={d.quote.principalBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-sm" />
                    </div>
                    <div className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-dim">Recipient receives (est.)</div>
                      <Amount base={d.quote.recipientGetsBase ?? d.quote.principalBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-sm" />
                    </div>
                    {d.quote.feePctBps ? (
                      <div className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                        <div className="text-[10px] uppercase tracking-wide text-dim">Percentage fee</div>
                        <div className="font-mono text-sm tabular-nums">{d.quote.feePctBps / 100}%</div>
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-dim">Quote status</div>
                      <div className="text-sm">{d.quote.status} · expires {formatDateTime(d.quote.expiresAt)}</div>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-[#39C6D8]">Raw provider response</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-[#1D2E42] bg-[#0A1220] p-3 font-mono text-[10px] leading-relaxed text-dim">{rawQuote.length > 20000 ? rawQuote.slice(0, 20000) + '\n… truncated' : rawQuote}</pre>
                  </details>
                </SectionCard>
              ) : null}

              {/* Approval evidence */}
              <SectionCard title="Approval evidence" description={`Payload hash ${shortHash(d.payloadHash)} — approvals bind these exact fields.`}>
                <div className="space-y-2">
                  {d.approvals.length === 0 ? <div className="text-xs text-dim">No decisions recorded yet.</div> : null}
                  {d.approvals.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                      <div>
                        <div className="text-xs font-medium">{a.approverName} <span className="text-dim">({a.approverEmail})</span></div>
                        <div className="mt-0.5 text-[11px] text-dim">{timeAgo(a.createdAt)}{a.reason ? ` · ${a.reason}` : ''}</div>
                        {!a.payloadHashValid ? <div className="mt-1 text-[11px] text-[#F27683]">Payload hash mismatch — approval invalid</div> : null}
                      </div>
                      <StatusBadge status={a.decision === 'APPROVED' ? 'COMPLETED' : a.decision === 'REJECTED' ? 'FAILED' : 'QUOTE_EXPIRED'} label={a.decision} />
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Signatures */}
              {d.signatures.length > 0 ? (
                <SectionCard title="Transaction signatures" description="Real onchain signatures recorded during execution.">
                  <div className="space-y-2">
                    {d.signatures.map((s) => {
                      const explorer = `https://explorer.solana.com/tx/${s.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`
                      return (
                        <a key={s.id} href={explorer} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3 hover:bg-[#142436]">
                          <div>
                            <div className="text-xs font-medium">{s.purpose.replaceAll('_', ' ')}</div>
                            <div className="mt-0.5 font-mono text-[10px] text-dim">{shortHash(s.signature)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {s.confirmedAt ? <StatusBadge status="COMPLETED" label="Confirmed" /> : <StatusBadge status="PROCESSING" label="Submitted" />}
                            <ExternalLink className="h-3.5 w-3.5 text-dim" />
                          </div>
                        </a>
                      )
                    })}
                  </div>
                </SectionCard>
              ) : null}
            </div>

            {/* Side column */}
            <div className="space-y-5">
              <SectionCard title="Payment details">
                <dl className="space-y-2.5 text-xs">
                  <div className="flex justify-between gap-3"><dt className="text-dim">Amount</dt><dd><Amount base={d.payment.amountBaseUnits} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="font-semibold text-[#39C6D8]" /></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Destination</dt><dd className="text-right font-mono text-secondary">{shortAddress(d.payment.destination, 6)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Recipient</dt><dd className="text-right text-secondary">{d.recipient?.name ?? 'Not registered'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Source wallet</dt><dd className="text-right text-secondary">{d.wallet?.label ?? '—'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Network</dt><dd className="text-secondary">{network}</dd></div>
                  {d.payment.reason ? <div className="flex justify-between gap-3"><dt className="shrink-0 text-dim">Reason</dt><dd className="min-w-0 break-words text-right text-secondary">{d.payment.reason}</dd></div> : null}
                  {d.payment.invoiceRef ? <div className="flex justify-between gap-3"><dt className="text-dim">Invoice</dt><dd className="min-w-0 break-words text-right font-mono text-secondary">{d.payment.invoiceRef}</dd></div> : null}
                  <div className="flex justify-between gap-3"><dt className="text-dim">Approvers required</dt><dd className="text-secondary">{d.payment.approvalsRequired}</dd></div>
                  {d.payment.completedAt ? <div className="flex justify-between gap-3"><dt className="text-dim">Completed</dt><dd className="text-[#2ED3A6]">{formatDateTime(d.payment.completedAt)}</dd></div> : null}
                </dl>
              </SectionCard>

              {d.providerTransfer ? (
                <SectionCard title="Provider transfer" description="Idempotent external reference — creation retries reuse the same ID.">
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-dim">External ID</dt><dd className="truncate font-mono text-secondary">{d.providerTransfer.externalId}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Provider ref</dt><dd className="truncate font-mono text-secondary">{d.providerTransfer.providerTransferId ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Provider status</dt><dd className="text-secondary">{d.providerTransfer.providerStatus ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Internal phase</dt><dd className="text-secondary">{d.providerTransfer.internalPhase}</dd></div>
                  </dl>
                </SectionCard>
              ) : null}

              {d.settlement ? (
                <SectionCard title="Settlement" description="Verified against provider and chain evidence.">
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-dim">Provider</dt><dd className="text-secondary">{d.settlement.providerStatus ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Chain</dt><dd className="text-[#2ED3A6]">{d.settlement.chainStatus ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Expected</dt><dd><Amount base={d.settlement.expectedBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-secondary" /></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Observed</dt><dd><Amount base={d.settlement.observedBase ?? d.settlement.expectedBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-secondary" /></dd></div>
                  </dl>
                  {d.settlement.signature ? (
                    <a href={`https://explorer.solana.com/tx/${d.settlement.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-[#39C6D8] hover:underline">
                      View on explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </SectionCard>
              ) : null}

              <SectionCard title="Audit timeline">
                <div className="space-y-2">
                  {d.lifecycle.length === 0 ? <div className="text-xs text-dim">No events recorded yet.</div> : null}
                  {d.lifecycle.slice().reverse().map((e, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 border-b border-[#16273C] pb-2 text-xs last:border-0">
                      <div>
                        <span className="text-secondary">{e.type.replaceAll('_', ' ')}</span>
                        <span className="ml-2 rounded bg-[#142436] px-1.5 py-0.5 text-[9px] uppercase text-dim">{e.kind}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-dim">{timeAgo(e.at)}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
