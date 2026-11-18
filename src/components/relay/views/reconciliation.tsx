'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo } from '@/lib/client/format'
import { PageHeader, StatusBadge, EmptyState, ErrorState, DataTable, SectionCard } from '../ui'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RefreshCw, Download, GitCompareArrows, ShieldAlert, Webhook } from 'lucide-react'

type ReconciliationData = {
  records: { id: string; payment: { id: string; reference: string; status: string } | null; providerRef: string | null; providerStatus: string | null; state: string; detail: string | null; expectedBase: string | null; observedBase: string | null; lastCheckedAt: string }[]
  webhookEvents: { id: string; eventType: string | null; signatureValid: boolean; status: string; transferRef: string | null; attempts: number; receivedAt: string; error: string | null }[]
  providerTransfers: { id: string; externalId: string; providerTransferId: string | null; providerStatus: string | null; internalPhase: string; paymentReference: string | null; updatedAt: string }[]
  summary: { matched: number; mismatched: number; unreconciled: number; failed: number; webhookRejected: number }
}

export function ReconciliationView() {
  const { navigate } = useRouter()
  const recon = useApi<ReconciliationData>(['reconciliation'], '/api/reconciliation', { refetchInterval: 30_000 })
  const [busy, setBusy] = useState(false)

  async function resyncAll() {
    setBusy(true)
    try {
      const res = await api<{ checked: number }>('/api/reconciliation/actions', { json: { action: 'resync_all' } })
      toast.success(`Reconciled ${res.checked} provider transfer(s)`)
      recon.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setBusy(false)
    }
  }

  const s = recon.data?.summary

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        description="Provider references, onchain evidence, expected vs observed amounts. Webhook delivery is never assumed — scheduled reconciliation is the fallback of record."
        breadcrumb={['Relay', 'Assurance', 'Reconciliation']}
        actions={
          <>
            <a href="/api/exports" download className="hidden" aria-hidden />
            <Button size="sm" variant="outline" className="border-[#1D2E42]" onClick={async () => {
              try {
                const res = await api<{ csv: string; rowCount: number }>('/api/exports', { json: { kind: 'RECONCILIATION', days: 90 } })
                if (typeof res?.csv !== 'string') {
                  toast.error('Export failed')
                  return
                }
                const blob = new Blob([res.csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `relay-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`
                a.click()
                URL.revokeObjectURL(url)
                toast.success(`Exported ${res.rowCount} rows`)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Export failed')
              }
            }}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button size="sm" onClick={resyncAll} disabled={busy} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Resync all
            </Button>
          </>
        }
      />

      {recon.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[#1D2E42] bg-[#101C2C] p-4">
              <div className="h-2 w-16 rounded bg-[#1A2C44] relay-shimmer" style={{ animationDelay: `${i * 80}ms` }} />
              <div className="mt-2.5 h-7 w-12 rounded bg-[#142436] relay-shimmer" style={{ animationDelay: `${i * 80 + 40}ms` }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[['Matched', s?.matched ?? 0, 'text-[#2ED3A6]'], ['Mismatched', s?.mismatched ?? 0, 'text-[#F27683]'], ['Unreconciled', s?.unreconciled ?? 0, 'text-[#F2BB62]'], ['Failed', s?.failed ?? 0, 'text-[#F27683]'], ['Rejected webhooks', s?.webhookRejected ?? 0, 'text-[#F2BB62]']].map(([label, value, color]) => (
            <div key={label as string} className="rounded-xl border border-[#1D2E42] bg-[#101C2C] p-4">
              <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <SectionCard className="mt-5" title="Reconciliation records" description="Provider + chain evidence per payment.">
        <DataTable
          loading={recon.isLoading}
          keyOf={(r) => r.id}
          rows={recon.data?.records ?? []}
          empty={<EmptyState icon={<GitCompareArrows className="h-8 w-8" />} title="Nothing to reconcile yet" description="Records appear as payments move through execution and settlement." />}
          columns={[
            { key: 'pay', header: 'Payment', render: (r) => r.payment ? <button className="font-mono text-xs text-[#39C6D8] hover:underline" onClick={() => navigate(`/app/payments/${r.payment!.id}`)}>{r.payment.reference}</button> : <span className="text-xs text-dim">—</span> },
            { key: 'ref', header: 'Provider ref', render: (r) => <span title={r.providerRef ?? undefined} className="block max-w-[12rem] truncate font-mono text-[10px] text-secondary">{r.providerRef ?? '—'}</span> },
            { key: 'ps', header: 'Provider', render: (r) => <span className="text-xs text-secondary">{r.providerStatus ?? '—'}</span> },
            { key: 'd', header: 'Detail', render: (r) => <span className="text-[11px] text-dim">{r.detail ?? ''}</span> },
            { key: 'when', header: 'Checked', render: (r) => <span className="text-xs text-dim">{timeAgo(r.lastCheckedAt)}</span> },
            { key: 'st', header: 'State', render: (r) => <StatusBadge status={r.state === 'MATCHED' ? 'COMPLETED' : r.state === 'FAILED' ? 'FAILED' : 'MANUAL_REVIEW'} label={r.state.replaceAll('_', ' ')} /> },
          ]}
        />
      </SectionCard>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Webhook inbox" description="Every delivery attempt persisted — valid or rejected — with HMAC verification state.">
          <DataTable
            keyOf={(w) => w.id}
            rows={recon.data?.webhookEvents ?? []}
            empty={<EmptyState icon={<Webhook className="h-7 w-7" />} title="No webhook events yet" description="Provider callbacks land here first, then process asynchronously." />}
            columns={[
              { key: 'e', header: 'Event', render: (w) => <span className="font-mono text-xs text-secondary">{w.eventType ?? 'unknown'}</span> },
              { key: 'sig', header: 'Signature', render: (w) => w.signatureValid ? <StatusBadge status="COMPLETED" label="Valid" /> : <StatusBadge status="FAILED" label="Invalid" /> },
              { key: 'st', header: 'Processing', render: (w) => <span className="text-xs text-dim">{w.status}</span> },
              { key: 'when', header: 'Received', render: (w) => <span className="text-xs text-dim">{timeAgo(w.receivedAt)}</span> },
            ]}
          />
        </SectionCard>
        <SectionCard title="Provider transfers" description="Idempotent references and lifecycle phases.">
          <DataTable
            keyOf={(t) => t.id}
            rows={recon.data?.providerTransfers ?? []}
            empty={<EmptyState icon={<ShieldAlert className="h-7 w-7" />} title="No provider transfers yet" description="Transfers appear when payments reach execution." />}
            columns={[
              { key: 'ext', header: 'External ID', render: (t) => <span title={t.externalId} className="block max-w-[12rem] truncate font-mono text-[10px] text-secondary">{t.externalId}</span> },
              { key: 'pid', header: 'Provider ref', render: (t) => <span title={t.providerTransferId ?? undefined} className="block max-w-[12rem] truncate font-mono text-[10px] text-secondary">{t.providerTransferId ?? '—'}</span> },
              { key: 'pay', header: 'Payment', render: (t) => <span className="font-mono text-[10px] text-[#39C6D8]">{t.paymentReference ?? '—'}</span> },
              { key: 'st', header: 'Status', render: (t) => <span className="text-xs text-dim">{t.providerStatus ?? t.internalPhase}</span> },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  )
}
