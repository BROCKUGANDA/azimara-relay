'use client'

import { useState } from 'react'
import { useApi } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo } from '@/lib/client/format'
import { PageHeader, EmptyState, ErrorState, DataTable } from '../ui'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Entry = { id: string; action: string; resourceType: string; resourceId: string | null; actorType: string; actorName: string | null; data: Record<string, unknown>; ip: string | null; createdAt: string }

export function AuditView() {
  const { navigate } = useRouter()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const audit = useApi<{ entries: Entry[]; total: number }>(['audit', q, page], `/api/audit?q=${encodeURIComponent(q)}&page=${page}&pageSize=40`)

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Immutable record of every consequential action. Financial records are never cascade-deleted."
        breadcrumb={['Relay', 'Administration', 'Audit trail']}
      />
      <Input placeholder="Search action, resource…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className="mb-4 w-64 border-[#26374C] bg-[#0B1220]" />
      {audit.isError ? <ErrorState message={String(audit.error)} retry={() => audit.refetch()} /> : null}
      <DataTable
        keyOf={(e) => e.id}
        rows={audit.data?.entries ?? []}
        empty={<EmptyState title="No audit entries match" description="Actions appear as soon as operations run." />}
        columns={[
          { key: 'action', header: 'Action', render: (e) => <span className="font-mono text-xs text-[#35D6C0]">{e.action}</span> },
          { key: 'resource', header: 'Resource', render: (e) => <span className="text-xs text-secondary">{e.resourceType}{e.resourceId ? <span className="text-dim"> · {e.resourceId.slice(0, 10)}…</span> : null}</span> },
          { key: 'actor', header: 'Actor', render: (e) => (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={`border text-[9px] ${e.actorType === 'SYSTEM' ? 'border-[#658CFF]/40 text-[#658CFF]' : e.actorType === 'AI' ? 'border-[#A18BEB]/40 text-[#A18BEB]' : e.actorType === 'API' ? 'border-[#35D6C0]/40 text-[#35D6C0]' : 'border-[#26374C] text-dim'}`}>{e.actorType}</Badge>
              <span className="text-xs text-secondary">{e.actorName ?? '—'}</span>
            </div>
          ) },
          { key: 'data', header: 'Context', render: (e) => <span className="line-clamp-1 max-w-xs text-[10px] text-dim">{JSON.stringify(e.data)}</span> },
          { key: 'ip', header: 'IP', render: (e) => <span className="font-mono text-[10px] text-dim">{e.ip ?? '—'}</span> },
          { key: 'when', header: 'When', render: (e) => <span className="text-xs text-dim">{timeAgo(e.createdAt)}</span> },
        ]}
      />
      {audit.data && audit.data.total > 40 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-dim">
          <span>Page {page} of {Math.ceil(audit.data.total / 40)}</span>
          <div className="flex gap-2">
            <button className="rounded border border-[#26374C] px-2 py-1 hover:bg-[#142135] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="rounded border border-[#26374C] px-2 py-1 hover:bg-[#142135] disabled:opacity-40" disabled={page >= Math.ceil(audit.data.total / 40)} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 text-[11px] text-dim">
        Exports: generate a full audit CSV from <button className="text-[#35D6C0] hover:underline" onClick={() => navigate('/app/reconciliation')}>Reconciliation → Export</button>.
      </div>
    </div>
  )
}
