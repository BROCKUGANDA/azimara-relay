'use client'

import { useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useSession } from '@/lib/client/store'
import { timeAgo } from '@/lib/client/format'
import { PageHeader, EmptyState, ErrorState, DataTable, SectionCard } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { UserPlus, Trash2, Copy, RefreshCw } from 'lucide-react'
import { copyText } from '@/lib/client/clipboard'

type Member = { id: string; userId: string; email: string; name: string; role: string; lastLoginAt: string | null; joinedAt: string }
type Invite = { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string }

const ROLES = ['OWNER', 'TREASURY_ADMIN', 'FINANCE_OPERATOR', 'APPROVER', 'ANALYST', 'AUDITOR']

function inviteExpiryLabel(expiresAt: string): string {
  const ts = new Date(expiresAt).getTime()
  if (Number.isNaN(ts)) return '—'
  const days = Math.ceil((ts - Date.now()) / 86_400_000)
  return days <= 0 ? 'expired' : `expires in ${days}d`
}

export function TeamView() {
  const session = useSession()
  const members = useApi<{ members: Member[]; roles: string[]; seatLimit: number }>(['members'], '/api/members')
  const invites = useApi<{ invitations: Invite[]; seatLimit: number; membersCount: number }>(['invitations'], '/api/invitations')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [form, setForm] = useState({ email: '', role: 'APPROVER' })
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isOwner = session.activeOrg?.role === 'OWNER'
  const canManage = ['OWNER', 'TREASURY_ADMIN'].includes(session.activeOrg?.role ?? '')

  async function invite() {
    const email = form.email.trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error('Enter a valid email address')
      return
    }
    setBusy(true)
    try {
      const res = await api<{ inviteUrl: string; emailDeliveryConfigured: boolean }>('/api/invitations', { json: { ...form, email } })
      setInviteLink(res.inviteUrl)
      toast.success(`Invitation created for ${email}`)
      invites.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invitation failed')
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(membershipId: string, role: string) {
    try {
      await api('/api/members', { method: 'PATCH', json: { membershipId, role } })
      toast.success('Role updated')
      members.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function remove(membershipId: string) {
    if (!window.confirm('Remove this member from the organization?')) return
    try {
      await api('/api/members', { method: 'DELETE', json: { membershipId } })
      toast.success('Member removed')
      members.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function revokeInvite(invitationId: string) {
    try {
      await api('/api/invitations', { method: 'DELETE', json: { invitationId } })
      toast.success('Invitation revoked')
      invites.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function resendInvite(invitationId: string, email: string) {
    setBusy(true)
    try {
      const res = await api<{ inviteUrl: string; emailDeliveryConfigured: boolean; deliveryNote: string }>('/api/invitations', { method: 'PATCH', json: { invitationId } })
      const copied = await copyText(res.inviteUrl)
      if (res.emailDeliveryConfigured) toast.success(`Fresh invitation link emailed to ${email}${copied ? ' and copied' : ''}`)
      else toast.success(`Fresh link copied — share it with ${email} directly (email delivery not configured)`)
      invites.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resend failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description={`${(members.data?.members ?? []).length} of ${invites.data?.seatLimit ?? 3} seats used. Permissions are enforced server-side on every operation.`}
        breadcrumb={['Relay', 'Administration', 'Team']}
        actions={
          canManage ? (
            <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setInviteLink(null) }}>
              <DialogTrigger asChild><Button className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90"><UserPlus className="mr-1.5 h-4 w-4" /> Invite member</Button></DialogTrigger>
              <DialogContent aria-describedby={undefined} className="border-[#1D2E42] bg-[#101C2C]">
                <DialogHeader><DialogTitle>Invite a member</DialogTitle></DialogHeader>
                {inviteLink ? (
                  <div className="rounded-lg border border-[#2ED3A6]/40 bg-[#2ED3A6]/5 p-3 text-xs">
                    <div className="font-medium text-[#2ED3A6]">Invitation created. Email delivery is not configured in this environment — share the link directly:</div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-[#0D1622] px-2 py-1.5 font-mono text-[10px] text-[#39C6D8]">{inviteLink}</code>
                      <Button size="sm" variant="outline" className="border-[#1D2E42]" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success('Copied') }}><Copy className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 border-[#1D2E42] bg-[#0D1622]" /></div>
                    <div>
                      <Label>Role</Label>
                      <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                        <SelectTrigger className="mt-1 border-[#1D2E42] bg-[#0D1622]"><SelectValue /></SelectTrigger>
                        <SelectContent className="border-[#1D2E42] bg-[#142436]">
                          {ROLES.filter((r) => r !== 'OWNER' || isOwner).map((r) => <SelectItem key={r} value={r}>{r.replaceAll('_', ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={invite} disabled={busy || !form.email} className="w-full bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">Create invitation</Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {members.isError ? <ErrorState message={String(members.error)} retry={() => members.refetch()} /> : null}

      <DataTable
        loading={members.isLoading}
        keyOf={(m) => m.id}
        rows={members.data?.members ?? []}
        columns={[
          { key: 'name', header: 'Member', render: (m) => <div><div className="text-sm">{m.name}</div><div className="text-[10px] text-dim">{m.email}</div></div> },
          { key: 'role', header: 'Role', render: (m) => canManage && m.role !== 'OWNER' ? (
            <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
              <SelectTrigger className="h-8 w-full min-w-[9rem] border-[#1D2E42] bg-[#0D1622] text-xs sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent className="border-[#1D2E42] bg-[#142436]">{ROLES.filter((r) => r !== 'OWNER' || isOwner).map((r) => <SelectItem key={r} value={r}>{r.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
            </Select>
          ) : <span className="text-xs text-secondary">{m.role.replaceAll('_', ' ')}</span> },
          { key: 'login', header: 'Last active', render: (m) => <span className="text-xs text-dim">{m.lastLoginAt ? timeAgo(m.lastLoginAt) : 'never'}</span> },
          { key: 'act', header: '', className: 'text-right', render: (m) => canManage && m.email !== session.user?.email ? <Button size="sm" variant="ghost" aria-label="Remove member" className="h-9 px-3 text-[#F27683]" onClick={() => remove(m.id)}><Trash2 className="h-3 w-3" /></Button> : null },
        ]}
      />

      <SectionCard className="mt-5" title="Pending invitations">
        {(invites.data?.invitations ?? []).filter((i) => i.status === 'PENDING').length === 0 ? (
          <div className="text-xs text-dim">No pending invitations.</div>
        ) : (
          <div className="space-y-2">
            {(invites.data?.invitations ?? []).filter((i) => i.status === 'PENDING').map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border border-[#1D2E42] bg-[#0D1622] p-3">
                <div>
                  <div className="text-xs">{i.email} <span className="text-dim">· {i.role.replaceAll('_', ' ')}</span></div>
                  <div className="text-[10px] text-dim">{inviteExpiryLabel(i.expiresAt)}</div>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-9 px-3 text-xs text-dim" disabled={busy} onClick={() => resendInvite(i.id, i.email)}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Resend / copy link
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 px-3 text-xs text-[#F27683]" onClick={() => revokeInvite(i.id)}>Revoke</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard className="mt-5" title="Role permissions">
        <div className="grid grid-cols-1 gap-2 text-xs text-dim sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Owner', 'Full organization administration'],
            ['Treasury admin', 'Wallets, payments, policies, reporting'],
            ['Finance operator', 'Create batches and payment requests'],
            ['Approver', 'Review and authorize assigned requests'],
            ['Analyst', 'Read-only reports and transaction visibility'],
            ['Auditor', 'Read-only audit records and exports'],
          ].map(([r, d]) => (
            <div key={r} className="rounded-lg border border-[#1D2E42] bg-[#0D1622] p-2.5">
              <div className="font-medium text-secondary">{r}</div>
              <div className="mt-0.5">{d}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
