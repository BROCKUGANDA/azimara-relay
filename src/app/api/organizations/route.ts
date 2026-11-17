import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { createOrganization } from '@/lib/organizations'
import { db } from '@/lib/db'

const createSchema = z.object({ name: z.string().min(2).max(80) })

export const GET = route(async ({ auth }) => {
  const memberships = await db.membership.findMany({ where: { userId: auth.user.id }, include: { org: true }, orderBy: { createdAt: 'asc' } })
  return ok(memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug, role: m.role, status: m.org.status, plan: m.org.plan, createdAt: m.org.createdAt })))
})

export const POST = route(async ({ auth, request }) => {
  const body = await readJson(request, createSchema)
  const org = await createOrganization(auth.user, body.name)
  return ok({ id: org.id, name: org.name, slug: org.slug })
})
