'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSession } from '@/lib/client/store'
import { api } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { haptic } from '@/lib/client/motion'
import { LogoGlyph } from './glyphs'
import { ShieldCheck, CheckCircle2, AlertTriangle, Building2 } from 'lucide-react'

type Mode = 'login' | 'register' | 'verify' | 'mfa' | 'create-org' | 'invite'

function AuthFrame({ children, title, sub }: { children: React.ReactNode; title: string; sub: string }) {
  const { navigate } = useRouter()
  return (
    <div className="relay-radial flex min-h-screen items-center justify-center bg-[#0C0A12] px-4 py-10">
      <div className="relay-grid-bg absolute inset-0 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <LogoGlyph size={40} className="mx-auto" />
          <div className="mt-3 text-sm font-semibold tracking-tight">AZIMARA <span className="text-[#E7B458]">RELAY</span></div>
        </div>
        <Card className="border-[#2E2540] bg-[#15111D] p-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-xs text-dim">{sub}</p>
          <div className="mt-5">{children}</div>
        </Card>
        <div className="mt-4 text-center text-xs text-dim">
          <button className="hover:text-[#E7B458]" onClick={() => navigate('/')}>← Back to site</button>
        </div>
      </div>
    </div>
  )
}

export function AuthView({ mode, token }: { mode: Mode; token?: string }) {
  const { navigate } = useRouter()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [otp, setOtp] = useState('')
  const [verifyState, setVerifyState] = useState<'pending' | 'ok' | 'error'>(token ? 'pending' : 'pending')
  const [devVerifyLink, setDevVerifyLink] = useState<string | null>(null)
  const [inviteState, setInviteState] = useState<'pending' | 'ok' | 'error' | 'needs-account'>('pending')
  const [inviteInfo, setInviteInfo] = useState<{ email?: string; orgName?: string }>({})
  // Idempotency guard: React StrictMode double-invokes effects, and the loser
  // of two concurrent verify/accept calls (token already consumed → 400) must
  // never overwrite a success state.
  const verifyStarted = useRef(false)
  const inviteStarted = useRef(false)

  // Auto-verify email when landing with a token.
  useEffect(() => {
    if (mode === 'verify' && token && verifyState === 'pending' && !verifyStarted.current) {
      verifyStarted.current = true
      api('/api/auth/verify-email', { json: { token } })
        .then(() => setVerifyState('ok'))
        .catch(() => setVerifyState('error'))
    }
  }, [mode, token, verifyState])

  // Invite preview: accept directly when account exists.
  useEffect(() => {
    if (mode === 'invite' && token && inviteState === 'pending' && !inviteStarted.current) {
      inviteStarted.current = true
      api('/api/invitations/accept', { json: { token } })
        .then(() => {
          setInviteState('ok')
          session.refresh()
        })
        .catch((err: { code?: string }) => {
          if (err?.code === 'ACCOUNT_REQUIRED') {
            setInviteState('needs-account')
          } else {
            setInviteState('error')
          }
        })
    }
  }, [mode, token, inviteState, session])

  async function register() {
    if (!email.trim() || !password || !name.trim()) return toast.error('Name, email and password are required')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error('Enter a valid email address')
    if (password.length < 10) return toast.error('Password must be at least 10 characters')
    setBusy(true)
    try {
      const res = await api<{ emailDelivery: { verificationToken: string } }>('/api/auth/register', {
        json: { name: name.trim(), email: email.trim(), password, organizationName: orgName.trim() || undefined },
      })
      // Email delivery is not configured in this environment: the verification
      // link is surfaced directly (genuine unconfigured-channel behavior).
      const link = `#/verify/${res.emailDelivery.verificationToken}`
      setDevVerifyLink(link)
      toast.success('Account created. Verify your email to continue.')
      haptic('success')
      if (orgName) await session.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  async function login() {
    if (!email.trim() || !password) return toast.error('Email and password are required')
    setBusy(true)
    haptic('tap')
    try {
      const res = await api<{ mfaRequired: boolean }>('/api/auth/login', { json: { email: email.trim(), password } })
      await session.refresh()
      if (res.mfaRequired) {
        navigate('/login/mfa')
        toast.info('Enter your authenticator code')
      } else {
        navigate('/app')
        haptic('success')
        toast.success('Welcome back')
      }
    } catch (err) {
      haptic('error')
      toast.error(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  async function submitMfa() {
    if (otp.length !== 6) return toast.error('Enter the 6-digit code')
    setBusy(true)
    try {
      await api('/api/auth/mfa', { json: { action: 'challenge', code: otp } })
      await session.refresh()
      navigate('/app')
      haptic('success')
      toast.success('Signed in')
    } catch (err) {
      haptic('error')
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'mfa') {
    return (
      <AuthFrame title="Two-factor authentication" sub="Enter the 6-digit code from your authenticator app.">
        <div className="flex flex-col items-center gap-4">
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button onClick={submitMfa} disabled={busy} className="w-full bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90">
            Verify and continue
          </Button>
        </div>
      </AuthFrame>
    )
  }

  if (mode === 'verify') {
    return (
      <AuthFrame title="Email verification" sub="Confirming your verification token.">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          {verifyState === 'ok' ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-[#43D48E]" />
              <div className="text-sm font-medium">Email verified</div>
              <p className="text-xs text-dim">You can now sign in and use all workspace features.</p>
              <Button onClick={() => navigate('/login')} className="mt-2 bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90">Go to sign in</Button>
            </>
          ) : verifyState === 'error' ? (
            <>
              <AlertTriangle className="h-10 w-10 text-[#F27683]" />
              <div className="text-sm font-medium">Verification failed</div>
              <p className="text-xs text-dim">The link is invalid or expired. Register again to receive a fresh verification flow.</p>
              <Button variant="outline" onClick={() => navigate('/register')} className="mt-2 border-[#2E2540]">Back to registration</Button>
            </>
          ) : (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2E2540] border-t-[#E7B458]" />
          )}
        </div>
      </AuthFrame>
    )
  }

  if (mode === 'invite') {
    return (
      <AuthFrame title="Organization invitation" sub="Joining an AZIMARA RELAY workspace.">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          {inviteState === 'ok' ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-[#43D48E]" />
              <div className="text-sm font-medium">You&apos;re in</div>
              <Button onClick={() => navigate('/app')} className="mt-2 bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90">Open workspace</Button>
            </>
          ) : inviteState === 'needs-account' ? (
            <>
              <Building2 className="h-8 w-8 text-[#E7B458]" />
              <div className="text-sm font-medium">Create your account to accept</div>
              <p className="text-xs text-dim">The invited email ({inviteInfo.email ?? 'this address'}) has no account yet. Provide a password below to finish joining.</p>
              <Input type="password" placeholder="Choose a password (min 10 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="border-[#2E2540] bg-[#100D16]" />
              <Button
                onClick={async () => {
                  if (password.length < 10) return toast.error('Password must be at least 10 characters')
                  setBusy(true)
                  try {
                    await api('/api/invitations/accept', { json: { token, password } })
                    setInviteState('ok')
                    await session.refresh()
                    navigate('/app')
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to accept invitation')
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
                className="w-full bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90"
              >
                Accept invitation
              </Button>
            </>
          ) : inviteState === 'error' ? (
            <>
              <AlertTriangle className="h-10 w-10 text-[#F27683]" />
              <div className="text-sm font-medium">Invitation invalid</div>
              <p className="text-xs text-dim">This invitation is revoked, expired, or already used.</p>
            </>
          ) : (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2E2540] border-t-[#E7B458]" />
          )}
        </div>
      </AuthFrame>
    )
  }

  if (mode === 'create-org') {
    return (
      <AuthFrame title="Create your first organization" sub="AZIMARA RELAY organizes payments by organization with isolated access control.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="org-name">Organization name</Label>
            <Input id="org-name" placeholder="Acme Treasury" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1.5 border-[#2E2540] bg-[#100D16]" />
          </div>
          <Button
            onClick={async () => {
              if (!orgName.trim() || orgName.trim().length < 2) return toast.error('Organization name is required')
              setBusy(true)
              try {
                await api('/api/organizations', { json: { name: orgName.trim() } })
                await session.refresh()
                navigate('/app')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to create organization')
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
            className="w-full bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90"
          >
            Create organization
          </Button>
          <button className="w-full text-center text-xs text-dim hover:text-[#E7B458]" onClick={() => navigate('/')}>Sign out instead</button>
        </div>
      </AuthFrame>
    )
  }

  const isRegister = mode === 'register'
  return (
    <AuthFrame title={isRegister ? 'Create your account' : 'Sign in'} sub={isRegister ? 'One account can operate multiple organization workspaces.' : 'Welcome back to your payment operations.'}>
      <div className="space-y-3">
        {isRegister && (
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" placeholder="Ada Obi" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 border-[#2E2540] bg-[#100D16]" />
          </div>
        )}
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 border-[#2E2540] bg-[#100D16]" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder={isRegister ? 'Minimum 10 characters' : '••••••••••'} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => {
            // IME-composition Enter (CJK candidates confirm) must not submit.
            if (e.key === 'Enter' && !(e.nativeEvent instanceof KeyboardEvent && e.nativeEvent.isComposing)) { if (isRegister) register(); else login() }
          }} className="mt-1.5 border-[#2E2540] bg-[#100D16]" />
        </div>
        {isRegister && (
          <div>
            <Label htmlFor="org">Organization (optional — create later)</Label>
            <Input id="org" placeholder="Acme Treasury" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1.5 border-[#2E2540] bg-[#100D16]" />
          </div>
        )}
        <Button onClick={isRegister ? register : login} disabled={busy} className="w-full bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90">
          {busy ? 'Working…' : isRegister ? 'Create account' : 'Sign in'}
        </Button>
        {devVerifyLink ? (
          <div className="rounded-lg border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-3 text-xs text-[#F2BB62]">
            <div className="flex items-center gap-1.5 font-medium"><ShieldCheck className="h-3.5 w-3.5" /> Email delivery not configured in this environment</div>
            <p className="mt-1 text-[#F2BB62]/80">In production this link would be emailed. Development verification:</p>
            <button className="mt-1.5 block w-full truncate rounded bg-[#100D16] px-2 py-1.5 text-left font-mono text-[10px] text-[#E7B458] hover:underline" onClick={() => {
              // SPA-internal navigation only: a reload here races the hashchange
              // router, which auto-verifies the token on the old page before the
              // fresh page repeats the call against a now-consumed token.
              window.location.hash = devVerifyLink.slice(1)
            }}>
              {devVerifyLink}
            </button>
          </div>
        ) : null}
        <div className="pt-1 text-center text-xs text-dim">
          {isRegister ? (
            <>Already have an account? <button className="text-[#E7B458] hover:underline" onClick={() => navigate('/login')}>Sign in</button></>
          ) : (
            <>New to AZIMARA RELAY? <button className="text-[#E7B458] hover:underline" onClick={() => navigate('/register')}>Create an account</button></>
          )}
        </div>
      </div>
    </AuthFrame>
  )
}
