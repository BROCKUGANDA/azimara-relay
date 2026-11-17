import { db } from '@/lib/db'

export type AuditInput = {
  orgId?: string | null
  actorId?: string | null
  actorType?: 'USER' | 'SYSTEM' | 'API' | 'AI'
  action: string
  resourceType: string
  resourceId?: string | null
  data?: Record<string, unknown>
  ip?: string | null
}

// Immutable audit trail. Financial records are never cascaded on delete.
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        orgId: input.orgId ?? null,
        actorId: input.actorId ?? null,
        actorType: input.actorType ?? 'USER',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        dataJson: JSON.stringify(input.data ?? {}),
        ip: input.ip ?? null,
      },
    })
  } catch (err) {
    // Audit writes must never break the request, but failures are surfaced loudly.
    console.error(JSON.stringify({ level: 'error', msg: 'audit_write_failed', action: input.action, err: String(err) }))
  }
}

export async function notify(orgId: string, n: { type: string; title: string; body?: string; link?: string; userId?: string }) {
  try {
    await db.notification.create({ data: { orgId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null, userId: n.userId ?? null } })
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'notification_write_failed', err: String(err) }))
  }
}
