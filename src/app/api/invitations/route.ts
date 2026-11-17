import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { isRole } from '@/lib/rbac'
import { randomToken, sha256 } from '@/lib/crypto'
import { entitlementsFor } from '@/lib/entitlements'

export const GET = route(async ({ org }) => {
  const invites = await db.invitation.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' } })
  return ok({
    invitations: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, status: i.status, expiresAt: i.expiresAt, createdAt: i.createdAt })),
    pendingCount: invites.filter((i) => i.status === 'PENDING').length,
    seatLimit: entitlementsFor(org.org.plan).seats,
    membersCount: await db.membership.count({ where: { orgId: org.org.id } }),
  })
})

const inviteSchema = z.object({ email: z.string().email(), role: z.string() })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, inviteSchema)
  if (!isRole(body.role)) throw new ApiError('VALIDATION_FAILED', 'Unknown role', 422)
  const ent = entitlementsFor(org.org.plan)
  const [memberCount, pendingCount] = await Promise.all([
    db.membership.count({ where: { orgId: org.org.id } }),
    db.invitation.count({ where: { orgId: org.org.id, status: 'PENDING', expiresAt: { gt: new Date() } } }),
  ])
  if (memberCount + pendingCount >= ent.seats) {
    throw new ApiError('SEAT_LIMIT_REACHED', `Plan seat limit reached (${ent.seats}). Upgrade to invite more members.`, 402)
  }
  const existingMember = await db.membership.findFirst({ where: { orgId: org.org.id, user: { email: body.email.toLowerCase() } } })
  if (existingMember) throw new ApiError('ALREADY_MEMBER', 'This user is already a member of the organization', 409)
  const rawToken = randomToken(24)
  await db.invitation.create({
    data: {
      orgId: org.org.id,
      email: body.email.toLowerCase(),
      role: body.role,
      tokenHash: sha256(rawToken),
      invitedBy: auth.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'INVITATION_CREATED', resourceType: 'Invitation', resourceId: body.email, data: { role: body.role } })
  return ok({
    invited: true,
    email: body.email,
    emailDeliveryConfigured: false,
    invitationToken: rawToken,
    inviteUrl: `/?verify-invite=${rawToken}`,
  })
}, { permission: 'team:manage' })

const revokeSchema = z.object({ invitationId: z.string() })

export const DELETE = route(async ({ org, auth, request }) => {
  const body = await readJson(request, revokeSchema)
  const invite = await db.invitation.findFirst({ where: { id: body.invitationId, orgId: org.org.id } })
  if (!invite) throw new ApiError('NOT_FOUND', 'Invitation not found', 404)
  await db.invitation.update({ where: { id: invite.id }, data: { status: 'REVOKED' } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'INVITATION_REVOKED', resourceType: 'Invitation', resourceId: invite.id })
  return ok({ revoked: true })
}, { permission: 'team:manage' })
