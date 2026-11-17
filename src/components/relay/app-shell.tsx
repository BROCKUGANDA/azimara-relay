'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSession } from '@/lib/client/store'
import { api } from '@/lib/client/api'
import { timeAgo } from '@/lib/client/format'
import { permissionsFor } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Bell, ChevronsLeftRight, ChevronsUpDown, Building2, LogOut, Settings, Search, Menu, X,
  LayoutDashboard, Landmark, Wallet, Users, Send, Layers, CheckCheck, CalendarClock, History,
  GitCompareArrows, BrainCircuit, BarChart3, KeyRound, Blocks, UserCog, ScrollText, CreditCard, Command,
} from 'lucide-react'
import { toast } from 'sonner'

// View registry — mirrors the PRD authenticated route table, implemented as
// internal hash routes because the environment exposes a single page route.
const NAV_GROUPS: { label: string; items: { path: string; label: string; icon: React.ReactNode; permission?: string }[] }[] = [
  {
    label: 'Operations',
    items: [
      { path: '/app', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
      { path: '/app/treasury', label: 'Treasury', icon: <Landmark className="h-4 w-4" /> },
      { path: '/app/wallets', label: 'Wallets', icon: <Wallet className="h-4 w-4" /> },
      { path: '/app/recipients', label: 'Recipients', icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Payments',
    items: [
      { path: '/app/payments', label: 'Payments', icon: <Send className="h-4 w-4" /> },
      { path: '/app/payments/new', label: 'New payment', icon: <Send className="h-4 w-4" />, permission: 'payment:create' },
      { path: '/app/batches', label: 'Batch payouts', icon: <Layers className="h-4 w-4" />, permission: 'payment:create' },
      { path: '/app/approvals', label: 'Approval center', icon: <CheckCheck className="h-4 w-4" /> },
      { path: '/app/policies', label: 'Approval policies', icon: <UserCog className="h-4 w-4" /> },
      { path: '/app/schedules', label: 'Schedules', icon: <CalendarClock className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Assurance',
    items: [
      { path: '/app/transactions', label: 'Activity', icon: <History className="h-4 w-4" /> },
      { path: '/app/reconciliation', label: 'Reconciliation', icon: <GitCompareArrows className="h-4 w-4" /> },
      { path: '/app/analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
      { path: '/app/intelligence', label: 'Relay Intelligence', icon: <BrainCircuit className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/app/api-keys', label: 'API keys', icon: <KeyRound className="h-4 w-4" />, permission: 'apikey:manage' },
      { path: '/app/integrations', label: 'Integrations', icon: <Blocks className="h-4 w-4" /> },
      { path: '/app/team', label: 'Team', icon: <Users className="h-4 w-4" /> },
      { path: '/app/audit', label: 'Audit trail', icon: <ScrollText className="h-4 w-4" /> },
      { path: '/app/billing', label: 'Billing', icon: <CreditCard className="h-4 w-4" /> },
      { path: '/app/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
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

  const activeOrg = session.activeOrg
  const role = activeOrg?.role ?? 'ANALYST'
  const permissions = permissionsFor(role)

  useEffect(() => {
    let alive = true
    const load = () => {
      if (!activeOrg) return
      api<{ notifications: Notification[]; unread: number }>('/api/notifications')
        .then((d) => {
          if (alive) setNotifications(d.notifications)
        })
        .catch(() => undefined)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [activeOrg])

  if (!activeOrg) return null

  const unread = notifications.filter((n) => !n.readAt).length

  function viewFor(p: string): React.ReactNode {
    // Lazy import map avoided for simplicity: static imports resolved at top.
    return null
  }

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-[#1A293D] px-4">
        <button onClick={() => navigate('/app')} className="flex items-center gap-2.5" aria-label="Overview">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
            <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="#35D6C0" strokeWidth="1.6" />
            <path d="M9 20.5 16 8l7 12.5" stroke="#35D6C0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12.2 17.4h7.6" stroke="#658CFF" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {!collapsed && <span className="text-[13px] font-semibold tracking-tight">AZIMARA <span className="text-[#35D6C0]">RELAY</span></span>}
        </button>
        {!collapsed && (
          <button className="text-dim hover:text-foreground lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Organization switcher */}
      <div className="border-b border-[#1A293D] p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn('flex w-full items-center gap-2 rounded-lg border border-[#26374C] bg-[#0B1220] px-2.5 py-2 text-left hover:bg-[#142135] transition-colors', collapsed && 'justify-center px-0')} aria-label="Switch organization">
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
          <DropdownMenuContent align="start" className="w-64 border-[#26374C] bg-[#142135]">
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
      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Application">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">{group.label}</div>}
            {group.items
              .filter((item) => !item.permission || permissions.includes(item.permission as never))
              .map((item) => {
                const active = path === item.path || (item.path !== '/app' && path.startsWith(item.path) && !(item.path === '/app/payments' && path === '/app/payments/new'))
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path)
                      setMobileOpen(false)
                    }}
                    className={cn(
                      'group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150',
                      active ? 'bg-[#142135] text-[#35D6C0]' : 'text-secondary hover:bg-[#142135] hover:text-foreground',
                      collapsed && 'justify-center px-0',
                    )}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.icon}
                    {!collapsed && <span>{item.label}</span>}
                    {!collapsed && item.path === '/app/approvals' && <ApprovalsCountBadge />}
                  </button>
                )
              })}
          </div>
        ))}
      </nav>
      <div className="border-t border-[#1A293D] p-3">
        {!collapsed && (
          <div className="mb-2 rounded-lg border border-[#26374C] bg-[#0B1220] p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-dim"><Command className="h-3 w-3" /> SHORTCUT</div>
            <div className="mt-1 text-[11px] text-secondary">Press <kbd className="rounded border border-[#26374C] bg-[#142135] px-1 font-mono">N</kbd> for a new payment</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn('hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-dim hover:bg-[#142135] hover:text-foreground lg:flex', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronsLeftRight className="h-4 w-4" />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#080D17]">
      {/* Desktop sidebar */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 border-r border-[#1A293D] bg-[#0B1220] transition-all duration-200 lg:block', collapsed ? 'w-[72px]' : 'w-[248px]')}>
        {SidebarContent}
      </aside>
      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[260px] border-r border-[#1A293D] bg-[#0B1220]">{SidebarContent}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 border-b border-[#1A293D] bg-[#080D17]/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="text-secondary lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            <Breadcrumbs path={path} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => navigate('/app/payments/new')}
              className="hidden bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90 sm:inline-flex"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> New payment
            </Button>
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <button className="relative rounded-lg border border-[#26374C] p-2 text-secondary hover:bg-[#142135] hover:text-foreground" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F27683] px-1 text-[9px] font-bold text-[#080D17]">{unread}</span> : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 border-[#26374C] bg-[#142135]">
                <DropdownMenuLabel className="text-xs">Notifications</DropdownMenuLabel>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-dim">No notifications yet</div>
                  ) : (
                    notifications.slice(0, 12).map((n) => (
                      <button
                        key={n.id}
                        className={cn('block w-full border-b border-[#1A293D] px-3 py-2.5 text-left last:border-0 hover:bg-[#1B2A40]', !n.readAt && 'bg-[#35D6C0]/5')}
                        onClick={async () => {
                          await api('/api/notifications', { json: { ids: [n.id], markRead: true } }).catch(() => undefined)
                          setNotifOpen(false)
                          if (n.link) navigate(n.link.replace('#', ''))
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
                <button className="flex items-center gap-2 rounded-lg border border-[#26374C] px-2.5 py-1.5 hover:bg-[#142135]" aria-label="Account menu">
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
                <DropdownMenuItem className="text-xs" onClick={() => navigate('/app/settings')}><Settings className="mr-2 h-3.5 w-3.5" /> Settings & security</DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => navigate('/app/billing')}><CreditCard className="mr-2 h-3.5 w-3.5" /> Billing</DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#26374C]" />
                <DropdownMenuItem
                  className="text-xs text-[#F27683]"
                  onClick={async () => {
                    await session.signOut()
                    navigate('/')
                  }}
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-8">
          <AppView path={path} navigate={navigate} />
        </main>
      </div>
    </div>
  )
}

function ApprovalsCountBadge() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    api<{ total: number }>('/api/approvals?pageSize=1')
      .then((d) => setCount(d.total))
      .catch(() => undefined)
  }, [])
  if (!count) return null
  return <span className="ml-auto rounded-full bg-[#A18BEB]/15 px-2 py-0.5 text-[10px] font-semibold text-[#A18BEB]">{count}</span>
}

function Breadcrumbs({ path }: { path: string }) {
  const parts = path.replace(/^\//, '').split('/').filter(Boolean)
  const labelFor: Record<string, string> = Object.fromEntries(
    NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.path.replace(/^\//, ''), i.label]),
  )
  return (
    <div className="flex items-center gap-1 text-xs text-dim" aria-label="Breadcrumb">
      {parts.length === 0 || (parts.length === 1 && parts[0] === 'app') ? (
        <span>Overview</span>
      ) : (
        parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronSep />}
            <span className={i === parts.length - 1 ? 'text-secondary' : ''}>
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
  if (path.startsWith('/app/payments/')) return <PaymentDetailView paymentId={path.split('/')[3] ?? ''} navigate={navigate} />
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
  return (
    <div className="rounded-xl border border-dashed border-[#26374C] p-10 text-center text-sm text-dim">
      Page not found — <button className="text-[#35D6C0] hover:underline" onClick={() => navigate('/app')}>back to overview</button>
    </div>
  )
}
