'use client'

import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { timeAgo } from '@/lib/client/format'
import { PageHeader, EmptyState, ErrorState, SectionCard } from '../ui'
import { History, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Entry = { id: string; action: string; resourceType: string; resourceId: string | null; actorType: string; actorName: string | null; data: Record<string, unknown>; createdAt: string }

export function ActivityView() {
  const { navigate } = useRouter()
  const activity = useApi<{ events: Entry[] }>(['activity'], '/api/activity?limit=60')

  function iconFor(action: string) {
    if (action.includes('APPROV') || action.includes('SETTLED')) return 'text-[#36C995]'
    if (action.includes('FAIL') || action.includes('REJECT')) return 'text-[#F27683]'
    if (action.includes('WARN') || action.includes('REQUIRED')) return 'text-[#F2BB62]'
    return 'text-[#658CFF]'
  }

  return (
    <div>
      <PageHeader
        title="Activity"
        description="Chronological organization events — payments, approvals, integrations, security."
        breadcrumb={['Relay', 'Assurance', 'Activity']}
        actions={
          <Button size="sm" variant="outline" className="border-[#26374C]" onClick={async () => {
            try {
              const res = await api<{ csv: string }>('/api/exports', { json: { kind: 'AUDIT', days: 90 } })
              const blob = new Blob([res.csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `relay-activity-${new Date().toISOString().slice(0, 10)}.csv`
              a.click()
              URL.revokeObjectURL(url)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Export failed')
              navigate('/app/audit')
            }
          }}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        }
      />
      {activity.isError ? <ErrorState message={String(activity.error)} retry={() => activity.refetch()} /> : null}
      <SectionCard title="Recent events">
        {(activity.data?.events ?? []).length === 0 ? (
          <EmptyState icon={<History className="h-8 w-8" />} title="No activity yet" description="Organization events appear here as operations run." />
        ) : (
          <ol className="relative ml-3 space-y-0 border-l border-[#26374C]">
            {(activity.data?.events ?? []).map((e) => (
              <li key={e.id} className="relative flex items-start gap-3 pb-4 pl-5 last:pb-0">
                <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-current ${iconFor(e.action)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-secondary">{e.action}</span>
                    <span className="rounded bg-[#142135] px-1.5 py-0.5 text-[9px] uppercase text-dim">{e.actorType}</span>
                    {e.actorName ? <span className="text-[10px] text-dim">{e.actorName}</span> : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-dim">
                    {e.resourceType}{e.resourceId ? ` · ${e.resourceId.slice(0, 14)}…` : ''} · {timeAgo(e.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  )
}
