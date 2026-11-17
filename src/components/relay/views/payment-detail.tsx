'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { formatAmount, shortAddress, shortHash, formatDateTime, timeAgo } from '@/lib/client/format'
import { PageHeader, StatusBadge, Amount, SectionCard, ErrorState, SetupRequiredState } from '../ui'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Circle, XCircle, ExternalLink, Quote, RefreshCw, Play, FileSignature, ShieldCheck, Ban } from 'lucide-react'

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

export function PaymentDetailView({ paymentId, navigate }: { paymentId: string; navigate: (to: string) => void }) {
  const detail = useApi<Detail>(['payment', paymentId], `/api/payments/${paymentId}`, { refetchInterval: 15_000 })
  const [busy, setBusy] = useState<string | null>(null)

  const d = detail.data
  const network = d?.wallet?.network ?? 'devnet'
  const idx = d ? LIFECYCLE_STEPS.indexOf(d.payment.status) : -1
  const terminated = d ? ['REJECTED', 'CANCELLED', 'FAILED', 'QUOTE_EXPIRED', 'TRANSFER_EXPIRED', 'REFUNDED', 'RECOVERABLE', 'RESCUED', 'MANUAL_REVIEW', 'RECONCILIATION_REQUIRED'].includes(d.payment.status) : false

  async function act(action: string, body?: Record<string, unknown>, method: string = 'POST') {
    setBusy(action)
    try {
      await api(`/api/payments/${paymentId}/${action}`, { method, json: body })
      toast.success(`${action.replace('-', ' ')} completed`)
      detail.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  async function approve(decision: 'APPROVED' | 'REJECTED') {
    const reason = decision === 'REJECTED' ? window.prompt('Rejection reason:') ?? '' : window.prompt('Approval note (optional):') ?? ''
    if (decision === 'REJECTED' && !reason) return
    await act('approve', { decision, reason: reason || undefined })
  }

  return (
    <div>
      <div className="mb-2">
        <Button variant="ghost" size="sm" className="text-xs text-dim" onClick={() => navigate('/app/payments')}><ArrowLeft className="mr-1 h-3 w-3" /> All payments</Button>
      </div>
      {detail.isError ? <ErrorState message={String(detail.error)} retry={() => detail.refetch()} /> : null}
      {!d ? (
        <div className="h-64 animate-pulse rounded-xl bg-[#0E1725]" />
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
                    <Button size="sm" onClick={() => approve('APPROVED')} disabled={busy === 'approve'} className="bg-[#36C995] font-medium text-[#06221A] hover:bg-[#36C995]/90">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => approve('REJECTED')} disabled={busy === 'approve'} className="border-[#F27683]/40 text-[#F27683]">
                      <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </>
                ) : null}
                {d.hasDecided && d.payment.status === 'PENDING_APPROVAL' ? <span className="text-xs text-dim">You already decided on this payment</span> : null}
                {(d.payment.status === 'APPROVED' || d.payment.status === 'QUOTE_EXPIRED') ? (
                  <Button size="sm" onClick={() => act('quote')} disabled={busy === 'quote'} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
                    <Quote className="mr-1.5 h-3.5 w-3.5" /> Request quote
                  </Button>
                ) : null}
                {d.payment.status === 'QUOTED' ? (
                  <Button size="sm" onClick={() => act('execute')} disabled={busy === 'execute'} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Start execution
                  </Button>
                ) : null}
                {d.payment.status === 'AWAITING_SIGNATURE' ? (
                  <Button size="sm" onClick={() => act('prepare')} disabled={busy === 'prepare'} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
                    <FileSignature className="mr-1.5 h-3.5 w-3.5" /> Prepare bundle
                  </Button>
                ) : null}
                {['AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'PROCESSING', 'SETTLEMENT_VERIFICATION', 'RECOVERABLE', 'RECONCILIATION_REQUIRED'].includes(d.payment.status) ? (
                  <Button size="sm" variant="outline" onClick={() => act('sync')} disabled={busy === 'sync'} className="border-[#26374C]">
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Sync status
                  </Button>
                ) : null}
                {['DRAFT', 'VALIDATING', 'PENDING_APPROVAL', 'APPROVED', 'QUOTED', 'AWAITING_SIGNATURE', 'QUOTE_EXPIRED'].includes(d.payment.status) ? (
                  <Button size="sm" variant="ghost" onClick={() => act('cancel')} disabled={busy === 'cancel'} className="text-[#F27683]">
                    <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancel
                  </Button>
                ) : null}
              </div>
            }
          />

          {d.payment.statusReason === 'PROVIDER_SETUP_REQUIRED' ? (
            <div className="mb-5">
              <SetupRequiredState
                title="MultiHopper credentials required"
                detail="The payment is approved but the provider adapter has no configured credentials, so quoting cannot run. No fake or simulated quote will be shown."
                action={<Button size="sm" onClick={() => navigate('/app/integrations')} className="bg-[#35D6C0] font-medium text-[#062A26]">Configure integration</Button>}
              />
            </div>
          ) : null}
          {d.payment.lastError ? (
            <div className="mb-5 rounded-xl border border-[#F27683]/30 bg-[#F27683]/5 px-4 py-3 text-xs text-[#F27683]">
              <span className="font-medium">Last error:</span> {d.payment.lastError}
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {/* Lifecycle timeline */}
              <SectionCard title="Lifecycle" description="Ordered provider sequence — status changes only on verified evidence.">
                {terminated && idx < 0 ? (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${['REJECTED', 'FAILED', 'CANCELLED'].includes(d.payment.status) ? 'border-[#F27683]/30 bg-[#F27683]/5 text-[#F27683]' : 'border-[#F2BB62]/30 bg-[#F2BB62]/5 text-[#F2BB62]'}`}>
                    Current state: <strong>{d.payment.status.replaceAll('_', ' ')}</strong>
                    {d.payment.statusReason ? ` — ${d.payment.statusReason.replaceAll('_', ' ')}` : ''}
                  </div>
                ) : (
                  <ol className="relative ml-3 space-y-0 border-l border-[#26374C]">
                    {LIFECYCLE_STEPS.map((s, i) => {
                      const done = idx > i || d.payment.status === 'COMPLETED'
                      const current = idx === i
                      return (
                        <li key={s} className="relative flex items-start gap-3 pb-4 pl-5 last:pb-0">
                          {done ? <CheckCircle2 className="absolute -left-[9px] h-4 w-4 bg-[#0E1725] text-[#36C995]" />
                            : current ? <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center bg-[#0E1725]"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#35D6C0]" /></span>
                              : <Circle className="absolute -left-[9px] h-4 w-4 bg-[#0E1725] text-[#26374C]" />}
                          <div>
                            <div className={`text-xs font-medium ${current ? 'text-[#35D6C0]' : done ? 'text-secondary' : 'text-dim'}`}>{s.replaceAll('_', ' ')}</div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </SectionCard>

              {/* Quote */}
              {d.quote ? (
                <SectionCard title="Provider quote" description="From the live MultiHopper estimate — authoritative at sign time, with expiry.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-dim">Principal</div>
                      <Amount base={d.quote.principalBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-sm" />
                    </div>
                    <div className="rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-dim">Recipient receives (est.)</div>
                      <Amount base={d.quote.recipientGetsBase ?? d.quote.principalBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-sm" />
                    </div>
                    {d.quote.feePctBps ? (
                      <div className="rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
                        <div className="text-[10px] uppercase tracking-wide text-dim">Percentage fee</div>
                        <div className="font-mono text-sm tabular-nums">{d.quote.feePctBps / 100}%</div>
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-dim">Quote status</div>
                      <div className="text-sm">{d.quote.status} · expires {formatDateTime(d.quote.expiresAt)}</div>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-[#35D6C0]">Raw provider response</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-[#26374C] bg-[#080D17] p-3 font-mono text-[10px] leading-relaxed text-dim">{JSON.stringify(d.quote.rawResponse, null, 2)}</pre>
                  </details>
                </SectionCard>
              ) : null}

              {/* Approval evidence */}
              <SectionCard title="Approval evidence" description={`Payload hash ${shortHash(d.payloadHash)} — approvals bind these exact fields.`}>
                <div className="space-y-2">
                  {d.approvals.length === 0 ? <div className="text-xs text-dim">No decisions recorded yet.</div> : null}
                  {d.approvals.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
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
                        <a key={s.id} href={explorer} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-[#26374C] bg-[#0B1220] p-3 hover:bg-[#142135]">
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
                  <div className="flex justify-between gap-3"><dt className="text-dim">Amount</dt><dd><Amount base={d.payment.amountBaseUnits} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="font-semibold text-[#35D6C0]" /></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Destination</dt><dd className="text-right font-mono text-secondary">{shortAddress(d.payment.destination, 6)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Recipient</dt><dd className="text-right text-secondary">{d.recipient?.name ?? 'Not registered'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Source wallet</dt><dd className="text-right text-secondary">{d.wallet?.label ?? '—'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Network</dt><dd className="text-secondary">{network}</dd></div>
                  {d.payment.reason ? <div className="flex justify-between gap-3"><dt className="shrink-0 text-dim">Reason</dt><dd className="text-right text-secondary">{d.payment.reason}</dd></div> : null}
                  {d.payment.invoiceRef ? <div className="flex justify-between gap-3"><dt className="text-dim">Invoice</dt><dd className="font-mono text-secondary">{d.payment.invoiceRef}</dd></div> : null}
                  <div className="flex justify-between gap-3"><dt className="text-dim">Approvers required</dt><dd className="text-secondary">{d.payment.approvalsRequired}</dd></div>
                  {d.payment.completedAt ? <div className="flex justify-between gap-3"><dt className="text-dim">Completed</dt><dd className="text-[#36C995]">{formatDateTime(d.payment.completedAt)}</dd></div> : null}
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
                    <div className="flex justify-between gap-3"><dt className="text-dim">Chain</dt><dd className="text-[#36C995]">{d.settlement.chainStatus ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Expected</dt><dd><Amount base={d.settlement.expectedBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-secondary" /></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Observed</dt><dd><Amount base={d.settlement.observedBase ?? d.settlement.expectedBase} decimals={d.payment.decimals} symbol={d.payment.mintSymbol} className="text-secondary" /></dd></div>
                  </dl>
                  {d.settlement.signature ? (
                    <a href={`https://explorer.solana.com/tx/${d.settlement.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-[#35D6C0] hover:underline">
                      View on explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </SectionCard>
              ) : null}

              <SectionCard title="Audit timeline">
                <div className="space-y-2">
                  {d.lifecycle.length === 0 ? <div className="text-xs text-dim">No events recorded yet.</div> : null}
                  {d.lifecycle.slice().reverse().map((e, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 border-b border-[#1A293D] pb-2 text-xs last:border-0">
                      <div>
                        <span className="text-secondary">{e.type.replaceAll('_', ' ')}</span>
                        <span className="ml-2 rounded bg-[#142135] px-1.5 py-0.5 text-[9px] uppercase text-dim">{e.kind}</span>
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
