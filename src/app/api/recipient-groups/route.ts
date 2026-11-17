import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

export const GET = route(async ({ org }) => {
  const groups = await db.recipientGroup.findMany({ where: { orgId: org.org.id }, include: { _count: { select: { recipients: true } } } })
  return ok({ groups: groups.map((g) => ({ id: g.id, name: g.name, recipientCount: g._count.recipients, createdAt: g.createdAt })) })
})

const createSchema = z.object({ name: z.string().min(1).max(60) })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, createSchema)
  const dupe = await db.recipientGroup.findUnique({ where: { orgId_name: { orgId: org.org.id, name: body.name } } })
  if (dupe) throw new ApiError('DUPLICATE_GROUP', 'A group with this name already exists', 409)
  const group = await db.recipientGroup.create({ data: { orgId: org.org.id, name: body.name } })
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECIPIENT_GROUP_CREATED', resourceType: 'RecipientGroup', resourceId: group.id })
  return ok({ id: group.id, name: group.name })
}, { permission: 'recipient:manage' })
