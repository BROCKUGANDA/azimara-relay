import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { safeJsonParse, parsePage, parsePageSize } from '@/lib/safe-json'

export const GET = route(async ({ org, request }) => {
  const url = new URL(request.url)
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 50, 100)
  const { page, skip, take } = parsePage(url.searchParams.get('page'), pageSize)
  const q = url.searchParams.get('q') ?? ''
  const action = url.searchParams.get('action') ?? ''
  const where = {
    orgId: org.org.id,
    ...(action ? { action } : {}),
    // SQLite `contains` is case-sensitive: match lowercase and uppercase
    // variants so searches behave case-insensitively.
    ...(q
      ? {
          OR: [
            { action: { contains: q } }, { action: { contains: q.toLowerCase() } }, { action: { contains: q.toUpperCase() } },
            { resourceType: { contains: q } }, { resourceType: { contains: q.toLowerCase() } }, { resourceType: { contains: q.toUpperCase() } },
            { resourceId: { contains: q } }, { resourceId: { contains: q.toLowerCase() } }, { resourceId: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  }
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  ])
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((v): v is string => !!v))]
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : []
  const actorMap = new Map(actors.map((a) => [a.id, a.name]))
  return ok({
    entries: logs.map((l) => ({
      id: l.id,
      action: l.action,
      resourceType: l.resourceType,
      resourceId: l.resourceId,
      actorType: l.actorType,
      actorName: actorMap.get(l.actorId ?? '') ?? null,
      data: safeJsonParse(l.dataJson, {}),
      ip: l.ip,
      createdAt: l.createdAt,
    })),
    total,
    page,
    pageSize,
  })
}, { permission: 'audit:read' })
