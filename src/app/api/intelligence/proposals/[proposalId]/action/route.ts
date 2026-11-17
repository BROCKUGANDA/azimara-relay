import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { acceptProposal, rejectProposal } from '@/lib/ai'
import { audit, notify } from '@/lib/audit'

const schema = z.object({ action: z.enum(['ACCEPT', 'REJECT']) })

export const POST = route(async ({ org, auth, request }) => {
  const proposalId = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
  const body = await readJson(request, schema)
  if (body.action === 'ACCEPT') {
    // Accepting converts the proposal into real draft payments through the
    // deterministic pipeline — policy validation and human approval still apply.
    const result = await acceptProposal(proposalId, org.org.id, auth.user.id)
    await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'AI_PROPOSAL_ACCEPTED', resourceType: 'AiProposal', resourceId: proposalId, data: { created: result.created.length, errors: result.errors.length } })
    await notify(org.org.id, { type: 'AI_PROPOSAL_CONVERTED', title: `AI proposal converted: ${result.created.length} payment(s) created`, body: `${result.errors.length} item(s) need attention`, link: '#/app/payments' })
    return ok(result)
  }
  await rejectProposal(proposalId, org.org.id)
  await audit({ orgId: org.org.id, actorId: auth.user.id, action: 'AI_PROPOSAL_REJECTED', resourceType: 'AiProposal', resourceId: proposalId })
  return ok({ rejected: true })
}, { permission: 'payment:create' })
