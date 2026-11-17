// Defensive JSON handling for data persisted in text columns. A corrupted or
// legacy row must degrade to a fallback — never 500 the endpoint.

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === '') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// ─── Query parameter parsing ────────────────────────────────────────────────
// Number("abc") is NaN, and Math.max(1, NaN) is still NaN — which silently
// bypasses every clamp and hands NaN to Prisma. These helpers are the single
// funnel for list endpoints.

export function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  const int = Math.floor(n)
  return Math.min(max, Math.max(min, int))
}

export function parsePage(raw: string | null, pageSize = 20): { page: number; skip: number; take: number } {
  const page = parsePositiveInt(raw, 1, 1, 100_000)
  return { page, skip: (page - 1) * pageSize, take: pageSize }
}

export function parsePageSize(raw: string | null, fallback: number, max: number): number {
  return parsePositiveInt(raw, fallback, 1, max)
}

export function parseDaysWindow(raw: string | null, fallback: number, max: number): number {
  return parsePositiveInt(raw, fallback, 1, max)
}
