import { ok } from '@/lib/api'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return ok({ status: 'healthy', database: true, time: new Date().toISOString() })
  } catch (err) {
    return Response.json({ data: { status: 'degraded', database: false, error: String(err).slice(0, 100) } }, { status: 503 })
  }
}
