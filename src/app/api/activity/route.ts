import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { safeJsonParse, parsePageSize } from '@/lib/safe-json'

export const GET = route(async ({ org, request }) => {
  const limit = parsePageSize(new URL(request.url).searchParams.get('limit'), 40, 100)
  const events = await db.auditLog.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: limit })
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((v): v is string => !!v))]
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : []
  const actorMap = new Map(actors.map((a) => [a.id, a]))
  return ok({
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      actorType: e.actorType,
      actorName: actorMap.get(e.actorId ?? '')?.name ?? (e.actorType === 'SYSTEM' ? 'System' : null),
      data: safeJsonParse(e.dataJson, {}),
      createdAt: e.createdAt,
    })),
  })
})
