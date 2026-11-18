'use client'

import { useEffect, useRef, useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { timeAgo } from '@/lib/client/format'
import { PageHeader, EmptyState, ErrorState, DataTable } from '../ui'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { haptic } from '@/lib/client/motion'

type Entry = { id: string; action: string; resourceType: string; resourceId: string | null; actorType: string; actorName: string | null; data: Record<string, unknown>; ip: string | null; createdAt: string }

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

export function AuditView() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const debouncedQ = useDebouncedValue(q, 300)
  const audit = useApi<{ entries: Entry[]; total: number }>(['audit', debouncedQ, page], `/api/audit?q=${encodeURIComponent(debouncedQ)}&page=${page}&pageSize=40`)

  // Direct CSV export — no detour through another view required.
  function exportCsv() {
    haptic('select')
    toast.promise(
      api<{ id: string; rowCount: number; csv: string }>('/api/exports', { json: { kind: 'AUDIT', days: 90 } }).then((res) => {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `azimara-audit-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return res
      }),
      { loading: 'Building audit CSV…', success: (res) => `Exported ${res.rowCount} audit entries (last 90 days)`, error: (e) => e instanceof Error ? e.message : 'Export failed' },
    )
  }

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Immutable record of every consequential action. Financial records are never cascade-deleted."
        breadcrumb={['Relay', 'Administration', 'Audit trail']}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search action, resource…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className="w-full border-[#1D2E42] bg-[#0D1622] sm:w-64" />
        <button onClick={exportCsv} className="inline-flex h-9 items-center rounded-md border border-[#1D2E42] px-3 text-xs text-secondary transition-colors hover:bg-[#142436] hover:text-foreground">
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV (90 days)
        </button>
      </div>
      {audit.isError ? <ErrorState message={String(audit.error)} retry={() => audit.refetch()} /> : null}
      <DataTable
        loading={audit.isLoading}
        keyOf={(e) => e.id}
        rows={audit.data?.entries ?? []}
        empty={<EmptyState title="No audit entries match" description="Actions appear as soon as operations run." />}
        columns={[
          { key: 'action', header: 'Action', render: (e) => <span className="font-mono text-xs text-[#39C6D8]">{e.action}</span> },
          { key: 'resource', header: 'Resource', render: (e) => <span className="text-xs text-secondary">{e.resourceType}{e.resourceId ? <span className="text-dim"> · {e.resourceId.slice(0, 10)}…</span> : null}</span> },
          { key: 'actor', header: 'Actor', render: (e) => (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={`border text-[9px] ${e.actorType === 'SYSTEM' ? 'border-[#F17FA8]/40 text-[#F17FA8]' : e.actorType === 'AI' ? 'border-[#8AA2F0]/40 text-[#8AA2F0]' : e.actorType === 'API' ? 'border-[#39C6D8]/40 text-[#39C6D8]' : 'border-[#1D2E42] text-dim'}`}>{e.actorType}</Badge>
              <span className="text-xs text-secondary">{e.actorName ?? '—'}</span>
            </div>
          ) },
          { key: 'data', header: 'Context', render: (e) => <span className="line-clamp-1 max-w-xs text-[10px] text-dim">{JSON.stringify(e.data ?? {})}</span> },
          { key: 'ip', header: 'IP', render: (e) => <span className="font-mono text-[10px] text-dim">{e.ip ?? '—'}</span> },
          { key: 'when', header: 'When', render: (e) => <span className="text-xs text-dim">{timeAgo(e.createdAt)}</span> },
        ]}
      />
      {audit.data && audit.data.total > 40 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-dim">
          <span>Page {page} of {Math.ceil(audit.data.total / 40)}</span>
          <div className="flex gap-2">
            <button className="min-h-9 rounded border border-[#1D2E42] px-3 py-2 hover:bg-[#142436] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="min-h-9 rounded border border-[#1D2E42] px-3 py-2 hover:bg-[#142436] disabled:opacity-40" disabled={page >= Math.ceil(audit.data.total / 40)} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 text-[11px] text-dim">
        Longer windows and ledger/reconciliation exports: <span className="text-secondary">Reconciliation → Export</span>.
      </div>
    </div>
  )
}
