'use client'

import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSession, useRouter } from '@/lib/client/store'
import { hydrateMotionPrefs } from '@/lib/client/motion'
import { PublicSite } from './public'
import { AuthView } from './auth'
import { AppShell } from './app-shell'
import { BootSplash } from './states'

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

  // Motion preferences (animations/haptics/depth) gate every decorative
  // effect — hydrate them onto <html> before first paint of any surface.
  useEffect(() => {
    hydrateMotionPrefs()
  }, [])

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

  // Authenticated users always land in the application for unknown hashes
  // (no dead ends) and for auth screens (login/register are irrelevant once
  // signed in). Known public marketing routes stay browsable — the public
  // header shows "Open app" for signed-in visitors by design.
  useEffect(() => {
    const publicRoutes = ['/', '/product', '/treasury', '/payouts', '/intelligence', '/integrations', '/developers', '/security', '/pricing', '/company', '/legal', '/contact']
    const authScreens = ['/login', '/register', '/forgot']
    if (session.authenticated && !path.startsWith('/app') && !path.startsWith('/verify/') && !path.startsWith('/invite/') && !path.startsWith('/reset/') && !publicRoutes.includes(path) && !authScreens.includes(path)) {
      navigate('/app')
    }
  }, [session.authenticated, path])

  if (session.loading) return <BootSplash />

  if (path.startsWith('/invite/')) {
    // Keyed remount: a fresh token must reset the idempotency guards and the
    // mount-time state (a reused instance would capture stale token state).
    return <AuthView key={`invite-${path}`} mode="invite" token={path.slice('/invite/'.length)} />
  }
  if (path.startsWith('/verify/')) {
    return <AuthView key={`verify-${path}`} mode="verify" token={path.slice('/verify/'.length)} />
  }
  if (path === '/forgot') {
    return <AuthView key="forgot" mode="forgot" />
  }
  if (path.startsWith('/reset/')) {
    return <AuthView key={`reset-${path}`} mode="reset" token={path.slice('/reset/'.length)} />
  }

  // MFA gate MUST be evaluated before the authRoutes branch: after the login
  // endpoint sets the session cookie on the mfaRequired response, the session
  // is authenticated but not yet MFA-trusted — routing /login/mfa to the plain
  // login form here would loop forever between login and MFA.
  if (!session.mfaPassed && session.mfaEnabled && session.authenticated) {
    return <AuthView mode="mfa" />
  }

  const authRoutes = ['/login', '/register']
  if (authRoutes.includes(path) || (path.startsWith('/login') && path.includes('/mfa'))) {
    // Signed-in users on auth screens go straight to the app.
    if (session.authenticated) return <AppShell />
    return <AuthView mode={path === '/register' ? 'register' : 'login'} />
  }

  // Public website: anonymous visitors, plus signed-in users who chose to
  // browse a known marketing route (header shows "Open app").
  const publicRoutes = ['/', '/product', '/treasury', '/payouts', '/intelligence', '/integrations', '/developers', '/security', '/pricing', '/company', '/legal', '/contact']
  if (!session.authenticated || publicRoutes.includes(path)) {
    return <PublicSite />
  }

  if (!session.activeOrg && session.organizations.length === 0) {
    return <AuthView mode="create-org" />
  }

  return <AppShell />
}
