'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/client/format'
import { TableSkeleton } from './states'
import { Tilt3D, CountUp, Reveal } from './motion'

// Payment status tones per PRD §8.6 — every state visually distinct.
const TONES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  grey: { bg: 'bg-[#1A2C44]', text: 'text-[#8FA5BC]', border: 'border-[#1D2E42]', dot: 'bg-[#64798F]' },
  purple: { bg: 'bg-[#8AA2F0]/10', text: 'text-[#8AA2F0]', border: 'border-[#8AA2F0]/30', dot: 'bg-[#8AA2F0]' },
  blue: { bg: 'bg-[#F17FA8]/10', text: 'text-[#F17FA8]', border: 'border-[#F17FA8]/30', dot: 'bg-[#F17FA8]' },
  cyan: { bg: 'bg-[#39C6D8]/10', text: 'text-[#39C6D8]', border: 'border-[#39C6D8]/30', dot: 'bg-[#39C6D8]' },
  amber: { bg: 'bg-[#F2BB62]/10', text: 'text-[#F2BB62]', border: 'border-[#F2BB62]/30', dot: 'bg-[#F2BB62]' },
  green: { bg: 'bg-[#2ED3A6]/10', text: 'text-[#2ED3A6]', border: 'border-[#2ED3A6]/30', dot: 'bg-[#2ED3A6]' },
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
  const live = ['PENDING_APPROVAL', 'AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'PROCESSING', 'VALIDATING', 'QUOTING', 'EXECUTING'].includes(status)
  return (
    // max-w + truncate: long lifecycle labels (e.g. "Settlement verification")
    // must not blow out narrow table cells or overview list rows on mobile.
    <span className={cn('inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', tone.bg, tone.text, tone.border)}>
      {live ? (
        // In-flight states get a breathing beacon instead of a static dot.
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: 'currentColor', opacity: 0.5, animationDuration: '1.6s' }} />
          <span className="relative h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }} />
        </span>
      ) : (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
      )}
      <span className="truncate">{text}</span>
    </span>
  )
}

export function Amount({ base, decimals, symbol, className }: { base: string; decimals: number; symbol?: string; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{formatAmount(base, decimals, symbol)}</span>
}

const METRIC_GLOW: Record<string, string> = {
  teal: 'rgba(57, 198, 216, 0.10)',
  purple: 'rgba(138, 162, 240, 0.10)',
  amber: 'rgba(242, 187, 98, 0.10)',
  red: 'rgba(242, 118, 131, 0.10)',
  blue: 'rgba(241, 127, 168, 0.10)',
}

export function MetricCard({ label, value, sub, accent, countUp = false }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: 'teal' | 'purple' | 'amber' | 'red' | 'blue'; countUp?: boolean }) {
  const accentClass = accent === 'teal' ? 'text-[#39C6D8]' : accent === 'purple' ? 'text-[#8AA2F0]' : accent === 'amber' ? 'text-[#F2BB62]' : accent === 'red' ? 'text-[#F27683]' : accent === 'blue' ? 'text-[#F17FA8]' : 'text-foreground'
  const glow = accent ? METRIC_GLOW[accent] : 'rgba(232, 241, 247, 0.05)'
  const numeric = typeof value === 'number'
  return (
    <Tilt3D
      max={3}
      glare
      className="group relative rounded-xl border border-[#1D2E42] bg-[#101C2C] p-4 transition-colors duration-150 hover:border-[#39C6D8]/25 hover:bg-[#142436]"
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.02)` }}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
      <div className={cn('mt-1.5 text-2xl font-semibold tabular-nums', accentClass)}>
        {numeric && countUp ? <CountUp value={value as number} /> : value}
      </div>
      {sub ? <div className="mt-1 text-xs text-dim">{sub}</div> : null}
      {/* Accent wash that brightens on hover — pure opacity animation. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(120% 90% at 50% -10%, ${glow}, transparent 60%)` }}
      />
    </Tilt3D>
  )
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: string; description?: string; actions?: React.ReactNode; breadcrumb?: string[] }) {
  return (
    <div className="mb-6">
      {breadcrumb?.length ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-dim">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[#1D2E42]">/</span>}
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#1D2E42] bg-[#101C2C]/50 px-6 py-14 text-center">
      {icon ? (
        // Glyph floats gently + casts a teal halo — the empty state feels
        // alive instead of like a dead end.
        <div className="relay-float mb-3 text-[#39C6D8] drop-shadow-[0_0_18px_rgba(57,198,216,0.35)]">{icon}</div>
      ) : null}
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

export function DataTable<T>({ rows, columns, empty, keyOf, minWidth = 640, loading, skeletonRows, skeletonCols }: {
  rows: T[]
  columns: { key: string; header: string; render: (row: T) => React.ReactNode; className?: string }[]
  empty?: React.ReactNode
  keyOf: (row: T) => string
  // min-width of the scrollable table: dense 6-8 column tables must scroll
  // horizontally on phones instead of compressing into unreadable columns.
  minWidth?: number
  // While the first load is in flight, render a shimmer skeleton shaped like
  // the table instead of flashing the empty state before data arrives.
  loading?: boolean
  skeletonRows?: number
  skeletonCols?: number
}) {
  if (loading) return <TableSkeleton rows={skeletonRows} cols={skeletonCols ?? Math.min(columns.length, 5)} minWidth={minWidth} />
  if (rows.length === 0 && empty) return <>{empty}</>
  return (
    <div className="overflow-x-auto rounded-xl border border-[#1D2E42]">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-[#1D2E42] bg-[#0D1622]">
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
            // Staggered entrance: CSS-only, transform/opacity, capped at 360ms
            // so long lists never feel slow; motion-off/reduced-motion kill it.
            <tr
              key={`${keyOf(row)}-${i}`}
              className="relay-row-in border-b border-[#16273C] transition-colors duration-150 last:border-0 hover:bg-[#142436]"
              style={{ animationDelay: `${Math.min(i * 26, 360)}ms` }}
            >
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
    // Scroll reveal wrapper: every card rises gently into view. Reveal gates
    // itself on the motion preference and renders statically when off.
    <Reveal as="section" variant="rise" className={cn('rounded-xl border border-[#1D2E42] bg-[#101C2C]', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#16273C] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-dim">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </Reveal>
  )
}
