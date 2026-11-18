'use client'

import { useEffect, useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter, useSession } from '@/lib/client/store'
import { PageHeader, SectionCard, ErrorState } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ShieldCheck, KeyRound, LogOut, Building2, MailCheck, ShieldOff } from 'lucide-react'
import { setupTotpClient, enableTotpClient } from '@/lib/client/mfa'
import { getMotionPrefs, setMotionPref, haptic, hapticsSupported, subscribeMotionPrefs, type MotionPrefs } from '@/lib/client/motion'

type OrgData = {
  id: string
  name: string
  slug: string
  role: string
  settings: { network?: string; defaultApprovalExpiryDays?: number }
  counts: { wallets: number; recipients: number; payments: number }
}

export function PrefRow({ title, detail, checked, onChange, disabled }: { title: string; detail: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-dim">{detail}</div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="data-[state=checked]:bg-[#39C6D8]"
        aria-label={title}
      />
    </div>
  )
}

export function SettingsView() {
  const { navigate } = useRouter()
  const session = useSession()
  const org = useApi<OrgData>(['org-active'], '/api/organizations/active')
  const [name, setName] = useState('')
  const [mfa, setMfa] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaDisableOpen, setMfaDisableOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNext, setPwNext] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [devVerifyToken, setDevVerifyToken] = useState<string | null>(null)

  const isOwner = session.activeOrg?.role === 'OWNER'

  // Motion & haptics preferences — device-local (localStorage), subscribable.
  const [motionPrefs, setMotionPrefsState] = useState<MotionPrefs>(() => getMotionPrefs())
  useEffect(() => subscribeMotionPrefs(setMotionPrefsState), [])

  function updateMotionPref<K extends keyof MotionPrefs>(key: K, value: MotionPrefs[K]) {
    setMotionPref(key, value)
    haptic('toggle')
  }

  // Initialize the editable org name once, when data first arrives (never clobber user edits).
  const orgName = org.data?.name
  useEffect(() => {
    setName((current) => current || orgName || '')
  }, [orgName])

  async function saveOrg() {
    setBusy(true)
    try {
      await api('/api/organizations/active', { method: 'PATCH', json: { name: name || undefined } })
      toast.success('Organization updated')
      session.refresh()
      org.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function changeNetwork(network: string) {
    try {
      await api('/api/organizations/active', { method: 'PATCH', json: { network } })
      toast.success(`Default network set to ${network} for new wallets`)
      org.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Only owners and treasury admins can change settings')
    }
  }

  async function startMfa() {
    try {
      const res = await setupTotpClient()
      setMfa(res)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'MFA setup failed')
    }
  }

  async function confirmMfa() {
    if (mfaBusy) return
    setMfaBusy(true)
    try {
      await enableTotpClient(mfaCode)
      toast.success('MFA enabled — you will be challenged at next sign-in')
      setMfa(null)
      setMfaCode('')
      session.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setMfaBusy(false)
    }
  }

  async function disableMfa() {
    if (mfaBusy) return
    if (mfaCode.length !== 6) return toast.error('Enter the current 6-digit code to disable MFA')
    setMfaBusy(true)
    try {
      await api('/api/auth/mfa', { json: { action: 'disable', code: mfaCode } })
      toast.success('MFA disabled — re-enable it any time')
      setMfaDisableOpen(false)
      setMfaCode('')
      session.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setMfaBusy(false)
    }
  }

  async function changePassword() {
    if (busy) return
    if (pwNext.length < 10) return toast.error('New password must be at least 10 characters')
    if (pwNext !== pwConfirm) return toast.error('New passwords do not match')
    setBusy(true)
    try {
      await api('/api/auth/password-change', { json: { currentPassword: pwCurrent, newPassword: pwNext } })
      toast.success('Password updated — other sessions were signed out')
      setPwCurrent(''); setPwNext(''); setPwConfirm('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password change failed')
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    if (busy) return
    setBusy(true)
    try {
      const res = await api<{ sent: boolean; emailDelivery: { configured: boolean; verificationToken?: string; note: string } }>('/api/auth/resend-verification', { json: {} })
      if (res.emailDelivery.configured) {
        toast.success('Verification link emailed')
      } else {
        setDevVerifyToken(res.emailDelivery.verificationToken ?? null)
        toast.info('Email delivery not configured — verification link surfaced below')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Organization profile, security and workspace preferences." breadcrumb={['Relay', 'Administration', 'Settings']} />
      {org.isError ? <ErrorState message={String(org.error)} retry={() => org.refetch()} /> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Organization profile" description={org.data ? `${org.data.counts.wallets} wallets · ${org.data.counts.recipients} recipients · ${org.data.counts.payments} payments` : undefined}>
          <div className="space-y-3">
            <div>
              <Label>Organization name</Label>
              <div className="mt-1 flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} className="border-[#1D2E42] bg-[#0D1622]" />
                <Button onClick={saveOrg} disabled={busy || !isOwner} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">Save</Button>
              </div>
              <p className="mt-1 text-[11px] text-dim">Slug: {org.data?.slug ?? '—'}</p>
            </div>
            <div>
              <Label>Default network for new wallets</Label>
              <Select value={org.data?.settings.network ?? 'devnet'} onValueChange={changeNetwork} disabled={!isOwner}>
                <SelectTrigger className="mt-1 w-56 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                <SelectContent className="border-[#1D2E42] bg-[#142436]">
                  <SelectItem value="devnet">Devnet</SelectItem>
                  <SelectItem value="mainnet-beta">Mainnet-beta</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-dim">Devnet and production environments remain isolated regardless of this default.</p>
            </div>
            <div>
              <Label>Your role</Label>
              <div className="mt-1 text-sm text-secondary">{session.activeOrg?.role.replaceAll('_', ' ')}</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Security" description="Two-factor authentication with TOTP authenticator apps.">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${session.mfaEnabled ? 'text-[#2ED3A6]' : 'text-dim'}`} />
                <div>
                  <div className="text-sm">Authenticator app (TOTP)</div>
                  <div className="text-[11px] text-dim">{session.mfaEnabled ? 'Enabled — codes required at sign-in' : 'Not enabled'}</div>
                </div>
              </div>
              {!session.mfaEnabled ? (
                <Button size="sm" onClick={startMfa} variant="outline" className="border-[#1D2E42]">Set up</Button>
              ) : mfaDisableOpen ? (
                <div className="flex items-center gap-2">
                  <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Code" className="w-24 border-[#1D2E42] bg-[#0D1622] font-mono" aria-label="Current authenticator code" />
                  <Button size="sm" variant="destructive" onClick={disableMfa} disabled={mfaBusy}>Disable</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setMfaDisableOpen(false); setMfaCode('') }} className="text-dim">Keep</Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => setMfaDisableOpen(true)} variant="ghost" className="text-xs text-[#F27683] hover:text-[#F27683]">
                  <ShieldOff className="mr-1 h-3.5 w-3.5" /> Disable
                </Button>
              )}
            </div>
            {mfa ? (
              <div className="rounded-lg border border-[#39C6D8]/30 bg-[#39C6D8]/5 p-3">
                <div className="text-xs font-medium text-[#39C6D8]">1. Add this secret to your authenticator app:</div>
                <code className="mt-1.5 block truncate rounded bg-[#0D1622] px-2 py-1.5 font-mono text-xs text-[#39C6D8]">{mfa.secret}</code>
                <div className="mt-1 truncate font-mono text-[10px] text-dim">{mfa.otpauthUri}</div>
                <div className="mt-2 text-xs font-medium text-[#39C6D8]">2. Enter the current 6-digit code:</div>
                <div className="mt-1 flex gap-2">
                  <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="border-[#1D2E42] bg-[#0D1622] font-mono" />
                  <Button onClick={confirmMfa} disabled={mfaBusy || mfaCode.length !== 6} className="bg-[#39C6D8] font-medium text-[#04121A]">Verify</Button>
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3 text-[11px] leading-relaxed text-dim">
              <KeyRound className="mr-1 inline h-3 w-3" /> Sessions are httpOnly cookies; MFA challenges block sensitive operations until passed. Passwords use scrypt hashing; provider credentials and TOTP secrets are AES-256-GCM encrypted at rest.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Workspace">
          <div className="space-y-2 text-sm">
            {session.organizations.map((o) => (
              <button key={o.id} onClick={() => { session.setActive(o.id); org.refetch() }} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left ${o.id === session.activeOrg?.id ? 'border-[#39C6D8]/50 bg-[#39C6D8]/5' : 'border-[#1D2E42] bg-[#0D1622] hover:bg-[#142436]'}`}>
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-dim" />
                  <span className="text-sm">{o.name}</span>
                </span>
                <span className="text-[11px] text-dim">{o.role.replaceAll('_', ' ')}{o.id === session.activeOrg?.id ? ' · active' : ''}</span>
              </button>
            ))}
            <Button
              variant="outline"
              className="w-full border-[#1D2E42]"
              onClick={async () => {
                const name = window.prompt('New organization name')
                if (!name) return
                try {
                  await api('/api/organizations', { json: { name } })
                  await session.refresh()
                  toast.success('Organization created')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed')
                }
              }}
            >
              Create new organization
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Motion & haptics" description="Interface feedback preferences. Stored on this device only.">
          <div className="space-y-3">
            <PrefRow
              title="Interface animations"
              detail="Micro-interactions, reveals and view transitions. Off disables all decorative motion."
              checked={motionPrefs.animations}
              onChange={(v) => updateMotionPref('animations', v)}
            />
            <PrefRow
              title="3D depth effects"
              detail="Perspective tilt, parallax layers and the hero scene. Desktop pointers only."
              checked={motionPrefs.depth}
              onChange={(v) => updateMotionPref('depth', v)}
            />
            <PrefRow
              title={hapticsSupported() ? 'Haptic feedback' : 'Haptic feedback (not on this device)'}
              detail={hapticsSupported() ? 'Vibration taps for navigation, approvals and notifications (supported browsers).' : 'Your browser does not expose the Vibration API — iOS Safari has none; Android Chrome does.'}
              checked={motionPrefs.haptics && hapticsSupported()}
              disabled={!hapticsSupported()}
              onChange={(v) => updateMotionPref('haptics', v)}
            />
            <div className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3 text-[11px] leading-relaxed text-dim">
              Your OS “reduce motion” setting always wins: when it is on, animations and haptics are disabled regardless of these toggles (WCAG 2.3.3).
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Password" description="Changing your password signs out every other session — this device stays signed in.">
          <div className="space-y-3">
            <div>
              <Label htmlFor="pw-current">Current password</Label>
              <Input id="pw-current" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" className="mt-1 border-[#1D2E42] bg-[#0D1622]" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pw-next">New password</Label>
                <Input id="pw-next" type="password" value={pwNext} onChange={(e) => setPwNext(e.target.value)} placeholder="Minimum 10 characters" autoComplete="new-password" className="mt-1 border-[#1D2E42] bg-[#0D1622]" />
              </div>
              <div>
                <Label htmlFor="pw-confirm">Confirm new password</Label>
                <Input id="pw-confirm" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" onKeyDown={(e) => { if (e.key === 'Enter' && !(e.nativeEvent instanceof KeyboardEvent && e.nativeEvent.isComposing)) changePassword() }} className="mt-1 border-[#1D2E42] bg-[#0D1622]" />
              </div>
            </div>
            <Button onClick={changePassword} disabled={busy || !pwCurrent || !pwNext || !pwConfirm} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">Update password</Button>
          </div>
        </SectionCard>

        <SectionCard title="Session">
          <div className="space-y-3">
            <div className="text-xs text-dim">Signed in as <span className="text-secondary">{session.user?.email}</span>{session.emailVerified ? '' : ' — email not yet verified'}</div>
            {!session.emailVerified ? (
              <div className="rounded-lg border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#F2BB62]"><MailCheck className="h-3.5 w-3.5" /> Verify your email</div>
                <p className="mt-1 text-[11px] text-[#F2BB62]/80">Unverified accounts keep working, but recovery emails cannot reach you.</p>
                <Button size="sm" variant="outline" onClick={resendVerification} disabled={busy} className="mt-2 border-[#F2BB62]/40 text-[#F2BB62]">Resend verification link</Button>
                {devVerifyToken ? (
                  <button
                    className="mt-2 block w-full truncate rounded bg-[#0D1622] px-2 py-1.5 text-left font-mono text-[10px] text-[#39C6D8] hover:underline"
                    onClick={() => { window.location.hash = `/verify/${devVerifyToken}` }}
                  >
                    #/verify/{devVerifyToken}
                  </button>
                ) : null}
              </div>
            ) : null}
            <Button
              variant="outline"
              onClick={async () => {
                await session.signOut()
                navigate('/')
              }}
              className="w-full border-[#F27683]/40 text-[#F27683]"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
