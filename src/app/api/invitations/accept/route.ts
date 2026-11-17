import { z } from 'zod'
import { ok, readJson, fail, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { sha256 } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { registerUser } from '@/lib/auth'

const schema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(80).optional(),
  password: z.string().min(10).max(200).optional(), // required when the email has no account
})

export async function POST(request: Request) {
  try {
    const body = await readJson(request, schema)
    const invite = await db.invitation.findUnique({ where: { tokenHash: sha256(body.token) }, include: { org: true } })
    if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
      throw new ApiError('INVALID_INVITATION', 'This invitation is invalid, revoked, or expired.', 400)
    }
    let user = await db.user.findUnique({ where: { email: invite.email } })
    if (!user) {
      if (!body.password) throw new ApiError('ACCOUNT_REQUIRED', 'No account exists for this email yet. Provide a name and password to create one.', 422)
      const reg = await registerUser({ email: invite.email, password: body.password, name: body.name ?? invite.email.split('@')[0] })
      user = reg.user
    }
    const existingMembership = await db.membership.findUnique({ where: { orgId_userId: { orgId: invite.orgId, userId: user.id } } })
    if (existingMembership) throw new ApiError('ALREADY_MEMBER', 'You are already a member of this organization', 409)
    await db.membership.create({ data: { orgId: invite.orgId, userId: user.id, role: invite.role } })
    await db.invitation.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } })
    await audit({ orgId: invite.orgId, actorId: user.id, action: 'INVITATION_ACCEPTED', resourceType: 'Membership', resourceId: invite.id, data: { role: invite.role } })
    return ok({ joined: true, organization: { id: invite.org.id, name: invite.org.name }, role: invite.role })
  } catch (err) {
    return fail(request, err)
  }
}
