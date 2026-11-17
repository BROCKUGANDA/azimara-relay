import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { db } from '@/lib/db'

export const GET = route(async ({ org }) => {
  const notifications = await db.notification.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: 50 })
  return ok({
    notifications: notifications.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt })),
    unread: notifications.filter((n) => !n.readAt).length,
  })
})

const schema = z.object({ ids: z.array(z.string()).min(1).max(100), markRead: z.boolean().default(true) })

export const POST = route(async ({ org, request }) => {
  const body = await readJson(request, schema)
  await db.notification.updateMany({ where: { id: { in: body.ids }, orgId: org.org.id }, data: { readAt: body.markRead ? new Date() : null } })
  return ok({ updated: body.ids.length })
})
