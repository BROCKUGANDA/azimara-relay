import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'

export const GET = route(async ({ org, request }) => {
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '50')))
  const q = url.searchParams.get('q') ?? ''
  const action = url.searchParams.get('action') ?? ''
  const where = {
    orgId: org.org.id,
    ...(action ? { action } : {}),
    ...(q ? { OR: [{ action: { contains: q } }, { resourceType: { contains: q } }, { resourceId: { contains: q } }] } : {}),
  }
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
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
      data: JSON.parse(l.dataJson),
      ip: l.ip,
      createdAt: l.createdAt,
    })),
    total,
    page,
    pageSize,
  })
}, { permission: 'audit:read' })
