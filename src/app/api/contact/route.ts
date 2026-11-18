import { z } from 'zod'
import { ok, readJson, ApiError, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { sendEmail, mailFrom, isMailConfigured } from '@/lib/mailer'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { sha256 } from '@/lib/crypto'
import { env } from '@/lib/env'

// Public contact pipeline — no session, aggressively rate-limited, always
// persisted first. Email delivery to the team inbox is best-effort: a message
// that only reached the database is still a recorded lead (the response says
// exactly that, never a fake "email sent").

const TOPICS = ['general', 'sales', 'integrations', 'security', 'support'] as const

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(120).optional(),
  topic: z.enum(TOPICS).default('general'),
  message: z.string().trim().min(10).max(4000),
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request, bodySchema)
    // Rate limit: contact forms are prime spam targets.
    const rl = rateLimit(`contact:${clientIp(request)}`, 5, 60 * 60_000)
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Too many messages from this address. Try again later.', 429)

    const record = await db.contactMessage.create({
      data: {
        name: body.name,
        email: body.email,
        company: body.company ?? null,
        topic: body.topic,
        message: body.message,
        ipHash: sha256(clientIp(request)).slice(0, 32),
      },
    })

    // Best-effort inbox notification. Delivery failure never fails the request
    // because the record is already durable.
    let delivered = false
    if (isMailConfigured()) {
      const e = env()
      const inbox = e.CONTACT_INBOX ?? 'sales@relay.azimara.ae'
      const subject = `[${body.topic.toUpperCase()}] Website contact from ${body.name}${body.company ? ` (${body.company})` : ''}`
      const text = `New website contact message\n\nFrom: ${body.name} <${body.email}>\nCompany: ${body.company ?? '—'}\nTopic: ${body.topic}\nRecord: ${record.id}\n\n${body.message}\n\nReply directly to the sender's address.`
      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#12202e">
        <p>New website contact message.</p>
        <p><strong>From:</strong> ${escapeHtml(body.name)} &lt;${escapeHtml(body.email)}&gt;<br>
        <strong>Company:</strong> ${escapeHtml(body.company ?? '—')}<br>
        <strong>Topic:</strong> ${escapeHtml(body.topic)}<br>
        <strong>Record:</strong> ${escapeHtml(record.id)}</p>
        <p style="white-space:pre-wrap">${escapeHtml(body.message)}</p>
      </body></html>`
      const mail = await sendEmail({ to: inbox, subject, text, html })
      delivered = mail.delivered
      if (delivered) {
        await db.contactMessage.update({ where: { id: record.id }, data: { deliveredToInbox: true } })
      }
    }

    return ok({
      recorded: true,
      reference: record.id,
      // Honest delivery state — the UI shows it verbatim.
      inboxNotified: delivered,
      inboxConfigured: isMailConfigured(),
      from: mailFrom().name,
    })
  } catch (err) {
    return fail(request, err)
  }
}
