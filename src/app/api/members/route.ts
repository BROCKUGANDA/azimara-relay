import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { isRole, ROLES } from '@/lib/rbac'
import { entitlementsFor } from '@/lib/entitlements'

export const GET = route(async ({ org }) => {
  const members = await db.membership.findMany({ where: { orgId: org.org.id }, include: { user: { select: { id: true, email: true, name: true, lastLoginAt: true } } }, orderBy: { createdAt: 'asc' } })
  return ok({
    members: members.map((m) => ({ id: m.id, userId: m.user.id, email: m.user.email, name: m.user.name, role: m.role, lastLoginAt: m.user.lastLoginAt, joinedAt: m.createdAt })),
    roles: ROLES,
    seatLimit: entitlementsFor(org.org.plan).seats,
  })
})

const patchSchema = z.object({ membershipId: z.string(), role: z.string() })

export const PATCH = route(async ({ org, auth, request }) => {
  const body = await readJson(request, patchSchema)
  if (!isRole(body.role)) throw new ApiError('VALIDATION_FAILED', 'Unknown role', 422)
  const member = await db.membership.findFirst({ where: { id: body.membershipId, orgId: org.org.id } })
  if (!member) throw new ApiError('NOT_FOUND', 'Member not found', 404)
  if (member.role === 'OWNER' && body.role !== 'OWNER') {
    const owners = await db.membership.count({ where: { orgId: org.org.id, role: 'OWNER' } })
    if (owners <= 1) throw new ApiError('LAST_OWNER', 'An organization must keep at least one owner', 409)
  }
  await db.membership.update({ where: { id: member.id }, data: { role: body.role } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'MEMBER_ROLE_CHANGED', resourceType: 'Membership', resourceId: member.id, data: { role: body.role } })
  return ok({ updated: true })
}, { permission: 'team:manage' })

const removeSchema = z.object({ membershipId: z.string() })

export const DELETE = route(async ({ org, auth, request }) => {
  const body = await readJson(request, removeSchema)
  const member = await db.membership.findFirst({ where: { id: body.membershipId, orgId: org.org.id } })
  if (!member) throw new ApiError('NOT_FOUND', 'Member not found', 404)
  if (member.userId === auth.user.id) throw new ApiError('CANNOT_REMOVE_SELF', 'Leave the organization via settings instead', 409)
  if (member.role === 'OWNER') {
    const owners = await db.membership.count({ where: { orgId: org.org.id, role: 'OWNER' } })
    if (owners <= 1) throw new ApiError('LAST_OWNER', 'An organization must keep at least one owner', 409)
  }
  await db.membership.delete({ where: { id: member.id } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'MEMBER_REMOVED', resourceType: 'Membership', resourceId: member.id })
  return ok({ removed: true })
}, { permission: 'team:manage' })
