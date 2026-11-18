import { z } from 'zod'
import { ok, readJson, route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { runAssistant, extractInvoice } from '@/lib/ai'
import { audit } from '@/lib/audit'
import { safeJsonParse } from '@/lib/safe-json'

const chatSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1).max(8000),
  invoiceText: z.string().max(20_000).optional(),
})

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, chatSchema)
  let sessionId = body.sessionId
  if (sessionId) {
    const session = await db.aiSession.findFirst({ where: { id: sessionId, orgId: org.org.id } })
    if (!session) throw new ApiError('NOT_FOUND', 'Session not found', 404)
  } else {
    const session = await db.aiSession.create({
      data: { orgId: org.org.id, userId: auth.user.id, title: body.message.slice(0, 60) },
    })
    sessionId = session.id
  }
  await db.aiMessage.create({ data: { sessionId, role: 'user', content: body.message, dataJson: '{}' } })

  if (body.invoiceText) {
    try {
      const extraction = await extractInvoice(body.invoiceText)
      const content = [
        '**Invoice extraction (suggestions only — not authorization)**',
        '',
        `- Vendor: ${extraction.vendorName ?? 'not detected'}`,
        `- Total: ${extraction.totalAmount ?? 'not detected'} ${extraction.currencyDetected ?? ''}`.trimEnd(),
        `- Due date: ${extraction.dueDate ?? 'not detected'}`,
        `- Line items: ${extraction.lineItems?.length ?? 0}`,
        '',
        extraction.confidenceNotes ?? '',
        '',
        'Amounts extracted from documents are always recalculated deterministically when you create a payment. Nothing is executed without policy approval.',
      ].join('\n')
      const msg = await db.aiMessage.create({ data: { sessionId, role: 'assistant', content, dataJson: JSON.stringify({ kind: 'INVOICE_EXTRACTION', extraction }) } })
      return ok({ sessionId, message: { id: msg.id, role: 'assistant', content, data: { kind: 'INVOICE_EXTRACTION', extraction } } })
    } catch (err) {
      if (String(err).includes('AI_PROVIDER_UNAVAILABLE')) {
        throw new ApiError('AI_PROVIDER_UNAVAILABLE', 'The AI provider is unavailable (check connectivity or API quota/balance). Try again or continue manually.', 503)
      }
      throw err
    }
  }

  try {
    const result = await runAssistant(org.org.id, auth.user.id, sessionId, body.message)
    const dataJson =
      result.kind === 'PROPOSAL'
        ? JSON.stringify({ kind: 'PROPOSAL', proposalId: result.proposalId, title: result.title, items: result.items, checks: result.checks, mint: result.mint })
        : result.kind === 'ANSWER'
          ? JSON.stringify({ kind: 'ANSWER', evidenceRefs: result.evidenceRefs })
          : JSON.stringify({ kind: result.kind })
    const msg = await db.aiMessage.create({ data: { sessionId, role: 'assistant', content: result.answer, dataJson } })
    await db.aiSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } })
    await audit({ orgId: org.org.id, actorType: 'AI', action: 'INTELLIGENCE_INTERACTION', resourceType: 'AiSession', resourceId: sessionId, data: { kind: result.kind } })
    return ok({
      sessionId,
      message: { id: msg.id, role: 'assistant', content: result.answer, data: JSON.parse(dataJson) },
    })
  } catch (err) {
    if (String(err).includes('AI_PROVIDER_UNAVAILABLE')) {
      await db.aiMessage.create({ data: { sessionId, role: 'assistant', content: 'The AI provider is currently unavailable (check API quota/balance). Deterministic tools (payment history, duplicate checks, exports) remain fully available.', dataJson: JSON.stringify({ kind: 'ERROR' }) } })
      throw new ApiError('AI_PROVIDER_UNAVAILABLE', 'The AI provider is unreachable from this environment.', 503)
    }
    if (err instanceof SyntaxError || err instanceof z.ZodError) {
      return ok({ sessionId, message: { id: '', role: 'assistant', content: 'I could not produce a structured response for that request. Please rephrase.', data: { kind: 'ERROR' } } })
    }
    throw err
  }
}, { permission: 'intelligence:use', rate: { max: 30, windowMs: 60_000 } })

export const GET = route(async ({ org, auth, request }) => {
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) throw new ApiError('VALIDATION_FAILED', 'sessionId required', 422)
  const session = await db.aiSession.findFirst({ where: { id: sessionId, orgId: org.org.id, userId: auth.user.id } })
  if (!session) throw new ApiError('NOT_FOUND', 'Session not found', 404)
  const messages = await db.aiMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } })
  return ok({
    session: { id: session.id, title: session.title },
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, data: safeJsonParse<unknown>(m.dataJson, null), createdAt: m.createdAt })),
  })
})
