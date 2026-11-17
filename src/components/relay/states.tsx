'use client'

// Custom application states — branded error boundaries, boot/loading screens
// and skeleton loaders. Every asynchronous surface in the app falls back to one
// of these components instead of a generic spinner or a flash of empty data.
//
// Design language: PRD §8 — deep navy surfaces (#0E1725), hairline borders
// (#26374C), teal relay accent (#35D6C0), red for contained failures.

import React, { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── View-level error boundary ──────────────────────────────────────────────
// Next.js error.tsx catches failures at the page segment; inside a hash-routed
// SPA that means one crashing view would replace the entire shell including
// navigation. This boundary is mounted per-view so a crash is contained to the
// content area: the sidebar, topbar and session all stay alive.

type ViewBoundaryProps = { children: React.ReactNode; navigate: (to: string) => void }
type ViewBoundaryState = { error: Error | null; showDetail: boolean; copied: boolean }

export class ViewBoundary extends React.Component<ViewBoundaryProps, ViewBoundaryState> {
  state: ViewBoundaryState = { error: null, showDetail: false, copied: false }

  static getDerivedStateFromError(error: Error): Partial<ViewBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Ops breadcrumb — never swallowed silently.
    console.error('[relay:view-boundary]', error, info.componentStack)
  }

  render() {
    const { error, showDetail, copied } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto mt-8 flex max-w-lg flex-col items-center gap-4 rounded-xl border border-[#F27683]/25 bg-[#0E1725] px-6 py-10 text-center sm:px-8">
        <span className="relative flex h-14 w-14 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#F27683]/10" style={{ animationDuration: '2.4s' }} />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#F27683]/10">
            <AlertTriangle className="h-6 w-6 text-[#F27683]" />
          </span>
        </span>
        <div>
          <h2 className="text-base font-semibold">This view hit an unexpected error</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-dim">
            The failure was contained to this screen — your session, navigation and data are unaffected.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90"
            onClick={() => this.setState({ error: null, showDetail: false, copied: false })}
          >
            Try again
          </Button>
          <Button size="sm" variant="outline" className="border-[#26374C]" onClick={() => this.props.navigate('/app')}>
            Back to overview
          </Button>
        </div>
        <button
          className="flex items-center gap-1 text-[11px] text-dim hover:text-secondary"
          onClick={() => this.setState((s) => ({ showDetail: !s.showDetail }))}
          aria-expanded={showDetail}
        >
          Technical details <ChevronDown className={cn('h-3 w-3 transition-transform', showDetail && 'rotate-180')} />
        </button>
        {showDetail ? (
          <div className="w-full space-y-2 rounded-lg border border-[#26374C] bg-[#0B1220] p-3 text-left">
            <p className="break-words font-mono text-[11px] text-[#F27683]/90">{error.message || String(error)}</p>
            <button
              className="flex items-center gap-1.5 text-[11px] text-dim hover:text-[#35D6C0]"
              onClick={() => {
                const payload = `${error.message}\n\n${error.stack ?? ''}`
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(payload).then(
                    () => this.setState({ copied: true }),
                    () => undefined,
                  )
                }
              }}
            >
              {copied ? <Check className="h-3 w-3 text-[#36C995]" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy for support'}
            </button>
          </div>
        ) : null}
      </div>
    )
  }
}

// ─── Boot splash (session initialization) ───────────────────────────────────
// Branded first-paint screen shown while the session cookie is verified.

const BOOT_STAGES = ['Establishing secure session…', 'Verifying workspace access…', 'Preparing your relay…']

export function BootSplash() {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, BOOT_STAGES.length - 1)), 1100)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080D17] relay-grid-bg" role="status" aria-live="polite">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-[#35D6C0]/30" style={{ animationDuration: '2.2s' }} />
        <span className="absolute inset-0 animate-ping rounded-full border border-[#658CFF]/20" style={{ animationDuration: '2.2s', animationDelay: '0.9s' }} />
        <svg width="44" height="44" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="#35D6C0" strokeWidth="1.6" />
          <path d="M9 20.5 16 8l7 12.5" stroke="#35D6C0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12.2 17.4h7.6" stroke="#658CFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="mt-6 text-[15px] font-semibold tracking-tight">
        AZIMARA <span className="text-[#35D6C0]">RELAY</span>
      </div>
      <div className="mt-2 h-4 text-xs text-dim">{BOOT_STAGES[stage]}</div>
      <div className="mt-6 h-0.5 w-44 overflow-hidden rounded-full bg-[#142135]">
        <div className="relay-progress-bar h-full w-1/3 rounded-full bg-[#35D6C0]" />
      </div>
    </div>
  )
}

// ─── Skeleton primitives ────────────────────────────────────────────────────
// Shimmering placeholders shaped like the real content they replace, so
// layout doesn't jump when data arrives.

export function TableSkeleton({ rows = 6, cols = 4, minWidth = 640 }: { rows?: number; cols?: number; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#26374C]" aria-hidden>
      <div style={{ minWidth }}>
        <div className="flex gap-4 border-b border-[#1A293D] bg-[#0B1220] px-4 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className={cn('h-3 rounded bg-[#1B2A40]', i === 0 ? 'w-28' : 'flex-1')} style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-[#1A293D]/60 px-4 py-3.5 last:border-0">
            <div className="h-3 w-28 shrink-0 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: `${r * 70}ms` }} />
            <div className="h-3 min-w-0 flex-1 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: `${r * 70 + 40}ms` }} />
            <div className="hidden h-3 w-20 rounded bg-[#142135] relay-shimmer sm:block" style={{ animationDelay: `${r * 70 + 80}ms` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function MetricSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4">
          <div className="h-2.5 w-20 rounded bg-[#1B2A40] relay-shimmer" style={{ animationDelay: `${i * 90}ms` }} />
          <div className="mt-3 h-7 w-24 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: `${i * 90 + 50}ms` }} />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  const BARS = [42, 68, 35, 82, 55, 47, 74, 60, 38, 88, 52, 66]
  return (
    <div className="flex h-36 items-end gap-2 px-1" aria-hidden>
      {BARS.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-[#142135] relay-shimmer"
          style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-[#26374C]/60 bg-[#0E1725]/60 px-3 py-3">
          <div className="h-7 w-7 shrink-0 rounded-full bg-[#1B2A40] relay-shimmer" style={{ animationDelay: `${i * 60}ms` }} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-1/3 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: `${i * 60 + 30}ms` }} />
            <div className="h-2.5 w-2/3 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: `${i * 60 + 60}ms` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 rounded-lg border border-[#26374C]/60 px-4 py-3">
          <div className="h-2.5 w-24 rounded bg-[#1B2A40] relay-shimmer" style={{ animationDelay: `${i * 70}ms` }} />
          <div className="h-2.5 w-40 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: `${i * 70 + 40}ms` }} />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[#26374C] bg-[#0E1725] p-4" aria-hidden>
      <div className="h-3 w-28 rounded bg-[#1B2A40] relay-shimmer" />
      <div className="mt-3 space-y-2">
        <div className="h-2.5 w-full rounded bg-[#142135] relay-shimmer" style={{ animationDelay: '60ms' }} />
        <div className="h-2.5 w-5/6 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: '120ms' }} />
        <div className="h-2.5 w-2/3 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: '180ms' }} />
      </div>
    </div>
  )
}

export function PanelSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-[#26374C] bg-[#0B1220] px-3 py-2.5">
          <div className="h-2.5 w-32 rounded bg-[#142135] relay-shimmer" style={{ animationDelay: `${i * 80}ms` }} />
          <div className="h-2.5 w-16 rounded bg-[#1B2A40] relay-shimmer" style={{ animationDelay: `${i * 80 + 40}ms` }} />
        </div>
      ))}
    </div>
  )
}
