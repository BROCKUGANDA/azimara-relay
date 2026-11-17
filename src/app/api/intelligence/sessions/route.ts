import { ok, route } from '@/lib/api'
import { db } from '@/lib/db'
import { safeJsonParse } from '@/lib/safe-json'

export const GET = route(async ({ org, auth }) => {
  const sessions = await db.aiSession.findMany({ where: { orgId: org.org.id, userId: auth.user.id }, orderBy: { updatedAt: 'desc' }, take: 30 })
  const proposals = await db.aiProposal.findMany({ where: { orgId: org.org.id }, orderBy: { createdAt: 'desc' }, take: 20 })
  return ok({
    sessions: sessions.map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt })),
    proposals: proposals.map((p) => ({ id: p.id, title: p.title, kind: p.kind, status: p.status, checks: safeJsonParse<unknown>(p.checksJson, null), result: p.resultRefJson ? safeJsonParse<unknown>(p.resultRefJson, {}) : null, createdAt: p.createdAt })),
  })
})
