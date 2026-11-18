import { z } from 'zod'
import { ok, readJson, route } from '@/lib/api'
import { validateBatch, executeBatch, cancelBatch } from '@/lib/batches'

function idFrom(request: Request): string {
  return new URL(request.url).pathname.split('/').filter(Boolean).slice(-2)[0]
}

// Detail reads live at /api/batches/<batchId> (direct-child route). This
// endpoint is actions-only.
const actionSchema = z.object({ action: z.enum(['validate', 'execute', 'cancel']) })

export const POST = route(async ({ org, auth, request }) => {
  const body = await readJson(request, actionSchema)
  const batchId = idFrom(request)
  if (body.action === 'validate') {
    const result = await validateBatch(batchId, org.org.id)
    return ok(result)
  }
  if (body.action === 'cancel') {
    const result = await cancelBatch(batchId, org.org.id, auth.user.id)
    return ok(result)
  }
  const result = await executeBatch(batchId, org.org.id, auth.user.id)
  return ok(result)
}, { permission: 'payment:execute' })
