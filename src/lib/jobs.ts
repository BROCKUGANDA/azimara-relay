// DB-backed durable queue with retries, backoff+jitter, leases and a
// dead-letter state. This replaces Redis/BullMQ in this sandbox; the processor
// registry is identical so the queue backend can be swapped in production.

import { db } from '@/lib/db'
import { randomUUID } from 'crypto'

type Processor = (payload: Record<string, unknown>, job: { id: string; orgId: string | null }) => Promise<void>

const processors = new Map<string, Processor>()
const INSTANCE_ID = randomUUID()

export function registerProcessor(type: string, fn: Processor) {
  processors.set(type, fn)
}

export async function enqueue(type: string, payload: Record<string, unknown> = {}, opts?: { orgId?: string | null; runAt?: Date; dedupeKey?: string; maxAttempts?: number }) {
  try {
    await db.jobRecord.create({
      data: {
        type,
        orgId: opts?.orgId ?? null,
        payloadJson: JSON.stringify(payload),
        runAt: opts?.runAt ?? new Date(),
        dedupeKey: opts?.dedupeKey ?? null,
        maxAttempts: opts?.maxAttempts ?? 5,
      },
    })
  } catch {
    // dedupeKey conflict → job already queued; fine.
  }
}

const BACKOFF_BASE_MS = 2_000
const MAX_LEASE_MS = 5 * 60 * 1000

async function claimJob(): Promise<{ id: string; type: string; orgId: string | null; payloadJson: string; attempts: number; maxAttempts: number } | null> {
  const now = new Date()
  // Release stale leases from crashed workers.
  await db.jobRecord.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(now.getTime() - MAX_LEASE_MS) } },
    data: { status: 'QUEUED', lockedAt: null, lockedBy: null },
  })
  const candidates = await db.jobRecord.findMany({
    where: { status: 'QUEUED', runAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: 5,
  })
  for (const job of candidates) {
    const claimed = await db.jobRecord.updateMany({
      where: { id: job.id, status: 'QUEUED' },
      data: { status: 'RUNNING', lockedAt: now, lockedBy: INSTANCE_ID, attempts: job.attempts + 1 },
    })
    if (claimed.count > 0) return { ...job, attempts: job.attempts + 1 }
  }
  return null
}

async function runOne(): Promise<boolean> {
  const job = await claimJob()
  if (!job) return false
  const processor = processors.get(job.type)
  try {
    if (!processor) throw new Error(`No processor registered for job type ${job.type}`)
    await processor(JSON.parse(job.payloadJson) as Record<string, unknown>, { id: job.id, orgId: job.orgId })
    await db.jobRecord.update({ where: { id: job.id }, data: { status: 'DONE', lastError: null, updatedAt: new Date(), lockedAt: null } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isSetupPending = message.includes('PROVIDER_SETUP_REQUIRED') || message.includes('credentials are not configured')
    const dead = job.attempts >= job.maxAttempts
    await db.jobRecord.update({
      where: { id: job.id },
      data: {
        status: dead ? 'DEAD' : 'QUEUED',
        runAt: new Date(Date.now() + BACKOFF_BASE_MS * 2 ** job.attempts + Math.floor(Math.random() * 500)),
        lastError: message.slice(0, 500),
        lockedAt: null,
      },
    })
    if (isSetupPending && dead) {
      // Setup-blocked jobs are parked quietly rather than alerting forever.
      console.warn(JSON.stringify({ level: 'warn', msg: 'job_dead_setup_pending', job: job.id, type: job.type }))
    } else if (dead) {
      console.error(JSON.stringify({ level: 'error', msg: 'job_dead_letter', job: job.id, type: job.type, err: message }))
    }
  }
  return true
}

let running = false
let timer: ReturnType<typeof setInterval> | null = null

export function startWorker(intervalMs = 4000) {
  const g = globalThis as unknown as { __relayWorkerStarted?: boolean }
  if (g.__relayWorkerStarted) return
  g.__relayWorkerStarted = true
  timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      for (let i = 0; i < 5; i++) {
        const worked = await runOne()
        if (!worked) break
      }
      await runCron()
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'worker_tick_failed', err: String(err) }))
    } finally {
      running = false
    }
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
}

// ─── Cron-like recurring sweeps (self-scheduling via dedupe keys) ───────────

const CRONS: { key: string; everyMs: number; type: string }[] = [
  { key: 'cron:quote-expiry', everyMs: 60_000, type: 'QUOTE_EXPIRY_SWEEP' },
  { key: 'cron:approval-expiry', everyMs: 300_000, type: 'APPROVAL_EXPIRY_SWEEP' },
  { key: 'cron:reconciliation', everyMs: 120_000, type: 'RECONCILIATION_SWEEP' },
  { key: 'cron:schedules', everyMs: 60_000, type: 'SCHEDULE_SWEEP' },
  { key: 'cron:webhook-replay', everyMs: 60_000, type: 'WEBHOOK_REPLAY_SWEEP' },
  // On-chain subscription collection: watch the treasury for incoming USDC
  // and settle pending subscription invoices. Public RPC rate limits make a
  // 60s cadence the safe ceiling.
  { key: 'cron:billing-sweep', everyMs: 60_000, type: 'BILLING_SWEEP' },
]

async function runCron() {
  const now = Date.now()
  for (const cron of CRONS) {
    const marker = await db.jobRecord.findUnique({ where: { dedupeKey: cron.key } })
    if (!marker) {
      await db.jobRecord.create({ data: { type: cron.type, dedupeKey: cron.key, payloadJson: '{}', status: 'QUEUED', runAt: new Date(now) } }).catch(() => undefined)
      continue
    }
    const lastRun = new Date(marker.updatedAt).getTime()
    if (now - lastRun >= cron.everyMs && (marker.status === 'DONE' || marker.status === 'DEAD' || marker.status === 'FAILED')) {
      await db.jobRecord.update({ where: { dedupeKey: cron.key }, data: { status: 'QUEUED', runAt: new Date(now), updatedAt: new Date(now), attempts: 0 } }).catch(() => undefined)
    }
  }
}

export function workerInstanceId(): string {
  return INSTANCE_ID
}
