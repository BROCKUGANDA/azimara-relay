'use client'

import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSession, useRouter } from '@/lib/client/store'
import { PublicSite } from './public'
import { AuthView } from './auth'
import { AppShell } from './app-shell'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
})

export default function RelayApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <RelayRoot />
    </QueryClientProvider>
  )
}

function RelayRoot() {
  const session = useSession()
  const { path, navigate, sync } = useRouter()

  useEffect(() => {
    sync()
    session.refresh()
    // Handle invitation deep links: /?verify-invite=TOKEN → #/invite/TOKEN
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('verify-invite')
    if (invite && !window.location.hash) {
      window.history.replaceState(null, '', '/')
      navigate(`#/invite/${invite}`)
    }
    const verifyEmail = params.get('verify-email')
    if (verifyEmail && !window.location.hash) {
      window.history.replaceState(null, '', '/')
      navigate(`#/verify/${verifyEmail}`)
    }
  }, [])

  // Authenticated users always land in the application; unknown hashes route
  // to the overview instead of a dead end.
  useEffect(() => {
    if (session.authenticated && !path.startsWith('/app') && !path.startsWith('/verify/') && !path.startsWith('/invite/') && !['/login', '/register'].includes(path)) {
      navigate('/app')
    }
  }, [session.authenticated, path])

  if (session.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080D17]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#26374C] border-t-[#35D6C0]" />
          <div className="text-sm text-dim">Loading AZIMARA RELAY…</div>
        </div>
      </div>
    )
  }

  if (path.startsWith('/invite/')) {
    return <AuthView mode="invite" token={path.slice('/invite/'.length)} />
  }
  if (path.startsWith('/verify/')) {
    return <AuthView mode="verify" token={path.slice('/verify/'.length)} />
  }

  const authRoutes = ['/login', '/register']
  if (authRoutes.includes(path) || (path.startsWith('/login') && path.includes('/mfa'))) {
    return <AuthView mode={path === '/register' ? 'register' : 'login'} />
  }

  if (!session.authenticated) {
    // Public website; auth actions available via header.
    return <PublicSite />
  }

  if (!session.mfaPassed && session.mfaEnabled) {
    return <AuthView mode="mfa" />
  }

  if (!session.activeOrg && session.organizations.length === 0) {
    return <AuthView mode="create-org" />
  }

  return <AppShell />
}
