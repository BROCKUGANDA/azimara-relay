// MultiHopper provider adapter.
//
// IMPORTANT — verification status: the endpoints implemented here follow the
// workflow documented in the AZIMARA RELAY PRD (POST /api/v1/transfers,
// POST /{id}/prepare, POST /{id}/confirm-broadcast, GET /{id}, HMAC-SHA256
// webhooks via x-multihopper-signature). Public provider documentation could
// not be independently verified from this environment. Before supporting real
// mainnet balances, every request/response schema MUST be validated against
// the live OpenAPI specification and current developer documentation. Raw
// provider payloads are always persisted unmodified so nothing is lost.
//
// The adapter is credential-gated: with no configured key every financial call
// raises SetupRequiredError — mock responses never enter execution paths.

import { env } from './env'
import { randomUUID, createHmac, timingSafeEqual } from 'crypto'
import { decryptSecret } from './crypto'

export type MultiHopperEnv = 'DEVNET' | 'PRODUCTION'

export const MULTIHOOPER_BASE_URLS: Record<MultiHopperEnv, string> = {
  DEVNET: 'https://devnet.multihopper.com',
  PRODUCTION: 'https://multihopper.com',
}

export class SetupRequiredError extends Error {
  code = 'PROVIDER_SETUP_REQUIRED'
  status = 409
  constructor(public detail: string) {
    super(detail)
  }
}

export class MultiHopperError extends Error {
  code: string
  status: number
  providerPayload?: unknown
  constructor(code: string, message: string, status: number, providerPayload?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.providerPayload = providerPayload
  }
}

export function validateApiKeyForEnvironment(key: string, environment: MultiHopperEnv): { ok: boolean; reason?: string } {
  if (environment === 'DEVNET' && key.startsWith('mh_live_')) return { ok: false, reason: 'A live key (mh_live_) cannot be used against the devnet environment. Environments are isolated.' }
  if (environment === 'PRODUCTION' && key.startsWith('mh_test_')) return { ok: false, reason: 'A test key (mh_test_) cannot access production requests. Use a live key.' }
  if (!key.startsWith('mh_test_') && !key.startsWith('mh_live_')) return { ok: false, reason: 'MultiHopper keys must start with mh_test_ (devnet) or mh_live_ (production).' }
  return { ok: true }
}

export type ProviderConfig = {
  environment: MultiHopperEnv
  apiKey: string | null
  webhookSecret: string | null
  capability?: { maxDestinations?: number }
}

export const DEFAULT_CAPABILITY = { maxDestinations: 20 } // documented provider limit — configurable, never assumed arbitrary

export type EstimateInput = {
  sourceMint: string
  destinationMint?: string
  amountBaseUnits: string
  destinations: { address: string; amountBaseUnits?: string; amountShareBps?: number }[]
}

export type CreateTransferInput = {
  externalId: string
  sourceOwner: string
  sourceMint: string
  destinationMint?: string
  amountBaseUnits: string
  destinations: { address: string; amountBaseUnits?: string; amountShareBps?: number }[]
  quoteId?: string
  metadata?: Record<string, unknown>
}

export type TransferLifecycleInput = {
  providerTransferId: string
  keeperFundingSignature?: string
  routeInitSignatures?: string[]
}

function timeoutFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MultiHopperClient {
  constructor(private cfg: ProviderConfig) {}

  private requireConfigured(): { apiKey: string; baseUrl: string; maxDestinations: number } {
    if (!this.cfg.apiKey) {
      throw new SetupRequiredError(
        `MultiHopper ${this.cfg.environment} credentials are not configured. Add an API key in Settings → Integrations to enable ${this.cfg.environment === 'DEVNET' ? 'devnet' : 'mainnet'} transfers.`,
      )
    }
    const check = validateApiKeyForEnvironment(this.cfg.apiKey, this.cfg.environment)
    if (!check.ok) throw new MultiHopperError('PROVIDER_ENV_MISMATCH', check.reason!, 400)
    return {
      apiKey: this.cfg.apiKey,
      baseUrl: MULTIHOOPER_BASE_URLS[this.cfg.environment],
      maxDestinations: this.cfg.capability?.maxDestinations ?? DEFAULT_CAPABILITY.maxDestinations,
    }
  }

  private async request<T>(method: string, path: string, body?: unknown, opts?: { idempotent?: boolean; maxRetries?: number }): Promise<T> {
    const { apiKey, baseUrl } = this.requireConfigured()
    const correlationId = randomUUID()
    const maxRetries = opts?.idempotent ? (opts.maxRetries ?? 2) : 0
    let attempt = 0
    // Safe retries only for explicitly idempotent reads; transfer creation is
    // never retried with a new external reference after an unknown outcome.
    for (;;) {
      let res: Response
      try {
        res = await timeoutFetch(`${baseUrl}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            'x-request-id': correlationId,
            'user-agent': 'AZIMARA-RELAY/1.0 (+api integration; schema-verification-pending)',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }, 30_000)
      } catch (err) {
        if (attempt < maxRetries) {
          await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250))
          attempt++
          continue
        }
        throw new MultiHopperError('PROVIDER_UNREACHABLE', 'MultiHopper API could not be reached (network error or timeout).', 502, { correlationId })
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '0')
        if (attempt < maxRetries) {
          await sleep((retryAfter ? retryAfter * 1000 : 1000 * 2 ** attempt) + Math.floor(Math.random() * 250))
          attempt++
          continue
        }
        throw new MultiHopperError('PROVIDER_RATE_LIMITED', 'MultiHopper rate limit exceeded.', 429, { retryAfter })
      }
      const text = await res.text()
      let payload: unknown = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = text
      }
      if (!res.ok) {
        const message =
          (payload && typeof payload === 'object' && 'message' in payload && typeof (payload as { message?: unknown }).message === 'string'
            ? (payload as { message: string }).message
            : null) ?? `MultiHopper request failed (HTTP ${res.status})`
        if (res.status >= 500 && attempt < maxRetries) {
          await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250))
          attempt++
          continue
        }
        throw new MultiHopperError(`PROVIDER_HTTP_${res.status}`, message, res.status === 401 || res.status === 403 ? 401 : 502, payload)
      }
      return payload as T
    }
  }

  async estimate(input: EstimateInput): Promise<{ raw: unknown; quoteId?: string }> {
    const raw = await this.request<unknown>('POST', '/api/v1/estimate', input, { idempotent: true })
    return { raw, quoteId: extractString(raw, ['quoteId', 'quote_id', 'id']) }
  }

  /// Creates a transfer. `externalId` is the stable idempotency reference: if
  /// the outcome of a previous creation attempt is unknown, the SAME
  /// externalId is reused — never a fresh one.
  async createTransfer(input: CreateTransferInput): Promise<{ raw: unknown; providerTransferId: string; quote?: unknown }> {
    const { maxDestinations } = this.requireConfigured()
    if (input.destinations.length > maxDestinations) {
      throw new MultiHopperError('DESTINATION_LIMIT_EXCEEDED', `This MultiHopper transfer reference supports up to ${maxDestinations} destinations per transfer. Split the batch into multiple independently tracked routes.`, 400)
    }
    const raw = await this.request<unknown>('POST', '/api/v1/transfers', { ...input, externalId: input.externalId })
    const providerTransferId = extractString(raw, ['transferId', 'transfer_id', 'id'])
    if (!providerTransferId) {
      throw new MultiHopperError('PROVIDER_SCHEMA_MISMATCH', 'Transfer creation response did not contain a transfer identifier. Do not retry blindly — reconcile with the provider using externalId before proceeding.', 502, raw)
    }
    return { raw, providerTransferId, quote: extractValue(raw, ['quote']) }
  }

  /// Obtains unsigned transaction bundles plus onchain progress. Bundles may
  /// omit groups already initialized after an interruption.
  async prepareTransfer(providerTransferId: string): Promise<{ raw: unknown; bundles: Record<string, unknown> }> {
    const raw = await this.request<unknown>('POST', `/api/v1/transfers/${encodeURIComponent(providerTransferId)}/prepare`, undefined, { idempotent: true })
    if (!raw || typeof raw !== 'object') throw new MultiHopperError('PROVIDER_SCHEMA_MISMATCH', 'Prepare response was not an object.', 502, raw)
    return { raw, bundles: raw as Record<string, unknown> }
  }

  /// Intermediate confirmation: keeper funding signature with an EMPTY
  /// route-initialization signature list; final confirmation: remaining
  /// signatures after actual chain confirmation.
  async confirmBroadcast(input: TransferLifecycleInput): Promise<{ raw: unknown }> {
    const body = {
      keeperFundingSignature: input.keeperFundingSignature,
      routeInitSignatures: input.routeInitSignatures ?? [],
    }
    const raw = await this.request<unknown>('POST', `/api/v1/transfers/${encodeURIComponent(input.providerTransferId)}/confirm-broadcast`, body)
    return { raw }
  }

  async getTransfer(providerTransferId: string): Promise<{ raw: unknown; status?: string }> {
    const raw = await this.request<unknown>('GET', `/api/v1/transfers/${encodeURIComponent(providerTransferId)}`, undefined, { idempotent: true })
    return { raw, status: extractString(raw, ['status', 'transferStatus', 'transfer_status']) }
  }

  async registerWebhook(url: string, events: string[]): Promise<{ raw: unknown }> {
    const raw = await this.request<unknown>('POST', '/api/v1/webhooks', { url, events }, { idempotent: true })
    return { raw }
  }

  /// HMAC-SHA256 verification against the UNMODIFIED raw request body using a
  /// timing-safe comparison. Accepts bare hex and `sha256=<hex>` forms.
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
    if (!signatureHeader) return false
    const provided = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader
    if (!/^[a-fA-F0-9]{64}$/.test(provided)) return false
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    const a = Buffer.from(provided.toLowerCase(), 'hex')
    const b = Buffer.from(expected, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  }
}

function extractString(value: unknown, keys: string[]): string | undefined {
  const v = extractValue(value, keys)
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function extractValue(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== 'object') return undefined
  const obj = value as Record<string, unknown>
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k]
    const nested = obj.data ?? obj.result ?? obj.transfer
    if (nested && typeof nested === 'object') {
      const found = extractValue(nested, keys)
      if (found !== undefined) return found
    }
  }
  return undefined
}

export function providerConfigFromRow(row: { environment: string; apiKeyCipher: string | null; capabilityJson: string } | null, orgOverride?: { environment?: string }): ProviderConfig {
  const environment = (orgOverride?.environment ?? row?.environment ?? env().MULTIHOPPER_ENVIRONMENT) as MultiHopperEnv
  let capability: { maxDestinations?: number } | undefined
  try {
    capability = row ? (JSON.parse(row.capabilityJson) as { maxDestinations?: number }) : undefined
  } catch {
    capability = undefined
  }
  const envKey = env().MULTIHOPPER_API_KEY
  return {
    environment,
    apiKey: row?.apiKeyCipher ? decryptSecret(row.apiKeyCipher) : envKey && validateApiKeyForEnvironment(envKey, environment).ok ? envKey : null,
    webhookSecret: null,
    capability,
  }
}
