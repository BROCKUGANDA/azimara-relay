// In-process sliding-window rate limiter. Per-instance only; production
// deployments should front this with a shared store (Redis) — documented in
// the operations runbook. Never silently disabled.

type Bucket = { hits: number[] }

const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < 120_000)
    if (bucket.hits.length === 0) buckets.delete(key)
  }
}

export function rateLimit(key: string, max: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0]
    buckets.set(key, bucket)
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
  }
  bucket.hits.push(now)
  buckets.set(key, bucket)
  return { allowed: true, retryAfterSec: 0 }
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
