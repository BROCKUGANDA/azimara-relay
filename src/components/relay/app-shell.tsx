'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter, useSession, type SessionState } from '@/lib/client/store'
import { api } from '@/lib/client/api'
import { timeAgo } from '@/lib/client/format'
import { permissionsFor } from '@/lib/rbac'
import { useAppSeo } from '@/lib/client/seo'
import { haptic, motionAllowed } from '@/lib/client/motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronsUpDown, Building2, X, Menu, Send } from 'lucide-react'
import { toast } from 'sonner'
import { ViewBoundary } from './states'
import {
  LogoGlyph, GLYPHS, GlyphOverview, GlyphTreasury, GlyphWallet, GlyphRecipients,
  GlyphPayments, GlyphBatches, GlyphApprovals, GlyphPolicies, GlyphSchedules,
  GlyphActivity, GlyphReconcile, GlyphAnalytics, GlyphIntelligence, GlyphKeys,
  GlyphIntegrations, GlyphTeam, GlyphAudit, GlyphBilling, GlyphSettings, GlyphBell,
  GlyphCommand, GlyphLogout,
} from './glyphs'
import { CommandPalette } from './widgets'
import { CountUp } from './motion'

// View registry — mirrors the PRD authenticated route table, implemented as
// internal hash routes because the environment exposes a single page route.
const NAV_GROUPS: { label: string; items: { path: string; label: string; Glyph: (p: { size?: number; className?: string }) => React.ReactElement; permission?: string }[] }[] = [
  {
    label: 'Operations',
    items: [
      { path: '/app', label: 'Overview', Glyph: GlyphOverview },
      { path: '/app/treasury', label: 'Treasury', Glyph: GlyphTreasury },
      { path: '/app/wallets', label: 'Wallets', Glyph: GlyphWallet },
      { path: '/app/recipients', label: 'Recipients', Glyph: GlyphRecipients },
    ],
  },
  {
    label: 'Payments',
    items: [
      { path: '/app/payments', label: 'Payments', Glyph: GlyphPayments },
      { path: '/app/payments/new', label: 'New payment', Glyph: GlyphPayments, permission: 'payment:create' },
      { path: '/app/batches', label: 'Batch payouts', Glyph: GlyphBatches, permission: 'payment:create' },
      { path: '/app/approvals', label: 'Approval center', Glyph: GlyphApprovals },
      { path: '/app/policies', label: 'Approval policies', Glyph: GlyphPolicies },
      { path: '/app/schedules', label: 'Schedules', Glyph: GlyphSchedules },
    ],
  },
  {
    label: 'Assurance',
    items: [
      { path: '/app/transactions', label: 'Activity', Glyph: GlyphActivity },
      { path: '/app/reconciliation', label: 'Reconciliation', Glyph: GlyphReconcile },
      { path: '/app/analytics', label: 'Analytics', Glyph: GlyphAnalytics },
      { path: '/app/intelligence', label: 'Relay Intelligence', Glyph: GlyphIntelligence },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/app/api-keys', label: 'API keys', Glyph: GlyphKeys, permission: 'apikey:manage' },
      { path: '/app/integrations', label: 'Integrations', Glyph: GlyphIntegrations },
      { path: '/app/team', label: 'Team', Glyph: GlyphTeam },
      { path: '/app/audit', label: 'Audit trail', Glyph: GlyphAudit },
      { path: '/app/billing', label: 'Billing', Glyph: GlyphBilling },
      { path: '/app/settings', label: 'Settings', Glyph: GlyphSettings },
    ],
  },
]

type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

export function AppShell() {
  const { path, navigate } = useRouter()
  const session = useSession()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [bellSwing, setBellSwing] = useState(false)
  const prevUnread = useRef(0)

  const activeOrg = session.activeOrg
  const role = activeOrg?.role ?? 'ANALYST'
  const permissions = permissionsFor(role)
  // App views are authenticated content: title sync + noindex.
  const viewLabel = labelForPath(path)
  useAppSeo(path, viewLabel)

  // Haptic-backed navigation: single funnel for every internal jump so both
  // sidebar taps, palette actions and deep links get consistent feedback.
  const go = useCallback(
    (to: string) => {
      haptic('tap')
      navigate(to)
    },
    [navigate],
  )

  useEffect(() => {
    let alive = true
    let swingTimer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      if (!activeOrg?.id) return
      // Skip polling while the tab is hidden — saves battery/data on mobile.
      if (typeof document !== 'undefined' && document.hidden) return
      api<{ notifications: Notification[]; unread: number }>('/api/notifications')
        .then((d) => {
          if (!alive) return
          setNotifications(d.notifications)
          // Bell swing + buzz only when unread grows while the shell is open —
          // evaluated in the async callback, not as a cascading render effect.
          const nowUnread = d.notifications.filter((n) => !n.readAt).length
          if (nowUnread > prevUnread.current && motionAllowed()) {
            setBellSwing(true)
            haptic('warning')
            swingTimer = setTimeout(() => setBellSwing(false), 950)
          }
          prevUnread.current = nowUnread
        })
        .catch(() => undefined)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(t)
      if (swingTimer) clearTimeout(swingTimer)
    }
  }, [activeOrg?.id])

  const unread = notifications.filter((n) => !n.readAt).length

  if (!activeOrg) return null

  const SidebarContent = (drawer?: boolean) => (
    <SidebarInner
      collapsed={collapsed && !drawer}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      path={path}
      navigate={go}
      onNavigateDrawer={() => setMobileOpen(false)}
      activeOrg={activeOrg}
      role={role}
      session={session}
      permissions={permissions}
    />
  )

  return (
    <div className="flex min-h-screen bg-[#080D17]">
      {/* Desktop sidebar — md covers tablets (768-1023px) too, which previously
          fell back to the cramped phone drawer. */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 border-r border-[#1A293D] bg-[#0B1220] transition-[width] duration-300 md:block', collapsed ? 'w-[72px]' : 'w-[248px]')}>
        {SidebarContent()}
      </aside>
      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="relay-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relay-drawer absolute left-0 top-0 h-full w-[260px] border-r border-[#1A293D] bg-[#0B1220]">{SidebarContent(true)}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 border-b border-[#1A293D] bg-[#080D17]/90 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button className="relay-press rounded-lg p-2 text-secondary hover:bg-[#142135] hover:text-foreground md:hidden" onClick={() => { haptic('tap'); setMobileOpen(true) }} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            <Breadcrumbs path={path} navigate={go} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Command palette trigger — the shell's global launcher. */}
            <button
              onClick={() => { haptic('select'); setPaletteOpen(true) }}
              className="relay-press hidden items-center gap-2 rounded-lg border border-[#26374C] bg-[#0B1220] px-3 py-2 text-xs text-dim transition-colors hover:border-[#35D6C0]/40 hover:text-secondary lg:flex"
              aria-label="Open command palette"
            >
              <GlyphSearchGlyph />
              Search…
              <kbd className="rounded border border-[#26374C] bg-[#142135] px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </button>
            <button
              onClick={() => { haptic('select'); setPaletteOpen(true) }}
              className="relay-press rounded-lg border border-[#26374C] p-2.5 text-secondary hover:bg-[#142135] hover:text-foreground lg:hidden"
              aria-label="Search"
            >
              <GlyphSearchGlyph />
            </button>
            <Button
              size="sm"
              onClick={() => go('/app/payments/new')}
              aria-label="New payment"
              className="relay-press-sm bg-[#35D6C0] font-medium text-[#062A26] shadow-[0_0_18px_rgba(53,214,192,0.25)] hover:bg-[#35D6C0]/90 hover:shadow-[0_0_26px_rgba(53,214,192,0.4)] md:hidden"
            >
              <Send className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => go('/app/payments/new')}
              className="relay-press-sm hidden bg-[#35D6C0] font-medium text-[#062A26] shadow-[0_0_18px_rgba(53,214,192,0.25)] hover:bg-[#35D6C0]/90 hover:shadow-[0_0_26px_rgba(53,214,192,0.4)] md:inline-flex"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> New payment
            </Button>
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <button className="relay-press relative rounded-lg border border-[#26374C] p-2.5 text-secondary hover:bg-[#142135] hover:text-foreground" aria-label="Notifications">
                  <span className={cn('block', bellSwing && 'relay-ring')}>
                    <GlyphBell size={17} accent={unread > 0 ? '#F2BB62' : '#35D6C0'} />
                  </span>
                  {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F27683] px-1 text-[9px] font-bold text-[#080D17]">{unread}</span> : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))] border-[#26374C] bg-[#142135]">
                <DropdownMenuLabel className="text-xs">Notifications</DropdownMenuLabel>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-dim">No notifications yet</div>
                  ) : (
                    notifications.slice(0, 12).map((n) => (
                      <button
                        key={n.id}
                        className={cn('relay-press-sm block w-full border-b border-[#1A293D] px-3 py-2.5 text-left last:border-0 hover:bg-[#1B2A40]', !n.readAt && 'bg-[#35D6C0]/5')}
                        onClick={async () => {
                          await api('/api/notifications', { json: { ids: [n.id], markRead: true } }).catch(() => undefined)
                          setNotifOpen(false)
                          // Only navigate DB-supplied links that point back into
                          // the app — anything else is dropped.
                          if (n.link && n.link.replace('#', '').startsWith('/app')) go(n.link.replace('#', ''))
                        }}
                      >
                        <div className="text-xs font-medium">{n.title}</div>
                        {n.body ? <div className="mt-0.5 line-clamp-2 text-[11px] text-dim">{n.body}</div> : null}
                        <div className="mt-1 text-[10px] text-dim">{timeAgo(n.createdAt)}</div>
                      </button>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relay-press flex items-center gap-2 rounded-lg border border-[#26374C] px-2.5 py-2 hover:bg-[#142135]" aria-label="Account menu">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#658CFF]/15 text-[10px] font-bold text-[#658CFF]">
                    {session.user?.name?.slice(0, 2).toUpperCase() ?? '??'}
                  </span>
                  <span className="hidden text-xs sm:inline">{session.user?.name}</span>
                  <ChevronsUpDown className="h-3 w-3 text-dim" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-[#26374C] bg-[#142135]">
                <DropdownMenuLabel className="text-xs">
                  {session.user?.email}
                  {!session.emailVerified ? <span className="mt-1 block text-[10px] font-normal text-[#F2BB62]">Email not verified</span> : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#26374C]" />
                <DropdownMenuItem className="text-xs" onClick={() => go('/app/settings')}><GlyphSettings size={14} className="mr-2" /> Settings & security</DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => go('/app/billing')}><GlyphBilling size={14} className="mr-2" /> Billing</DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#26374C]" />
                <DropdownMenuItem
                  className="text-xs text-[#F27683]"
                  onClick={async () => {
                    haptic('warning')
                    await session.signOut()
                    navigate('/')
                  }}
                >
                  <GlyphLogout size={14} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content — min-w-0: without it the flex item's automatic minimum
            size tracks the widest table's min-content and inflates the whole
            shell horizontally on narrow screens. */}
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-4 sm:p-8">
          {/* Keyed by path: navigation remounts the boundary (clearing any
              caught error) and re-triggers the view transition. A crash inside
              one view is contained here — sidebar, topbar and session survive. */}
          <div key={path} className="view-enter">
            <ViewBoundary navigate={navigate}>
              <AppView path={path} navigate={navigate} />
            </ViewBoundary>
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

function GlyphSearchGlyph() {
  return <GLYPHS.search size={15} />
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function SidebarInner({
  collapsed, onToggleCollapse, path, navigate, onNavigateDrawer, activeOrg, role, session, permissions,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  path: string
  navigate: (to: string) => void
  onNavigateDrawer?: () => void
  activeOrg: { id: string; name: string; plan: string }
  role: string
  session: SessionState
  permissions: string[]
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  // The pill writes straight to the DOM node — zero re-renders on navigation,
  // and the CSS transition owns the slide animation.
  const pillRef = useRef<HTMLSpanElement>(null)

  const activePath = (() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        const active = path === item.path || (item.path !== '/app' && path.startsWith(item.path) && !(item.path === '/app/payments' && path === '/app/payments/new'))
        if (active) return item.path
      }
    }
    return '/app'
  })()

  const placePill = useCallback(() => {
    const el = itemRefs.current.get(activePath)
    const list = listRef.current
    if (!pillRef.current) return
    if (!el || !list) {
      pillRef.current.style.opacity = '0'
      return
    }
    const listTop = list.getBoundingClientRect().top
    const rect = el.getBoundingClientRect()
    pillRef.current.style.transform = `translateY(${(rect.top - listTop).toFixed(1)}px)`
    pillRef.current.style.height = `${rect.height}px`
    pillRef.current.style.opacity = '1'
  }, [activePath])

  // Measure after DOM mutation — layout effect avoids a flash of the pill at
  // the previous position.
  useLayoutEffect(() => {
    placePill()
  }, [placePill])

  // Re-measure once fonts settle (first paint can use fallback metrics).
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    document.fonts.ready.then(() => placePill()).catch(() => undefined)
  }, [placePill])

  function handleNavigate(to: string) {
    navigate(to)
    onNavigateDrawer?.()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-[#1A293D] px-4">
        <button onClick={() => handleNavigate('/app')} className="relay-press-sm group flex items-center gap-2.5" aria-label="Overview">
          <span className="transition-transform duration-500 group-hover:rotate-[8deg]">
            <LogoGlyph size={24} />
          </span>
          {!collapsed && <span className="text-[13px] font-semibold tracking-tight">AZIMARA <span className="text-[#35D6C0]">RELAY</span></span>}
        </button>
        {!collapsed && (
          <button className="relay-press rounded-lg p-2 text-dim hover:bg-[#142135] hover:text-foreground md:hidden" onClick={onNavigateDrawer} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Organization switcher */}
      <div className="border-b border-[#1A293D] p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn('relay-press-sm flex w-full items-center gap-2 rounded-lg border border-[#26374C] bg-[#0B1220] px-2.5 py-2 text-left hover:bg-[#142135] transition-colors', collapsed && 'justify-center px-0')} aria-label="Switch organization">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#35D6C0]/15 text-xs font-bold text-[#35D6C0]">{activeOrg.name.slice(0, 2).toUpperCase()}</span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{activeOrg.name}</span>
                    <span className="block text-[10px] text-dim">{role.replaceAll('_', ' ')} · {activeOrg.plan}</span>
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-dim" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(16rem,calc(100vw-3rem))] border-[#26374C] bg-[#142135]">
            <DropdownMenuLabel className="text-xs text-dim">Workspaces</DropdownMenuLabel>
            {session.organizations.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => session.setActive(o.id)} className="text-xs">
                <Building2 className="mr-2 h-3.5 w-3.5 text-dim" />
                <span className="flex-1">{o.name}</span>
                {o.id === activeOrg.id && <Badge className="border-0 bg-[#35D6C0]/15 text-[10px] text-[#35D6C0]">Active</Badge>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-[#26374C]" />
            <DropdownMenuItem
              className="text-xs"
              onClick={async () => {
                try {
                  const name = window.prompt('New organization name')
                  if (!name) return
                  await api('/api/organizations', { json: { name } })
                  await session.refresh()
                  toast.success('Organization created')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed')
                }
              }}
            >
              <Building2 className="mr-2 h-3.5 w-3.5 text-[#35D6C0]" /> Create new organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Navigation groups — animated active pill slides between items */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Application">
        <div className="relative" ref={listRef}>
          <span ref={pillRef} className="relay-nav-pill" aria-hidden style={{ opacity: 0 }} />
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              {!collapsed && <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">{group.label}</div>}
              {group.items
                .filter((item) => !item.permission || permissions.includes(item.permission as never))
                .map((item) => {
                  const active = path === item.path || (item.path !== '/app' && path.startsWith(item.path) && !(item.path === '/app/payments' && path === '/app/payments/new'))
                  const { Glyph } = item
                  return (
                    <button
                      key={item.path}
                      ref={(el) => {
                        if (el) itemRefs.current.set(item.path, el)
                        else itemRefs.current.delete(item.path)
                      }}
                      onClick={() => handleNavigate(item.path)}
                      className={cn(
                        'group relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150',
                        active ? 'text-[#35D6C0]' : 'text-secondary hover:bg-[#142135]/60 hover:text-foreground',
                        collapsed && 'justify-center px-0',
                      )}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className={cn('transition-transform duration-300', !active && 'group-hover:scale-110')}>
                        <Glyph size={17} />
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.path === '/app/approvals' && <ApprovalsCountBadge />}
                      {active && !collapsed ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#35D6C0] shadow-[0_0_8px_rgba(53,214,192,0.8)]" /> : null}
                    </button>
                  )
                })}
            </div>
          ))}
        </div>
      </nav>
      <div className="border-t border-[#1A293D] p-3">
        {!collapsed && (
          <div className="mb-2 rounded-lg border border-[#26374C] bg-[#0B1220] p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-dim"><GlyphCommand size={12} /> SHORTCUT</div>
            <div className="mt-1 text-[11px] text-secondary">
              Press <kbd className="rounded border border-[#26374C] bg-[#142135] px-1 font-mono">⌘K</kbd> for commands
            </div>
          </div>
        )}
        <button
          onClick={() => { haptic('toggle'); onToggleCollapse() }}
          className={cn('relay-press-sm hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-dim hover:bg-[#142135] hover:text-foreground md:flex', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <GlyphSettings size={15} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  )
}

function ApprovalsCountBadge() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    // Refresh with the notification poll cadence so the badge reflects
    // approvals decided in other tabs/sessions.
    const load = () => {
      api<{ total: number }>('/api/approvals?pageSize=1')
        .then((d) => setCount(d.total))
        .catch(() => undefined)
    }
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])
  if (!count) return null
  return <span className="ml-auto rounded-full bg-[#A18BEB]/15 px-2 py-0.5 text-[10px] font-semibold text-[#A18BEB]"><CountUp value={count} /></span>
}

function Breadcrumbs({ path, navigate }: { path: string; navigate: (to: string) => void }) {
  const parts = path.replace(/^\//, '').split('/').filter(Boolean)
  const labelFor: Record<string, string> = Object.fromEntries(
    NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.path.replace(/^\//, ''), i.label]),
  )
  return (
    // min-w-0 + truncate: multi-segment paths squeeze the right-side topbar
    // controls on phones unless the crumb row can shrink.
    <div className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-dim" aria-label="Breadcrumb">
      {parts.length === 0 || (parts.length === 1 && parts[0] === 'app') ? (
        <span className="flex items-center gap-1.5"><GlyphOverview size={13} /> Overview</span>
      ) : (
        parts.map((p, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronSep />}
            <span className={`truncate ${i === parts.length - 1 ? 'text-secondary' : 'hidden sm:inline'}`}>
              {labelFor[parts.slice(0, i + 1).join('/')] ?? (p === 'app' ? 'Relay' : p.length > 20 ? p.slice(0, 10) + '…' : p.charAt(0).toUpperCase() + p.slice(1))}
            </span>
          </span>
        ))
      )}
    </div>
  )
}

function ChevronSep() {
  return <span className="text-[#26374C]">/</span>
}

function labelForPath(p: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (p === item.path) return item.label
    }
  }
  if (p.startsWith('/app/payments/') && p !== '/app/payments/new') return 'Payment detail'
  if (p.startsWith('/app/batches/')) return 'Batch detail'
  return 'Overview'
}

// View dispatch — views imported statically to keep the shell simple.
import { OverviewView } from './views/overview'
import { TreasuryView } from './views/treasury'
import { WalletsView } from './views/wallets'
import { RecipientsView } from './views/recipients'
import { PaymentsView } from './views/payments'
import { PaymentBuilderView } from './views/payment-builder'
import { PaymentDetailView } from './views/payment-detail'
import { BatchesView } from './views/batches'
import { ApprovalsView } from './views/approvals'
import { PoliciesView } from './views/policies'
import { SchedulesView } from './views/schedules'
import { ReconciliationView } from './views/reconciliation'
import { IntelligenceView } from './views/intelligence'
import { AnalyticsView } from './views/analytics'
import { ApiKeysView } from './views/api-keys'
import { IntegrationsView } from './views/integrations'
import { TeamView } from './views/team'
import { AuditView } from './views/audit'
import { BillingView } from './views/billing'
import { SettingsView } from './views/settings'
import { ActivityView } from './views/activity'

function AppView({ path, navigate }: { path: string; navigate: (to: string) => void }) {
  if (path === '/app' || path === '/app/') return <OverviewView />
  if (path === '/app/treasury') return <TreasuryView />
  if (path === '/app/wallets') return <WalletsView />
  if (path === '/app/recipients') return <RecipientsView />
  if (path === '/app/payments/new') return <PaymentBuilderView />
  if (path === '/app/payments') return <PaymentsView />
  if (path.startsWith('/app/payments/')) {
    const paymentId = path.split('/')[3] ?? ''
    // `/app/payments/` with a trailing slash must not fetch an empty id.
    return paymentId ? <PaymentDetailView paymentId={paymentId} navigate={navigate} /> : <NotFoundView navigate={navigate} />
  }
  if (path === '/app/batches') return <BatchesView />
  if (path.startsWith('/app/batches/')) return <BatchesView initialBatchId={path.split('/')[3]} />
  if (path === '/app/approvals') return <ApprovalsView />
  if (path === '/app/policies') return <PoliciesView />
  if (path === '/app/schedules') return <SchedulesView />
  if (path === '/app/transactions') return <ActivityView />
  if (path === '/app/reconciliation') return <ReconciliationView />
  if (path === '/app/intelligence') return <IntelligenceView />
  if (path === '/app/analytics') return <AnalyticsView />
  if (path === '/app/api-keys') return <ApiKeysView />
  if (path === '/app/integrations') return <IntegrationsView />
  if (path === '/app/team') return <TeamView />
  if (path === '/app/audit') return <AuditView />
  if (path === '/app/billing') return <BillingView />
  if (path === '/app/settings') return <SettingsView />
  return <NotFoundView navigate={navigate} />
}

function NotFoundView({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[#26374C] p-10 text-center text-sm text-dim">
      Page not found — <button className="text-[#35D6C0] hover:underline" onClick={() => navigate('/app')}>back to overview</button>
    </div>
  )
}
