import { route } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { buildCsv } from '@/lib/csv'

export const GET = route(async ({ org, auth }) => {
  const recipients = await db.recipient.findMany({ where: { orgId: org.org.id, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'asc' } })
  const csv = buildCsv(
    ['name', 'address', 'reference', 'category', 'status', 'verification_status', 'created_at', 'last_payment_at'],
    recipients.map((r) => [r.name, r.address, r.reference ?? '', r.category ?? '', r.status, r.verificationStatus, r.createdAt.toISOString(), r.lastPaymentAt?.toISOString() ?? '']),
  )
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'RECIPIENTS_EXPORTED', resourceType: 'Recipient', data: { count: recipients.length } })
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="relay-recipients-${org.org.slug}.csv"` },
  })
})
