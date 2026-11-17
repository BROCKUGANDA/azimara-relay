'use client'

import { useEffect, useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter, useSession } from '@/lib/client/store'
import { PageHeader, SectionCard, ErrorState } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { ShieldCheck, KeyRound, LogOut, Building2 } from 'lucide-react'
import { setupTotpClient, enableTotpClient } from '@/lib/client/mfa'

type OrgData = {
  id: string
  name: string
  slug: string
  role: string
  settings: { network?: string; defaultApprovalExpiryDays?: number }
  counts: { wallets: number; recipients: number; payments: number }
}

export function SettingsView() {
  const { navigate } = useRouter()
  const session = useSession()
  const org = useApi<OrgData>(['org-active'], '/api/organizations/active')
  const [name, setName] = useState('')
  const [mfa, setMfa] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [busy, setBusy] = useState(false)

  const isOwner = session.activeOrg?.role === 'OWNER'

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
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} className="border-[#26374C] bg-[#0B1220]" />
                <Button onClick={saveOrg} disabled={busy || !isOwner} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">Save</Button>
              </div>
              <p className="mt-1 text-[11px] text-dim">Slug: {org.data?.slug ?? '—'}</p>
            </div>
            <div>
              <Label>Default network for new wallets</Label>
              <Select value={org.data?.settings.network ?? 'devnet'} onValueChange={changeNetwork} disabled={!isOwner}>
                <SelectTrigger className="mt-1 w-56 border-[#26374C] bg-[#0B1220]"><SelectValue /></SelectTrigger>
                <SelectContent className="border-[#26374C] bg-[#142135]">
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
            <div className="flex items-center justify-between rounded-lg border border-[#26374C] bg-[#0B1220] p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${session.mfaEnabled ? 'text-[#36C995]' : 'text-dim'}`} />
                <div>
                  <div className="text-sm">Authenticator app (TOTP)</div>
                  <div className="text-[11px] text-dim">{session.mfaEnabled ? 'Enabled — codes required at sign-in' : 'Not enabled'}</div>
                </div>
              </div>
              {!session.mfaEnabled ? (
                <Button size="sm" onClick={startMfa} variant="outline" className="border-[#26374C]">Set up</Button>
              ) : null}
            </div>
            {mfa ? (
              <div className="rounded-lg border border-[#35D6C0]/30 bg-[#35D6C0]/5 p-3">
                <div className="text-xs font-medium text-[#35D6C0]">1. Add this secret to your authenticator app:</div>
                <code className="mt-1.5 block truncate rounded bg-[#0B1220] px-2 py-1.5 font-mono text-xs text-[#35D6C0]">{mfa.secret}</code>
                <div className="mt-1 truncate font-mono text-[10px] text-dim">{mfa.otpauthUri}</div>
                <div className="mt-2 text-xs font-medium text-[#35D6C0]">2. Enter the current 6-digit code:</div>
                <div className="mt-1 flex gap-2">
                  <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="border-[#26374C] bg-[#0B1220] font-mono" />
                  <Button onClick={confirmMfa} disabled={mfaBusy || mfaCode.length !== 6} className="bg-[#35D6C0] font-medium text-[#062A26]">Verify</Button>
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-[#26374C] bg-[#0B1220] p-3 text-[11px] leading-relaxed text-dim">
              <KeyRound className="mr-1 inline h-3 w-3" /> Sessions are httpOnly cookies; MFA challenges block sensitive operations until passed. Passwords use scrypt hashing; provider credentials and TOTP secrets are AES-256-GCM encrypted at rest.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Workspace">
          <div className="space-y-2 text-sm">
            {session.organizations.map((o) => (
              <button key={o.id} onClick={() => { session.setActive(o.id); org.refetch() }} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left ${o.id === session.activeOrg?.id ? 'border-[#35D6C0]/50 bg-[#35D6C0]/5' : 'border-[#26374C] bg-[#0B1220] hover:bg-[#142135]'}`}>
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-dim" />
                  <span className="text-sm">{o.name}</span>
                </span>
                <span className="text-[11px] text-dim">{o.role.replaceAll('_', ' ')}{o.id === session.activeOrg?.id ? ' · active' : ''}</span>
              </button>
            ))}
            <Button
              variant="outline"
              className="w-full border-[#26374C]"
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

        <SectionCard title="Session">
          <div className="space-y-3">
            <div className="text-xs text-dim">Signed in as <span className="text-secondary">{session.user?.email}</span>{session.emailVerified ? '' : ' — email not yet verified'}</div>
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
