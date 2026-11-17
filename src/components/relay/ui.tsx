'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/client/format'

// Payment status tones per PRD §8.6 — every state visually distinct.
const TONES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  grey: { bg: 'bg-[#1B2A40]', text: 'text-[#A0AEC0]', border: 'border-[#26374C]', dot: 'bg-[#74849A]' },
  purple: { bg: 'bg-[#A18BEB]/10', text: 'text-[#A18BEB]', border: 'border-[#A18BEB]/30', dot: 'bg-[#A18BEB]' },
  blue: { bg: 'bg-[#658CFF]/10', text: 'text-[#658CFF]', border: 'border-[#658CFF]/30', dot: 'bg-[#658CFF]' },
  cyan: { bg: 'bg-[#35D6C0]/10', text: 'text-[#35D6C0]', border: 'border-[#35D6C0]/30', dot: 'bg-[#35D6C0]' },
  amber: { bg: 'bg-[#F2BB62]/10', text: 'text-[#F2BB62]', border: 'border-[#F2BB62]/30', dot: 'bg-[#F2BB62]' },
  green: { bg: 'bg-[#36C995]/10', text: 'text-[#36C995]', border: 'border-[#36C995]/30', dot: 'bg-[#36C995]' },
  red: { bg: 'bg-[#F27683]/10', text: 'text-[#F27683]', border: 'border-[#F27683]/30', dot: 'bg-[#F27683]' },
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'grey', VALIDATING: 'cyan', PENDING_APPROVAL: 'purple', APPROVED: 'blue',
  QUOTING: 'cyan', QUOTED: 'cyan', AWAITING_SIGNATURE: 'amber', FUNDING_BROADCAST: 'blue',
  FUNDING_CONFIRMED: 'blue', INITIALIZATION_BROADCAST: 'blue', PROCESSING: 'blue',
  SETTLEMENT_VERIFICATION: 'blue', COMPLETED: 'green', REJECTED: 'red', CANCELLED: 'grey',
  QUOTE_EXPIRED: 'grey', TRANSFER_EXPIRED: 'grey', FAILED: 'red', REFUNDED: 'purple',
  RECOVERABLE: 'amber', RESCUED: 'green', MANUAL_REVIEW: 'amber', RECONCILIATION_REQUIRED: 'amber',
  // batch statuses
  AWAITING_APPROVAL: 'purple', EXECUTING: 'blue', PARTIAL: 'amber',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = TONES[STATUS_TONE[status] ?? 'grey']
  const text = label ?? status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    // max-w + truncate: long lifecycle labels (e.g. "Settlement verification")
    // must not blow out narrow table cells or overview list rows on mobile.
    <span className={cn('inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', tone.bg, tone.text, tone.border)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
      <span className="truncate">{text}</span>
    </span>
  )
}

export function Amount({ base, decimals, symbol, className }: { base: string; decimals: number; symbol?: string; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{formatAmount(base, decimals, symbol)}</span>
}

export function MetricCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: 'teal' | 'purple' | 'amber' | 'red' | 'blue' }) {
  const accentClass = accent === 'teal' ? 'text-[#35D6C0]' : accent === 'purple' ? 'text-[#A18BEB]' : accent === 'amber' ? 'text-[#F2BB62]' : accent === 'red' ? 'text-[#F27683]' : accent === 'blue' ? 'text-[#658CFF]' : 'text-foreground'
  return (
    <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4 transition-colors duration-150 hover:bg-[#142135]">
      <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
      <div className={cn('mt-1.5 text-2xl font-semibold tabular-nums', accentClass)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-dim">{sub}</div> : null}
    </div>
  )
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: string; description?: string; actions?: React.ReactNode; breadcrumb?: string[] }) {
  return (
    <div className="mb-6">
      {breadcrumb?.length ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-dim">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[#26374C]">/</span>}
              <span>{b}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#26374C] bg-[#0E1725]/50 px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-[#35D6C0]">{icon}</div> : null}
      <div className="text-sm font-medium">{title}</div>
      {description ? <div className="mt-1 max-w-sm text-xs text-dim">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-xl border border-[#F27683]/30 bg-[#F27683]/5 px-4 py-3 text-sm text-[#F27683]">
      <div className="font-medium">Something went wrong</div>
      <div className="mt-1 text-xs opacity-80">{message}</div>
      {retry ? (
        <button onClick={retry} className="mt-2 rounded-md border border-[#F27683]/40 px-2.5 py-1 text-xs hover:bg-[#F27683]/10">
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function SetupRequiredState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#F2BB62]/30 bg-[#F2BB62]/5 px-4 py-3 text-sm text-[#F2BB62]">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs opacity-90">{detail}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function DataTable<T>({ rows, columns, empty, keyOf, minWidth = 640 }: {
  rows: T[]
  columns: { key: string; header: string; render: (row: T) => React.ReactNode; className?: string }[]
  empty?: React.ReactNode
  keyOf: (row: T) => string
  // min-width of the scrollable table: dense 6-8 column tables must scroll
  // horizontally on phones instead of compressing into unreadable columns.
  minWidth?: number
}) {
  if (rows.length === 0 && empty) return <>{empty}</>
  return (
    <div className="overflow-x-auto rounded-xl border border-[#26374C]">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-[#26374C] bg-[#0B1220]">
            {columns.map((c) => (
              <th key={c.key} className={cn('whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-dim md:px-4', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            // Index-suffixed keys: duplicate business keys (repeated names,
            // identical rows) must not break React reconciliation.
            <tr key={`${keyOf(row)}-${i}`} className="border-b border-[#1A293D] transition-colors duration-150 last:border-0 hover:bg-[#142135]">
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-3 align-middle md:px-4', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs', className)}>{children}</span>
}

export function SectionCard({ title, description, children, actions, className }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-[#26374C] bg-[#0E1725]', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A293D] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-dim">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}
