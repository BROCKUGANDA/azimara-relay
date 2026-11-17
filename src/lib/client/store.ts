'use client'

import { create } from 'zustand'
import { setActiveOrg } from './api'

export type SessionUser = { id: string; email: string; name: string }
export type SessionOrg = { id: string; name: string; slug: string; role: string; status: string; plan: string; planStatus: string }

type SessionState = {
  loading: boolean
  authenticated: boolean
  mfaPassed: boolean
  mfaEnabled: boolean
  emailVerified: boolean
  user: SessionUser | null
  organizations: SessionOrg[]
  activeOrg: SessionOrg | null
  refresh: () => Promise<void>
  setActive: (orgId: string) => void
  signOut: () => Promise<void>
}

function readActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null
  // localStorage throws in Safari private mode / on quota errors — degrade to
  // "no saved org" instead of crashing session boot.
  try {
    return window.localStorage.getItem('relay:activeOrg')
  } catch {
    return null
  }
}

export const useSession = create<SessionState>((set, get) => ({
  loading: true,
  authenticated: false,
  mfaPassed: false,
  mfaEnabled: false,
  emailVerified: false,
  user: null,
  organizations: [],
  activeOrg: null,
  refresh: async () => {
    try {
      const res = await fetch('/api/auth/session')
      const payload = (await res.json()) as {
        data?: {
          authenticated: boolean
          mfaPassed?: boolean
          mfaEnabled?: boolean
          emailVerified?: boolean
          user?: SessionUser
          organizations?: SessionOrg[]
        }
      }
      const d = payload?.data
      if (d?.authenticated) {
        const saved = readActiveOrgId()
        const active = d.organizations?.find((o) => o.id === saved) ?? d.organizations?.[0] ?? null
        setActiveOrg(active?.id ?? null)
        set({
          loading: false,
          authenticated: true,
          mfaPassed: d.mfaPassed ?? true,
          mfaEnabled: d.mfaEnabled ?? false,
          emailVerified: d.emailVerified ?? false,
          user: d.user ?? null,
          organizations: d.organizations ?? [],
          activeOrg: active,
        })
      } else {
        set({ loading: false, authenticated: false, user: null, organizations: [], activeOrg: null })
        setActiveOrg(null)
      }
    } catch {
      set({ loading: false, authenticated: false })
    }
  },
  setActive: (orgId: string) => {
    const org = get().organizations.find((o) => o.id === orgId) ?? null
    if (org && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('relay:activeOrg', orgId)
      } catch {
        // Storage unavailable (private mode / quota): session still works.
      }
    }
    setActiveOrg(orgId)
    set({ activeOrg: org })
  },
  signOut: async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setActiveOrg(null)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('relay:activeOrg')
      } catch {
        // ignore
      }
    }
    set({ authenticated: false, user: null, organizations: [], activeOrg: null })
  },
}))

// ─── Hash router (single visible route constraint) ─────────────────────────

type RouterState = {
  path: string
  navigate: (to: string) => void
  sync: () => void
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/'
  const h = window.location.hash.replace(/^#/, '')
  return h === '' ? '/' : h
}

export const useRouter = create<RouterState>((set) => ({
  path: '/',
  navigate: (to: string) => {
    if (typeof window !== 'undefined') window.location.hash = to
    set({ path: to })
  },
  sync: () => set({ path: currentPath() }),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    useRouter.getState().sync()
  })
}
