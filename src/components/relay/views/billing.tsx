'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { useApi, api } from '@/lib/client/hooks'
import { ApiClientError } from '@/lib/client/api'
import { useSession } from '@/lib/client/store'
import { formatDateTime } from '@/lib/client/format'
import { PageHeader, SectionCard, ErrorState, EmptyState, SetupRequiredState } from '../ui'
import { TableSkeleton, MetricSkeleton } from '../states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  CheckCircle2, CreditCard, Copy, ExternalLink, Landmark, Wallet,
  RefreshCw, ShieldCheck, Clock, Loader2, QrCode, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Collection = {
  enabled: boolean
  network: string
  mint: string
  decimals: number
  treasuryAddress: string
  treasuryAta: string
  explorerTreasury: string
  invoiceValidityHours: number
  rpcHealth: { ok: boolean; slot?: number; error?: string }
}

type Invoice = {
  id: string
  kind: string
  plan: string
  months: number
  amountBaseUnits: string
  amountUi: string
  currency: string
  network: string
  treasuryAddress: string
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'
  payUri: string
  explorerTreasury: string
  confirmedSignature: string | null
  explorerTx: string | null
  confirmedAt: string | null
  expiresAt: string
  createdAt: string
}

type BillingData = {
  subscription: { plan: string; status: string; seats: number; seatLimit: number; periodEnd: string } | null
  plan: string
  planStatus: string
  entitlements: { seats: number; maxBatchItems: number; monthlyPayments: number; aiRequestsPerMonth: number; apiKeys: number; treasuryWallets: number; exports: boolean; apiAccess: boolean; multiApprover: boolean; priceMonthlyUsd: number | null }
  usage: { paymentsThisMonth: number; members: number; activeKeys: number; paymentsLimit: number; seatsLimit: number; apiKeysLimit: number }
  plans: { id: string; seats: number; maxBatchItems: number; monthlyPayments: number; aiRequestsPerMonth: number; apiKeys: number; treasuryWallets: number; apiAccess: boolean; multiApprover: boolean; priceMonthlyUsd: number | null }[]
  billingEvents: { id: string; type: string; data: Record<string, unknown>; createdAt: string }[]
  invoices: Invoice[]
  collection: Collection
  collectionNote: string
}

function shortAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Clipboard unavailable — copy manually')
  }
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100))
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className="font-mono tabular-nums text-dim">{used} / {limit}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#1d1826]">
        <div className={cn('h-full rounded-full', pct > 90 ? 'bg-[#F27683]' : pct > 70 ? 'bg-[#F2BB62]' : 'bg-[#E7B458]')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const INVOICE_STATUS_TONE: Record<string, { text: string; border: string; bg: string }> = {
  PENDING: { text: 'text-[#F2BB62]', border: 'border-[#F2BB62]/30', bg: 'bg-[#F2BB62]/10' },
  CONFIRMED: { text: 'text-[#43D48E]', border: 'border-[#43D48E]/30', bg: 'bg-[#43D48E]/10' },
  EXPIRED: { text: 'text-[#7C7490]', border: 'border-[#2E2540]', bg: 'bg-[#251E31]' },
  CANCELLED: { text: 'text-[#7C7490]', border: 'border-[#2E2540]', bg: 'bg-[#251E31]' },
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const tone = INVOICE_STATUS_TONE[status] ?? INVOICE_STATUS_TONE.EXPIRED
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', tone.bg, tone.text, tone.border)}>
      {status === 'PENDING' ? <Clock className="h-3 w-3" /> : status === 'CONFIRMED' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

export function BillingView() {
  const session = useSession()
  const billing = useApi<BillingData>(['billing'], '/api/billing', { refetchInterval: 12_000 })
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [claimSig, setClaimSig] = useState('')

  const d = billing.data
  const activeInvoice = useMemo(
    () => (d?.invoices ?? []).find((i) => i.id === activeInvoiceId) ?? null,
    [d, activeInvoiceId],
  )
  const canManage = ['OWNER', 'TREASURY_ADMIN'].includes(session.activeOrg?.role ?? '')

  // When the active invoice settles, refresh entitlements everywhere.
  const confirmedNow = activeInvoice?.status === 'CONFIRMED'
  useEffect(() => {
    if (confirmedNow) session.refresh()
  }, [confirmedNow])

  async function upgradeTo(plan: string) {
    try {
      const res = await api<{ invoiceRequired?: boolean; invoice?: Invoice; plan?: string; unchanged?: boolean }>('/api/billing', { json: { plan } })
      if (res.invoiceRequired && res.invoice) {
        setActiveInvoiceId(res.invoice.id)
        billing.refetch()
        toast.info(`Invoice created — pay ${res.invoice.amountUi} USDC to activate ${plan}`)
      } else if (res.plan) {
        toast.success(`Plan switched to ${res.plan}`)
        billing.refetch()
        session.refresh()
      }
    } catch (err) {
      if (err instanceof ApiClientError) toast.error(`${err.code}: ${err.message}`)
      else toast.error('Plan change failed')
    }
  }

  async function renew(months: number) {
    try {
      const res = await api<{ invoice: Invoice }>('/api/billing/invoice', { json: { kind: 'RENEWAL', months } })
      setActiveInvoiceId(res.invoice.id)
      billing.refetch()
      toast.info(`Renewal invoice created — pay ${res.invoice.amountUi} USDC`)
    } catch (err) {
      if (err instanceof ApiClientError) toast.error(`${err.code}: ${err.message}`)
      else toast.error('Could not create renewal invoice')
    }
  }

  async function cancelInvoice(id: string) {
    try {
      await api('/api/billing/invoice', { method: 'DELETE', json: { invoiceId: id } })
      toast.success('Invoice cancelled')
      if (activeInvoiceId === id) setActiveInvoiceId(null)
      billing.refetch()
    } catch (err) {
      if (err instanceof ApiClientError) toast.error(`${err.code}: ${err.message}`)
      else toast.error('Cancel failed')
    }
  }

  async function verifyNow() {
    if (!claimSig.trim() || !activeInvoice) return
    setVerifying(true)
    try {
      const res = await api<{ invoice: Invoice; idempotent: boolean }>('/api/billing/verify', { json: { signature: claimSig.trim() } })
      if (res.invoice.status === 'CONFIRMED') {
        toast.success(`${res.invoice.plan} activated — payment confirmed on-chain`)
        setClaimSig('')
        billing.refetch()
        session.refresh()
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast.error(err.message, { description: err.code })
        if (err.code === 'NO_MATCHING_PENDING_INVOICE') billing.refetch()
      } else {
        toast.error('Verification failed')
      }
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Subscription plans gate real limits in code. Upgrades and renewals are paid in USDC on Solana mainnet-beta and settle automatically from the chain."
        breadcrumb={['Relay', 'Administration', 'Billing']}
      />
      {billing.isError ? <ErrorState message={String(billing.error)} retry={() => billing.refetch()} /> : null}
      {billing.isLoading ? (
        <div className="space-y-5">
          <MetricSkeleton count={4} />
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : null}
      {d ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#E7B458]/30 bg-[#E7B458]/5 p-4">
              <div className="text-[10px] uppercase tracking-wide text-[#E7B458]/70">Current plan</div>
              <div className="mt-1 text-xl font-semibold text-[#E7B458]">{d.plan}</div>
              <div className="text-xs text-dim">{d.planStatus} · renews {d.subscription ? formatDateTime(d.subscription.periodEnd) : '—'}</div>
            </div>
            <div className="rounded-xl border border-[#2E2540] bg-[#15111D] p-4">
              <div className="text-[10px] uppercase tracking-wide text-dim">Monthly price</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{d.entitlements.priceMonthlyUsd != null ? `${d.entitlements.priceMonthlyUsd} USDC` : 'Custom'}</div>
              <div className="text-xs text-dim">paid on {d.collection.network}</div>
            </div>
            <div className="rounded-xl border border-[#2E2540] bg-[#15111D] p-4">
              <div className="text-[10px] uppercase tracking-wide text-dim">Seats</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{d.usage.members}/{d.usage.seatsLimit}</div>
            </div>
            <div className="rounded-xl border border-[#2E2540] bg-[#15111D] p-4">
              <div className="text-[10px] uppercase tracking-wide text-dim">Payments this month</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{d.usage.paymentsThisMonth}/{d.usage.paymentsLimit}</div>
            </div>
          </div>

          <SectionCard
            className="mt-5"
            title="Payment collection — Solana mainnet-beta"
            description="Invoices settle from the real chain: the platform watches the treasury for the exact USDC amount, at finalized commitment."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', d.collection.rpcHealth.ok ? 'bg-[#43D48E]' : 'bg-[#F2BB62]')} aria-hidden />
                  <span className="text-secondary">
                    {d.collection.rpcHealth.ok
                      ? `RPC healthy${d.collection.rpcHealth.slot ? ` · slot ${d.collection.rpcHealth.slot.toLocaleString('en-US')}` : ''}`
                      : 'RPC degraded — payment detection may be delayed (retains honest pending state, never fakes settlement)'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#2E2540] bg-[#100D16] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-dim"><Landmark className="h-3 w-3" /> Treasury (USDC destination)</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 break-all font-mono text-[11px] text-secondary">{d.collection.treasuryAddress}</code>
                    <button onClick={() => copyText(d.collection.treasuryAddress, 'Treasury address')} className="rounded-md border border-[#2E2540] p-1.5 text-dim hover:text-[#E7B458]" aria-label="Copy treasury address">
                      <Copy className="h-3 w-3" />
                    </button>
                    <a href={d.collection.explorerTreasury} target="_blank" rel="noreferrer" className="rounded-md border border-[#2E2540] p-1.5 text-dim hover:text-[#E7B458]" aria-label="View treasury on Solana Explorer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="mt-2 text-[10px] text-dim">ATA: {shortAddr(d.collection.treasuryAta)} · mint: {shortAddr(d.collection.mint)} · {d.collection.decimals} decimals</div>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-dim">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E7B458]" />
                  Detection runs at `finalized` commitment every 60s; you can also paste a transaction signature below for instant verification. The platform never holds private keys.
                </div>
              </div>
              <div className="flex flex-col justify-between gap-3 rounded-lg border border-[#2E2540] bg-[#100D16] p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-dim">Renew subscription</div>
                  {d.entitlements.priceMonthlyUsd != null ? (
                    <div className="mt-1 text-sm text-secondary">
                      Extend the current <span className="font-semibold text-foreground">{d.plan}</span> period — {d.entitlements.priceMonthlyUsd} USDC / month, invoiced with a unique exact amount.
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-dim">Enterprise renewals are handled by contract (contact sales).</div>
                  )}
                </div>
                {canManage && d.entitlements.priceMonthlyUsd != null ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90" onClick={() => renew(1)}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Renew 1 month
                    </Button>
                    <Button size="sm" variant="outline" className="border-[#2E2540]" onClick={() => renew(12)}>Renew 12 months</Button>
                  </div>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard className="mt-5" title="Usage against entitlements" description="Limits are enforced server-side — the UI reflects the same values.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Meter label="Payments this month" used={d.usage.paymentsThisMonth} limit={d.usage.paymentsLimit} />
              <Meter label="Seats" used={d.usage.members} limit={d.usage.seatsLimit} />
              <Meter label="Active API keys" used={d.usage.activeKeys} limit={d.usage.apiKeysLimit} />
              <Meter label="Treasury wallets" used={d.usage.activeKeys === d.usage.apiKeysLimit ? 0 : d.usage.activeKeys} limit={d.entitlements.treasuryWallets} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className={cn('rounded-full border px-2.5 py-1', d.entitlements.multiApprover ? 'border-[#43D48E]/40 text-[#43D48E]' : 'border-[#2E2540] text-dim')}>Multi-approver policies {d.entitlements.multiApprover ? 'included' : 'not included'}</span>
              <span className={cn('rounded-full border px-2.5 py-1', d.entitlements.apiAccess ? 'border-[#43D48E]/40 text-[#43D48E]' : 'border-[#2E2540] text-dim')}>Developer API {d.entitlements.apiAccess ? 'included' : 'not included'}</span>
              <span className={cn('rounded-full border px-2.5 py-1', d.entitlements.exports ? 'border-[#43D48E]/40 text-[#43D48E]' : 'border-[#2E2540] text-dim')}>Financial exports {d.entitlements.exports ? 'included' : 'not included'}</span>
            </div>
          </SectionCard>

          <SectionCard className="mt-5" title="Plans" description="Upgrades issue a USDC invoice and activate on on-chain settlement. Downgrades apply immediately (no payment owed).">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {(d.plans ?? []).map((p) => {
                const isUpgrade = p.priceMonthlyUsd != null && p.priceMonthlyUsd > (d.entitlements.priceMonthlyUsd ?? 0)
                const isDowngrade = p.priceMonthlyUsd != null && p.priceMonthlyUsd <= (d.entitlements.priceMonthlyUsd ?? 0)
                return (
                  <div key={p.id} className={cn('rounded-xl border p-4', p.id === d.plan ? 'border-[#E7B458]/50 bg-[#E7B458]/5' : 'border-[#2E2540] bg-[#100D16]')}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{p.id}</span>
                      {p.id === d.plan ? <CheckCircle2 className="h-4 w-4 text-[#E7B458]" /> : null}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{p.priceMonthlyUsd != null ? `${p.priceMonthlyUsd} USDC/mo` : 'Custom'}</div>
                    <div className="mt-2 space-y-1 text-[11px] text-dim">
                      <div>{p.seats} seats · {p.maxBatchItems} batch items</div>
                      <div>{p.monthlyPayments.toLocaleString('en-US')} payments/mo</div>
                      <div>{p.apiKeys} API keys · {p.aiRequestsPerMonth.toLocaleString('en-US')} AI req/mo</div>
                    </div>
                    {canManage && p.id !== d.plan ? (
                      p.priceMonthlyUsd == null ? (
                        <Button size="sm" variant="outline" className="mt-3 w-full cursor-not-allowed border-[#2E2540]" disabled>
                          Contact sales
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => upgradeTo(p.id)}
                          variant="outline"
                          className={cn('mt-3 w-full', isUpgrade ? 'border-[#E7B458]/50 text-[#E7B458] hover:bg-[#E7B458]/10' : 'border-[#2E2540]')}
                        >
                          {isUpgrade ? `Pay ${p.priceMonthlyUsd} USDC` : `Switch to ${p.id}`}
                        </Button>
                      )
                    ) : null}
                    {isUpgrade && !canManage ? <div className="mt-3 text-[10px] text-dim">Upgrade requires billing access</div> : null}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#E7B458]/25 bg-[#E7B458]/5 p-3 text-[11px] text-[#E7B458]">
              <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {d.collectionNote}
            </div>
          </SectionCard>

          <SectionCard className="mt-5" title="Invoices" description="Each invoice amount is unique (micro-suffix) so an incoming transfer matches exactly one invoice.">
            {(d.invoices ?? []).length === 0 ? (
              <EmptyState
                icon={<CreditCard className="h-6 w-6" />}
                title="No invoices yet"
                description="Upgrade or renewal invoices appear here with their on-chain settlement state."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#2E2540]">
                <table className="w-full text-sm" style={{ minWidth: 760 }}>
                  <thead>
                    <tr className="border-b border-[#2E2540] bg-[#100D16]">
                      <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-dim">Kind</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-dim">Plan</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-dim">Amount</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-dim">Status</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-dim">Created</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-dim">Settled</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {(d.invoices ?? []).map((inv, i) => (
                      <tr key={`${inv.id}-${i}`} className="border-b border-[#231C30] transition-colors duration-150 last:border-0 hover:bg-[#1d1826]">
                        <td className="whitespace-nowrap px-3 py-3">{inv.kind === 'UPGRADE' ? 'Upgrade' : 'Renewal'}</td>
                        <td className="whitespace-nowrap px-3 py-3">{inv.plan}{inv.months > 1 ? ` ×${inv.months}mo` : ''}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums">{inv.amountUi} USDC</td>
                        <td className="px-3 py-3"><InvoiceStatusBadge status={inv.status} /></td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-dim">{formatDateTime(inv.createdAt)}</td>
                        <td className="px-3 py-3 text-xs">
                          {inv.explorerTx ? (
                            <a href={inv.explorerTx} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#E7B458] hover:underline">
                              {formatDateTime(inv.confirmedAt ?? inv.createdAt)} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : inv.status === 'PENDING' ? (
                            <button onClick={() => setActiveInvoiceId(inv.id)} className="text-[#F2BB62] hover:underline">View payment</button>
                          ) : (
                            <span className="text-dim">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          {inv.status === 'PENDING' && canManage ? (
                            <button onClick={() => cancelInvoice(inv.id)} className="text-xs text-dim hover:text-[#F27683]">Cancel</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard className="mt-5" title="Billing events">
            <div className="space-y-1.5">
              {(d.billingEvents ?? []).length === 0 ? <div className="text-xs text-dim">No billing events yet.</div> : null}
              {(d.billingEvents ?? []).map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-[#2E2540] bg-[#100D16] px-3 py-2 text-xs">
                  <span className="text-secondary">{e.type.replaceAll('_', ' ')}{typeof e.data?.to === 'string' ? ` → ${e.data.to}` : ''}{typeof e.data?.plan === 'string' && e.type !== 'PLAN_CHANGED' ? ` (${e.data.plan})` : ''}</span>
                  <span className="text-dim">{formatDateTime(e.createdAt)}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <PaymentDialog
            invoice={activeInvoice}
            onClose={() => { setActiveInvoiceId(null); setClaimSig('') }}
            claimSig={claimSig}
            setClaimSig={setClaimSig}
            verifying={verifying}
            onVerify={verifyNow}
            onCancel={() => activeInvoice && cancelInvoice(activeInvoice.id)}
          />
        </>
      ) : null}
    </div>
  )
}

function PaymentDialog({
  invoice,
  onClose,
  claimSig,
  setClaimSig,
  verifying,
  onVerify,
  onCancel,
}: {
  invoice: Invoice | null
  onClose: () => void
  claimSig: string
  setClaimSig: (v: string) => void
  verifying: boolean
  onVerify: () => void
  onCancel: () => void
}) {
  const [qr, setQr] = useState<{ id: string; url: string } | null>(null)
  const [qrErrorId, setQrErrorId] = useState<string | null>(null)

  useEffect(() => {
    if (!invoice || invoice.status !== 'PENDING' || !invoice.payUri) return
    let alive = true
    QRCode.toDataURL(invoice.payUri, { margin: 1, width: 232, color: { dark: '#100D16', light: '#F4F1EA' }, errorCorrectionLevel: 'M' })
      .then((url) => { if (alive) setQr({ id: invoice.id, url }) })
      .catch(() => { if (alive) setQrErrorId(invoice.id) })
    return () => { alive = false }
  }, [invoice?.id, invoice?.status, invoice?.payUri])

  const confirmed = invoice?.status === 'CONFIRMED'
  const pending = invoice?.status === 'PENDING'

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-[#2E2540] bg-[#15111D]">
        <DialogHeader>
          <DialogTitle className="text-left">
            {confirmed ? 'Payment confirmed' : invoice?.kind === 'UPGRADE' ? `Upgrade to ${invoice.plan}` : 'Renew subscription'}
          </DialogTitle>
          <DialogDescription className="text-left">
            {invoice ? `${invoice.plan}${invoice.months > 1 ? ` × ${invoice.months} months` : ''} — invoice created ${formatDateTime(invoice.createdAt)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {invoice ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#2E2540] bg-[#100D16] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-dim">Exact amount</div>
                  <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-[#E7B458]">{invoice.amountUi} <span className="text-sm text-secondary">USDC</span></div>
                </div>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <div className="mt-2 text-[11px] text-dim">
                Send this exact amount on <span className="text-secondary">{invoice.network}</span>. The unique suffix is how the payment is matched to this invoice.
              </div>
            </div>

            {pending ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
                  <div className="mx-auto rounded-xl border border-[#2E2540] bg-white p-2">
                    {qrErrorId === invoice.id ? (
                      <div className="flex h-[232px] w-[232px] flex-col items-center justify-center text-center text-xs text-[#F27683]" role="status">
                        QR unavailable — use the address below
                      </div>
                    ) : qr && qr.id === invoice.id ? (
                      <img src={qr.url} width={232} height={232} alt="Solana Pay QR code for this invoice" />
                    ) : (
                      <div className="flex h-[232px] w-[232px] flex-col items-center justify-center gap-2 text-xs text-dim" role="status" aria-live="polite">
                        <Loader2 className="h-4 w-4 animate-spin" /> Rendering QR…
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-dim">Treasury (Solana mainnet)</div>
                      <div className="mt-1 break-all font-mono text-[11px] text-secondary">{invoice.treasuryAddress}</div>
                      <div className="mt-1.5 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 border-[#2E2540] px-2 text-xs" onClick={() => copyText(invoice.treasuryAddress, 'Treasury address')}>
                          <Copy className="mr-1 h-3 w-3" /> Address
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 border-[#2E2540] px-2 text-xs" onClick={() => copyText(invoice.amountUi, 'Amount')}>
                          <Copy className="mr-1 h-3 w-3" /> Amount
                        </Button>
                        <a href={invoice.explorerTreasury} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-[#2E2540] px-2 text-xs text-dim hover:text-[#E7B458]">
                          <ExternalLink className="h-3 w-3" /> Explorer
                        </a>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-dim">
                      <QrCode className="mt-0.5 h-3 w-3 shrink-0 text-[#E7B458]" />
                      Scan with a Solana wallet (Phantom, Solflare…) — the Solana Pay URI pre-fills the exact USDC amount. On desktop, send manually with the exact amount shown.
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#F2BB62]/25 bg-[#F2BB62]/5 p-3">
                  <div className="text-xs font-medium text-[#F2BB62]">Already paid? Verify instantly</div>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={claimSig}
                      onChange={(e) => setClaimSig(e.target.value)}
                      placeholder="Paste the transaction signature"
                      className="min-w-0 flex-1 rounded-md border border-[#2E2540] bg-[#100D16] px-2.5 py-2 font-mono text-[11px] text-secondary placeholder:text-dim focus:border-[#E7B458]/50 focus:outline-none"
                      aria-label="Transaction signature"
                      spellCheck={false}
                    />
                    <Button size="sm" className="bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90" disabled={verifying || claimSig.trim().length < 64} onClick={onVerify}>
                      {verifying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
                      {verifying ? 'Reading chain…' : 'Verify payment'}
                    </Button>
                  </div>
                  <div className="mt-1.5 text-[10px] text-dim">
                    The platform fetches that transaction from the chain and checks the transfer to the treasury. Nothing is simulated; the invoice also settles automatically within ~1 minute of payment.
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-dim">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Expires {formatDateTime(invoice.expiresAt)}</span>
                  <button onClick={onCancel} className="text-[#F27683]/80 hover:text-[#F27683]">Cancel invoice</button>
                </div>
              </>
            ) : null}

            {confirmed ? (
              <div className="space-y-3 rounded-xl border border-[#43D48E]/30 bg-[#43D48E]/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[#43D48E]">
                  <CheckCircle2 className="h-4 w-4" /> {invoice.amountUi} USDC confirmed at finalized commitment
                </div>
                {invoice.explorerTx ? (
                  <a href={invoice.explorerTx} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#E7B458] hover:underline">
                    View settlement transaction <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                <div className="text-xs text-secondary">Entitlements are live — the plan change is reflected across the app immediately.</div>
              </div>
            ) : null}

            {invoice.status === 'EXPIRED' ? (
              <SetupRequiredState title="Invoice expired" detail="This invoice passed its validity window unpaid. Create a new invoice — amounts never stay valid forever." />
            ) : null}
            {invoice.status === 'CANCELLED' ? (
              <SetupRequiredState title="Invoice cancelled" detail="This invoice was cancelled before payment. No funds were credited from it." />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
