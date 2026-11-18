'use client'

// AZIMARA RELAY — Custom widgets.
//
// Bespoke data-visualization widgets drawn as inline SVG (no chart library):
// Sparkline, RadialGauge, MiniBars, RingStat, DeltaBadge — plus the ⌘K
// CommandPalette. All animation is transform/opacity/stroke-dashoffset only,
// respects the motion preference, and degrades to static rendering.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Command as CommandPrimitive, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { useRouter } from '@/lib/client/store'
import { useSession } from '@/lib/client/store'
import { permissionsFor } from '@/lib/rbac'
import { motionAllowed } from '@/lib/client/motion'
import { cn } from '@/lib/utils'
import {
  GlyphSearch, GlyphCommand, GlyphBatches, GlyphApprovals, GlyphTreasury, GlyphOverview,
  GlyphWallet, GlyphRecipients, GlyphPayments, GlyphPolicies, GlyphSchedules,
  GlyphActivity, GlyphReconcile, GlyphAnalytics, GlyphIntelligence, GlyphKeys,
  GlyphIntegrations, GlyphTeam, GlyphAudit, GlyphBilling, GlyphSettings, GlyphLogout,
} from './glyphs'

// ─── Sparkline ──────────────────────────────────────────────────────────────
// Animated line + gradient area. Path length is measured after mount so the
// draw-in animation uses stroke-dashoffset (compositor-friendly).

export function Sparkline({
  data,
  color = '#39C6D8',
  width = 120,
  height = 36,
  area = true,
  animate = true,
  className,
  label,
}: {
  data: number[]
  color?: string
  width?: number
  height?: number
  area?: boolean
  animate?: boolean
  className?: string
  label?: string
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const [drawn, setDrawn] = useState(false)
  const [length, setLength] = useState(0)

  const { line, areaPath } = useMemo(() => {
    const pts = data.length >= 2 ? data : [data[0] ?? 0, data[0] ?? 0]
    const min = Math.min(...pts)
    const max = Math.max(...pts)
    const span = max - min || 1
    const step = width / (pts.length - 1)
    const coords = pts.map((v, i) => {
      const x = i * step
      const y = height - 3 - ((v - min) / span) * (height - 6)
      return [x, y] as const
    })
    const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    return { line: d, areaPath: `${d} L${width},${height} L0,${height} Z` }
  }, [data, width, height])

  useEffect(() => {
    if (!pathRef.current) return
    const len = pathRef.current.getTotalLength()
    setLength(len)
    if (!animate || !motionAllowed()) setDrawn(true)
    else {
      const raf = requestAnimationFrame(() => setDrawn(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [line, animate])

  const gid = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, [])

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={label ?? 'Trend'}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area ? <path d={areaPath} fill={`url(#${gid})`} style={{ opacity: drawn ? 1 : 0, transition: 'opacity 600ms ease 300ms' }} /> : null}
      <path
        ref={pathRef}
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: length || undefined,
          strokeDashoffset: drawn ? 0 : length || undefined,
          transition: length ? `stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)` : undefined,
        }}
      />
    </svg>
  )
}

// ─── RadialGauge ────────────────────────────────────────────────────────────
// Circular progress with animated arc + center content.

export function RadialGauge({
  value,
  max = 100,
  size = 92,
  stroke = 7,
  color = '#39C6D8',
  trackColor = '#1A2C44',
  children,
  className,
  label,
}: {
  value: number
  max?: number
  size?: number
  stroke?: number
  color?: string
  trackColor?: string
  children?: React.ReactNode
  className?: string
  label?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(Math.max(value / (max || 1), 0), 1)
  const [offset, setOffset] = useState(c)
  const allow = motionAllowed()

  useEffect(() => {
    const target = c * (1 - pct)
    if (!allow) {
      // Defer a frame — avoids a synchronous setState inside the effect.
      const raf = requestAnimationFrame(() => setOffset(target))
      return () => cancelAnimationFrame(raf)
    }
    const start = offset
    const t0 = performance.now()
    let frame: number
    const tick = (now: number) => {
      const t = Math.min((now - t0) / 700, 1)
      const eased = 1 - Math.pow(2, -10 * t)
      setOffset(start + (target - start) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [c, pct])

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} role="img" aria-label={label ?? `Gauge ${Math.round(pct * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ─── MiniBars ───────────────────────────────────────────────────────────────
// Staggered bar column set — cheap, dependency-free histogram.

export function MiniBars({
  data,
  color = '#F17FA8',
  height = 40,
  className,
  label,
}: {
  data: number[]
  color?: string
  height?: number
  className?: string
  label?: string
}) {
  const max = Math.max(...data, 1)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className={cn('flex items-end gap-[3px]', className)} style={{ height }} role="img" aria-label={label ?? 'Distribution'}>
      {data.map((v, i) => (
        <span
          key={i}
          className="w-full min-w-[3px] rounded-t-[2px]"
          style={{
            height: `${Math.max((v / max) * 100, 6)}%`,
            backgroundColor: color,
            opacity: 0.35 + (v / max) * 0.65,
            transform: shown ? 'scaleY(1)' : 'scaleY(0.05)',
            transformOrigin: 'bottom',
            transition: shown ? `transform 500ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 40}ms` : undefined,
          }}
        />
      ))}
    </div>
  )
}

// ─── RingStat ───────────────────────────────────────────────────────────────
// Compact KPI: gauge + label + delta sub-line.

export function RingStat({
  label,
  value,
  max = 100,
  color = '#39C6D8',
  sub,
  className,
}: {
  label: string
  value: number
  max?: number
  color?: string
  sub?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3.5', className)}>
      <RadialGauge value={value} max={max} color={color} size={64} stroke={6} label={label}>
        <span className="text-[13px] font-semibold tabular-nums">{Math.round((value / (max || 1)) * 100)}%</span>
      </RadialGauge>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
        {sub ? <div className="mt-1 text-xs text-secondary">{sub}</div> : null}
      </div>
    </div>
  )
}

// ─── DeltaBadge ─────────────────────────────────────────────────────────────
// Up/down change indicator with animated arrow.

export function DeltaBadge({ delta, suffix = '%', className }: { delta: number; suffix?: string; className?: string }) {
  const up = delta >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        up ? 'bg-[#2ED3A6]/10 text-[#2ED3A6]' : 'bg-[#F27683]/10 text-[#F27683]',
        className,
      )}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className={cn('transition-transform duration-300', up ? '' : 'rotate-180')}>
        <path d="M5 1.5 8.5 6H1.5L5 1.5Z" fill="currentColor" />
        <path d="M5 6v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {Math.abs(delta).toFixed(1)}
      {suffix}
    </span>
  )
}

// ─── CommandPalette ─────────────────────────────────────────────────────────
// ⌘K global launcher: navigation + quick actions, permission-filtered.

export type PaletteAction = {
  path: string
  label: string
  group: string
  glyph?: React.ReactNode
  permission?: string
  keywords?: string
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { navigate } = useRouter()
  const session = useSession()
  const permissions = permissionsFor(session.activeOrg?.role ?? 'ANALYST')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = useCallback(
    (path: string) => {
      onOpenChange(false)
      navigate(path)
    },
    [navigate, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-[#1D2E42] bg-[#0D1622]/95 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:max-w-xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <CommandPrimitive className="text-foreground" loop>
          <div className="flex items-center gap-2.5 border-b border-[#16273C] px-4">
            <GlyphSearch size={15} className="text-dim" />
            <CommandInput
              placeholder="Search views and actions…"
              className="h-11 w-full border-0 bg-transparent text-sm outline-none placeholder:text-dim focus:ring-0"
            />
            <kbd className="rounded border border-[#1D2E42] bg-[#142436] px-1.5 py-0.5 font-mono text-[10px] text-dim">ESC</kbd>
          </div>
          <CommandList className="max-h-[50vh] py-2">
            <CommandEmpty className="px-4 py-6 text-center text-xs text-dim">No matching command</CommandEmpty>
            <CommandGroup heading="Quick actions" className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-dim">
              <PaletteItem glyph={<GlyphCommand size={15} />} label="New payment" keywords="create send transfer" onRun={() => go('/app/payments/new')} show={permissions.includes('payment:create' as never)} />
              <PaletteItem glyph={<GlyphBatches size={15} />} label="New batch payout" keywords="bulk csv" onRun={() => go('/app/batches')} show={permissions.includes('payment:create' as never)} />
              <PaletteItem glyph={<GlyphApprovals size={15} />} label="Review pending approvals" keywords="approve sign" onRun={() => go('/app/approvals')} />
              <PaletteItem glyph={<GlyphTreasury size={15} />} label="Open treasury" keywords="balance wallets" onRun={() => go('/app/treasury')} />
              <PaletteItem
                glyph={<GlyphLogout size={15} />}
                label="Sign out"
                keywords="logout exit session"
                onRun={() => {
                  onOpenChange(false)
                  void useSession.getState().signOut().then(() => navigate('/'))
                }}
              />
            </CommandGroup>
            <CommandGroup heading="Navigate" className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-dim">
              <PaletteItem glyph={<GlyphOverview size={15} />} label="Overview" keywords="dashboard home" onRun={() => go('/app')} />
              <PaletteItem glyph={<GlyphWallet size={15} />} label="Wallets" keywords="connect solana" onRun={() => go('/app/wallets')} />
              <PaletteItem glyph={<GlyphRecipients size={15} />} label="Recipients" keywords="counterparty address book" onRun={() => go('/app/recipients')} />
              <PaletteItem glyph={<GlyphPayments size={15} />} label="Payments" keywords="history lifecycle" onRun={() => go('/app/payments')} />
              <PaletteItem glyph={<GlyphPolicies size={15} />} label="Approval policies" keywords="rules thresholds" onRun={() => go('/app/policies')} />
              <PaletteItem glyph={<GlyphSchedules size={15} />} label="Schedules" keywords="recurring" onRun={() => go('/app/schedules')} />
              <PaletteItem glyph={<GlyphActivity size={15} />} label="Activity" keywords="transactions" onRun={() => go('/app/transactions')} />
              <PaletteItem glyph={<GlyphReconcile size={15} />} label="Reconciliation" keywords="match ledger" onRun={() => go('/app/reconciliation')} />
              <PaletteItem glyph={<GlyphAnalytics size={15} />} label="Analytics" keywords="volume trends" onRun={() => go('/app/analytics')} />
              <PaletteItem glyph={<GlyphIntelligence size={15} />} label="Relay Intelligence" keywords="ai insights risk" onRun={() => go('/app/intelligence')} />
              <PaletteItem glyph={<GlyphKeys size={15} />} label="API keys" keywords="token secret" onRun={() => go('/app/api-keys')} show={permissions.includes('apikey:manage' as never)} />
              <PaletteItem glyph={<GlyphIntegrations size={15} />} label="Integrations" keywords="routing provider rpc payments" onRun={() => go('/app/integrations')} />
              <PaletteItem glyph={<GlyphTeam size={15} />} label="Team" keywords="members invite roles" onRun={() => go('/app/team')} />
              <PaletteItem glyph={<GlyphAudit size={15} />} label="Audit trail" keywords="logs immutable" onRun={() => go('/app/audit')} />
              <PaletteItem glyph={<GlyphBilling size={15} />} label="Billing" keywords="plan usage invoice" onRun={() => go('/app/billing')} />
              <PaletteItem glyph={<GlyphSettings size={15} />} label="Settings" keywords="security mfa preferences" onRun={() => go('/app/settings')} />
            </CommandGroup>
          </CommandList>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  )
}

function PaletteItem({ glyph, label, keywords, onRun, show = true }: { glyph?: React.ReactNode; label: string; keywords?: string; onRun: () => void; show?: boolean }) {
  if (!show) return null
  return (
    <CommandItem
      onSelect={onRun}
      keywords={keywords?.split(' ')}
      className="mx-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-secondary transition-colors data-[selected=true]:bg-[#142436] data-[selected=true]:text-[#39C6D8]"
    >
      <span className="text-dim">{glyph}</span>
      {label}
    </CommandItem>
  )
}

