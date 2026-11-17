// Exact decimal money math on integer base units. JavaScript floats are
// forbidden for authoritative token calculations — everything here is BigInt
// over decimal strings, with explicit token decimals.

export function assertBaseUnits(value: string): bigint {
  const v = value.trim()
  if (!/^\d+$/.test(v)) throw new Error(`Invalid base units: ${value}`)
  return BigInt(v)
}

/// "12.34" + 6 decimals -> "12340000". Never parses floats.
/// Tolerates thousand-grouping commas (e.g. "1,250.50") so formatter output
/// can safely round-trip back through the parser.
export function parseAmountToBaseUnits(amount: string, decimals: number): string {
  const s = amount.trim().replace(/,/g, '')
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new Error(`Invalid amount: ${amount}`)
  if (s.length > 40) throw new Error(`Invalid amount: ${amount}`)
  const neg = false
  const [wholeRaw, fracRaw = ''] = s.split('.')
  const whole = wholeRaw === '' ? '0' : wholeRaw.replace(/^0+(?=\d)/, '')
  if (fracRaw.length > decimals) throw new Error(`Amount ${amount} exceeds ${decimals} decimal places`)
  const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals)
  const combined = `${whole}${frac}`.replace(/^0+(?=\d)/, '') || '0'
  const bi = BigInt(combined)
  if (neg) throw new Error('Negative amounts are invalid')
  return bi.toString()
}

export function formatBaseUnits(
  base: string | bigint,
  decimals: number,
  opts?: { trimTrailingZeros?: boolean; group?: boolean },
): string {
  const bi = typeof base === 'bigint' ? base : assertBaseUnits(base)
  const neg = bi < 0n
  const abs = (neg ? -bi : bi).toString().padStart(decimals + 1, '0')
  const whole = abs.slice(0, abs.length - decimals)
  let frac = decimals > 0 ? abs.slice(abs.length - decimals) : ''
  if (opts?.trimTrailingZeros) frac = frac.replace(/0+$/, '')
  // Grouping is for display only. Machine round-trips (parseAmountToBaseUnits
  // inputs, provider payloads) must pass group:false — commas are display sugar.
  const wholeGrouped = opts?.group === false ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = neg ? '-' : ''
  return frac ? `${sign}${wholeGrouped}.${frac}` : `${sign}${wholeGrouped}`
}

export function addBase(a: string, b: string): string {
  return (assertBaseUnits(a) + assertBaseUnits(b)).toString()
}

export function subBase(a: string, b: string): string {
  const r = assertBaseUnits(a) - assertBaseUnits(b)
  if (r < 0n) throw new Error('Amount underflow')
  return r.toString()
}

export function sumBase(values: string[]): string {
  return values.reduce<bigint>((acc, v) => acc + assertBaseUnits(v), 0n).toString()
}

export function gteBase(a: string, b: string): boolean {
  return assertBaseUnits(a) >= assertBaseUnits(b)
}

export function ltBase(a: string, b: string): boolean {
  return assertBaseUnits(a) < assertBaseUnits(b)
}

export function isZeroBase(a: string): boolean {
  return assertBaseUnits(a) === 0n
}

/// percentage fee in basis points (e.g. 25 bps = 0.25%) with floor rounding.
export function mulBpsFloor(base: string, bps: number): string {
  if (!Number.isInteger(bps) || bps < 0) throw new Error(`Invalid basis points: ${bps}`)
  return ((assertBaseUnits(base) * BigInt(bps)) / 10000n).toString()
}

export function cmpBase(a: string, b: string): number {
  const ab = assertBaseUnits(a)
  const bb = assertBaseUnits(b)
  return ab === bb ? 0 : ab < bb ? -1 : 1
}
