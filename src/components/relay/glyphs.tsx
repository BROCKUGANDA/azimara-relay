import { cn } from '@/lib/utils'

// AZIMARA RELAY — Custom glyph set.
//
// Hand-drawn 24×24 glyphs in the brand's geometric-precision language:
// 1.6px strokes, rounded joins, one accent node per glyph. Every glyph
// inherits `currentColor` so it themes like text, and carries aria-hidden
// by default (labels live on the buttons that host them).
//
// These replace stock icon usage across navigation chrome so the shell has
// an identity of its own instead of a generic icon library look.

export type GlyphProps = {
  size?: number
  className?: string
  /** Accent node color — defaults to the relay teal. */
  accent?: string
}

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: cn('shrink-0', className),
  'aria-hidden': true,
})

const ACCENT = '#39C6D8'

/**
 * Brand mark v2 "Relay Conduit" — a hexagonal vault gate threaded by the
 * settlement rail: an S-curve path flows through a central approval-gate
 * diamond from an origin node (indigo) to a settlement node (mint). The
 * silhouette + rail geometry are unique to AZIMARA RELAY and match
 * /public/logo.svg.
 */
export function LogoGlyph({ size = 24, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={cn('shrink-0', className)} aria-hidden>
      <path d="M32 7 L53.65 19.5 L53.65 44.5 L32 57 L10.35 44.5 L10.35 19.5 Z" fill="rgba(20,41,63,0.92)" stroke="rgba(20,41,63,0.92)" strokeWidth="7" strokeLinejoin="round" />
      <path d="M32 8.6 L52.15 20.3 L52.15 43.7 L32 55.4 L11.85 43.7 L11.85 20.3 Z" stroke={ACCENT} strokeOpacity="0.45" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M17.5 44.5 C 25 44.5, 25.5 32, 32 32 C 38.5 32, 39 19.5, 46.5 19.5" stroke={ACCENT} strokeOpacity="0.72" strokeWidth="4.6" strokeLinecap="round" />
      <circle cx="17.5" cy="44.5" r="3.1" fill="#8AA2F0" />
      <rect x="28.2" y="28.2" width="7.6" height="7.6" rx="1.8" transform="rotate(45 32 32)" fill={ACCENT} />
      <rect x="30.4" y="30.4" width="3.2" height="3.2" rx="0.8" transform="rotate(45 32 32)" fill="#04121A" />
      <circle cx="46.5" cy="19.5" r="3.1" fill="#2ED3A6" />
    </svg>
  )
}

/** Overview — four quadrants with a live pulse in one. */
export function GlyphOverview({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <path d="M14 17h2.4M18.6 17H20.5M17.4 14.6v2.4M17.4 18.6v1.9" stroke={accent} />
    </svg>
  )
}

/** Treasury — vault door with spokes. */
export function GlyphTreasury({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 8v-1.6M12 17.6V16M15.2 10.4l1.3-.8M7.5 14.4l1.3-.8M15.2 13.6l1.3.8M7.5 9.6l1.3.8" stroke={accent} strokeWidth="1.4" />
    </svg>
  )
}

/** Wallet — flap + relay node. */
export function GlyphWallet({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h9A2.5 2.5 0 0 1 18 7.5v1" />
      <rect x="4" y="8.5" width="16" height="10" rx="2.5" />
      <circle cx="16.4" cy="13.5" r="1.4" fill={accent} stroke="none" />
    </svg>
  )
}

/** Recipients — two connected nodes (counterparty graph). */
export function GlyphRecipients({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="16" r="3" stroke={accent} />
      <path d="M10.4 10.2 13.6 13.8" strokeDasharray="1.6 1.8" />
      <path d="M4.5 19c.6-2.4 2-3.6 3.9-3.6M19.5 5c-.6 2.4-2 3.6-3.9 3.6" opacity={0.65} />
    </svg>
  )
}

/** Payments — relay beam: packet moving through a channel. */
export function GlyphPayments({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3.5 12h7M13.5 12h7" />
      <path d="M14.6 8.2 18.4 12l-3.8 3.8" />
      <circle cx="10" cy="12" r="2" fill={accent} stroke="none" />
    </svg>
  )
}

/** Batches — stacked payout layers. */
export function GlyphBatches({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m12 3.5 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12.5 8 4 8-4" opacity={0.7} />
      <path d="m4 16.5 8 4 8-4" opacity={0.4} />
      <circle cx="20" cy="7.5" r="1.3" fill={accent} stroke="none" />
    </svg>
  )
}

/** Approvals — double-check seal. */
export function GlyphApprovals({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m4.5 12.5 4 4L19 6" />
      <path d="m9.5 16.5 2 2L21 8.5" stroke={accent} opacity={0.85} />
    </svg>
  )
}

/** Policies — shield with tuning node. */
export function GlyphPolicies({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3.5c2.7 1.4 5.4 2 7.5 2.2 0 6.4-2.4 11.4-7.5 14.8C6.9 17.1 4.5 12.1 4.5 5.7c2.1-.2 4.8-.8 7.5-2.2Z" />
      <circle cx="12" cy="11" r="2.4" stroke={accent} />
      <path d="M12 13.4v2.4" stroke={accent} />
    </svg>
  )
}

/** Schedules — clock with orbit tick. */
export function GlyphSchedules({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
      <circle cx="19.5" cy="5.5" r="1.6" stroke={accent} fill="none" />
    </svg>
  )
}

/** Activity — settlement pulse. */
export function GlyphActivity({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3.5 12h3l2-5 3.5 10 2.5-7 1.5 4h4.5" />
      <circle cx="20" cy="14" r="1.3" fill={accent} stroke="none" />
    </svg>
  )
}

/** Reconciliation — two streams merging. */
export function GlyphReconcile({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 6.5c4 0 4.5 5.5 8 5.5M4 17.5c4 0 4.5-5.5 8-5.5" />
      <path d="M12 12h7.5" />
      <path d="m16.5 9 3 3-3 3" stroke={accent} />
    </svg>
  )
}

/** Analytics — ascending bars with peak node. */
export function GlyphAnalytics({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4.5 20V13M9.5 20V8M14.5 20v-5M19.5 20V4.5" />
      <circle cx="19.5" cy="4.5" r="1.5" fill={accent} stroke="none" />
    </svg>
  )
}

/** Intelligence — orbiting core. */
export function GlyphIntelligence({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="8.5" ry="3.6" transform="rotate(-24 12 12)" opacity={0.7} />
      <circle cx="18.8" cy="8.2" r="1.5" stroke={accent} />
    </svg>
  )
}

/** API keys — key with circuit teeth. */
export function GlyphKeys({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="8" cy="8.5" r="3.5" />
      <path d="m10.6 11 7 7" />
      <path d="m15 14.6 1.8 1.8M17.4 12.2l1.8 1.8" stroke={accent} strokeWidth="1.4" />
    </svg>
  )
}

/** Integrations — linked blocks. */
export function GlyphIntegrations({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <path d="M10.5 7.25h4.75a1.75 1.75 0 0 1 1.75 1.75v4.5" stroke={accent} strokeDasharray="2 2" />
    </svg>
  )
}

/** Team — two operators. */
export function GlyphTeam({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.7-3 2.6-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
      <path d="M15.5 5.6a3 3 0 1 1 1 5.8M16.8 14.7c2 .6 3.2 2 3.7 4.3" stroke={accent} opacity={0.85} />
    </svg>
  )
}

/** Audit — ledger scroll. */
export function GlyphAudit({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 4.5h11a2 2 0 0 1 2 2V17a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 17V6a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M9 9h6M9 12.5h6M9 16h3.5" stroke={accent} opacity={0.9} strokeWidth="1.4" />
    </svg>
  )
}

/** Billing — card with relay band. */
export function GlyphBilling({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M3.5 10h17" stroke={accent} />
      <path d="M7 14.5h3" />
    </svg>
  )
}

/** Settings — precision sliders. */
export function GlyphSettings({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2" stroke={accent} />
      <circle cx="9" cy="16" r="2" stroke={accent} />
    </svg>
  )
}

/** Search — lens with tick. */
export function GlyphSearch({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
      <path d="m8.6 11.2 1.7 1.7 3-3.4" stroke={accent} strokeWidth="1.4" />
    </svg>
  )
}

/** Notifications — chime with swing node. */
export function GlyphBell({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 4.5a5 5 0 0 1 5 5c0 3.4.8 5 1.8 6H5.2c1-1 1.8-2.6 1.8-6a5 5 0 0 1 5-5Z" />
      <path d="M10 18.8a2.2 2.2 0 0 0 4 0" />
      <circle cx="18.5" cy="4.5" r="1.4" fill={accent} stroke="none" />
    </svg>
  )
}

/** Command — relay cmd: square brackets around a pulse. */
export function GlyphCommand({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 4.5H5.5v3M16 4.5h2.5v3M8 19.5H5.5v-3M16 19.5h2.5v-3" stroke={accent} />
      <path d="M8.5 12h7" />
      <circle cx="12" cy="12" r="1.6" fill={accent} stroke="none" />
    </svg>
  )
}

/** New payment — stream with plus. */
export function GlyphPaymentNew({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3.5 8h9M3.5 16h5" opacity={0.6} />
      <path d="M12.5 16h8M16.8 12v8" stroke={accent} />
      <circle cx="12" cy="8" r="2" fill={accent} stroke="none" opacity={0.9} />
    </svg>
  )
}

/** Security shield (public site). */
export function GlyphShield({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3.5c2.7 1.4 5.4 2 7.5 2.2 0 6.4-2.4 11.4-7.5 14.8C6.9 17.1 4.5 12.1 4.5 5.7c2.1-.2 4.8-.8 7.5-2.2Z" />
      <path d="m9 11.6 2.2 2.2L15.5 9" stroke={accent} />
    </svg>
  )
}

/** Lock (public site). */
export function GlyphLock({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="5" y="10.5" width="14" height="9" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="12" cy="15" r="1.5" fill={accent} stroke="none" />
    </svg>
  )
}

/** Zap / instant (public site). */
export function GlyphZap({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M13 3.5 6 13.5h5l-1 7 7.5-10.5H12l1-6.5Z" />
      <circle cx="18.5" cy="5" r="1.2" fill={accent} stroke="none" />
    </svg>
  )
}

/** Globe (public site). */
export function GlyphGlobe({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="3.6" ry="8" />
      <path d="M4.5 9.5h15M4.5 14.5h15" opacity={0.7} />
      <circle cx="12" cy="4" r="0" />
    </svg>
  )
}

/** Webhook (public site). */
export function GlyphWebhook({ size = 20, className, accent = ACCENT }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="6.5" cy="17" r="2.8" />
      <circle cx="17.5" cy="17" r="2.8" />
      <circle cx="12" cy="7" r="2.8" stroke={accent} />
      <path d="M10.8 9.5 7.6 14.5M13.2 9.5l3.2 5M9.3 17h5.4" />
    </svg>
  )
}

/** Logout. */
export function GlyphLogout({ size = 20, className }: GlyphProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7" />
      <path d="m15.5 8.5 3.5 3.5-3.5 3.5M19 12h-8" />
    </svg>
  )
}

export const GLYPHS = {
  overview: GlyphOverview,
  treasury: GlyphTreasury,
  wallets: GlyphWallet,
  recipients: GlyphRecipients,
  payments: GlyphPayments,
  batches: GlyphBatches,
  approvals: GlyphApprovals,
  policies: GlyphPolicies,
  schedules: GlyphSchedules,
  activity: GlyphActivity,
  reconcile: GlyphReconcile,
  analytics: GlyphAnalytics,
  intelligence: GlyphIntelligence,
  keys: GlyphKeys,
  integrations: GlyphIntegrations,
  team: GlyphTeam,
  audit: GlyphAudit,
  billing: GlyphBilling,
  settings: GlyphSettings,
  search: GlyphSearch,
  bell: GlyphBell,
  command: GlyphCommand,
  paymentNew: GlyphPaymentNew,
  shield: GlyphShield,
  lock: GlyphLock,
  zap: GlyphZap,
  globe: GlyphGlobe,
  webhook: GlyphWebhook,
  logout: GlyphLogout,
} as const

export type GlyphName = keyof typeof GLYPHS
