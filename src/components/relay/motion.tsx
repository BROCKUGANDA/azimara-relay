'use client'

// AZIMARA RELAY — Motion primitives.
//
// Reusable building blocks for micro (press, hover, count) and macro
// (scroll reveals, staggered entrances) animation. Everything here:
//  - respects prefers-reduced-motion AND the in-app motion preference;
//  - animates transform/opacity only (compositor-safe, no layout thrash);
//  - cleans up every listener/observer/frame on unmount;
//  - degrades to static rendering when effects are off.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { motionAllowed, depthAllowed, MOTION, haptic } from '@/lib/client/motion'

// ─── Reveal ─────────────────────────────────────────────────────────────────
// Scroll-triggered entrance. Fires once, then disconnects the observer.

type RevealVariant = 'rise' | 'fade' | 'scale' | 'left' | 'right' | 'blur'

const REVEAL_CLASS: Record<RevealVariant, string> = {
  rise: 'relay-reveal-rise',
  fade: 'relay-reveal-fade',
  scale: 'relay-reveal-scale',
  left: 'relay-reveal-left',
  right: 'relay-reveal-right',
  blur: 'relay-reveal-blur',
}

export function Reveal({
  children,
  variant = 'rise',
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  variant?: RevealVariant
  /** Stagger offset in ms. */
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'span'
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!motionAllowed()) {
      // Defer one frame so the reveal state lands after paint — avoids a
      // synchronous setState-in-effect (cascading render).
      const raf = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(raf)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            io.disconnect()
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={cn(shown ? REVEAL_CLASS[variant] : 'relay-reveal-hidden', className)}
      style={delay ? ({ transitionDelay: `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  )
}

// ─── Stagger ────────────────────────────────────────────────────────────────
// Wraps children in a parent that passes index-based reveal delays.

export function Stagger({ children, step = 60, className, as: Tag = 'div' }: { children: React.ReactNode[] | React.ReactNode; step?: number; className?: string; as?: 'div' | 'ul' }) {
  const items = React.Children.toArray(children)
  return (
    <Tag className={className}>
      {items.map((child, i) => (
        <Reveal key={i} delay={i * step} as="div">
          {child}
        </Reveal>
      ))}
    </Tag>
  )
}

// ─── Tilt3D ─────────────────────────────────────────────────────────────────
// Perspective tilt with a moving glare highlight. Pointer-fine devices only;
// rotation is capped (±5°) so content stays readable; listeners are passive
// and writes are batched through rAF.

export function Tilt3D({
  children,
  className,
  max = 5,
  glare = true,
  scale = 1.008,
  onClick,
  onPointerDown,
  style,
  ...rest
}: {
  children: React.ReactNode
  className?: string
  max?: number
  glare?: boolean
  scale?: number
  onClick?: (e: React.MouseEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  style?: React.CSSProperties
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'onPointerDown' | 'style'>) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const [enabled, setEnabled] = useState(false)

  // Defer the capability check a frame: pointer effects never matter on the
  // first paint, and this avoids a synchronous setState inside the effect.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEnabled(depthAllowed()))
    return () => cancelAnimationFrame(raf)
  }, [])

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!enabled || !ref.current) return
      cancelAnimationFrame(frame.current)
      const el = ref.current
      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      frame.current = requestAnimationFrame(() => {
        const rx = (0.5 - py) * max * 2
        const ry = (px - 0.5) * max * 2
        el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`
        if (glare) el.style.setProperty('--glare-x', `${(px * 100).toFixed(1)}%`)
        if (glare) el.style.setProperty('--glare-y', `${(py * 100).toFixed(1)}%`)
      })
    },
    [enabled, max, scale, glare],
  )

  const onLeave = useCallback(() => {
    if (!ref.current) return
    cancelAnimationFrame(frame.current)
    ref.current.style.transform = ''
  }, [])

  if (!enabled) {
    // Static rendering path — no listeners, no observers.
    return (
      <div ref={ref} className={className} onClick={onClick} onPointerDown={onPointerDown} style={style} {...rest}>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={cn('relay-tilt', glare && 'relay-tilt-glare', className)}
      onPointerMove={(e) => onMove(e.nativeEvent)}
      onPointerLeave={onLeave}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={style}
      {...rest}
    >
      {children}
    </div>
  )
}

// ─── MagneticButton ─────────────────────────────────────────────────────────
// CTA that leans toward the cursor and springs back. Fires a light haptic on
// activation for tactile parity with the rest of the shell.

export function MagneticButton({
  children,
  className,
  strength = 8,
  onClick,
  hapticEvent = 'tap',
  ...rest
}: {
  children: React.ReactNode
  className?: string
  strength?: number
  onClick?: (e: React.MouseEvent) => void
  hapticEvent?: Parameters<typeof haptic>[0]
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const ref = useRef<HTMLButtonElement>(null)
  const frame = useRef(0)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEnabled(depthAllowed()))
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
      const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        ref.current!.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * (strength * 0.6)).toFixed(1)}px)`
      })
    },
    [enabled, strength],
  )

  return (
    <button
      ref={ref}
      className={cn('relay-magnetic', className)}
      onPointerMove={handleMove}
      onPointerLeave={() => {
        if (ref.current) ref.current.style.transform = ''
      }}
      onClick={(e) => {
        haptic(hapticEvent)
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

// ─── CountUp ────────────────────────────────────────────────────────────────
// rAF number roll-in with easeOutExpo. Re-animates when the target changes.
// Never animates when motion is off — renders the final value directly.

export function CountUp({
  value,
  duration = MOTION.duration.slow,
  format,
  className,
}: {
  value: number
  duration?: number
  /** Custom formatter — defaults to grouped integers. */
  format?: (n: number) => string
  className?: string
}) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('en-US'))

  useEffect(() => {
    if (!motionAllowed() || !Number.isFinite(value)) {
      // Defer so the static value lands after paint (no cascading render).
      const raf = requestAnimationFrame(() => {
        setDisplay(value)
        fromRef.current = value
      })
      return () => cancelAnimationFrame(raf)
    }
    const from = fromRef.current
    const start = performance.now()
    let frame: number
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(2, -10 * t) // easeOutExpo
      const next = from + (value - from) * (t === 1 ? 1 : eased)
      setDisplay(next)
      if (t < 1) frame = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span className={cn('tabular-nums', className)}>{fmt(display)}</span>
}

// ─── PulseDot ───────────────────────────────────────────────────────────────
// Live status indicator: a steady core with an expanding ring pulse.

export function PulseDot({ color = '#E7B458', size = 8, className }: { color?: string; size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-flex', className)} style={{ width: size, height: size }} aria-hidden>
      <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: color, opacity: 0.4, animationDuration: '1.8s' }} />
      <span className="relative inline-flex h-full w-full rounded-full" style={{ backgroundColor: color }} />
    </span>
  )
}

// ─── ProgressFlow ───────────────────────────────────────────────────────────
// Horizontal lifecycle pipeline (macro widget for the 23-state machine).
// `steps` are labels; `current` index fills everything before it.

export function ProgressFlow({
  steps,
  current,
  tone = 'teal',
  className,
}: {
  steps: string[]
  current: number
  tone?: 'teal' | 'blue' | 'purple' | 'amber' | 'green' | 'red'
  className?: string
}) {
  const toneHex = { teal: '#E7B458', blue: '#F17FA8', purple: '#B79BF0', amber: '#F2BB62', green: '#43D48E', red: '#F27683' }[tone]
  return (
    <div className={cn('flex items-center', className)} role="img" aria-label={`Progress: ${steps.slice(0, current + 1).join(', ') || steps[0]}`}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} className="flex min-w-0 items-center">
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <span
                className={cn(
                  'relay-flow-node flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-all',
                  active && 'relay-flow-active',
                )}
                style={{
                  borderColor: done || active ? toneHex : '#2E2540',
                  backgroundColor: done ? `${toneHex}22` : active ? `${toneHex}14` : 'transparent',
                  color: done || active ? toneHex : '#7C7490',
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={cn('max-w-24 truncate text-[9px] leading-none', active ? 'text-foreground' : 'text-dim')}>{label}</span>
            </div>
            {i < steps.length - 1 ? (
              <span
                className="mx-1.5 mb-3.5 h-px w-6 sm:w-10 transition-colors duration-500"
                style={{ backgroundColor: done ? toneHex : '#2E2540' }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
