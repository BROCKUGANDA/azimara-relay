import { z } from 'zod'

// Environment validation — fail fast for missing production credentials.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  ENCRYPTION_KEY: z.string().min(16).optional(),
  SOLANA_NETWORK: z.enum(['devnet', 'mainnet-beta']).default('devnet'),
  SOLANA_RPC_URL: z.string().url().optional(),
  MULTIHOPPER_ENVIRONMENT: z.enum(['DEVNET', 'PRODUCTION']).default('DEVNET'),
  MULTIHOPPER_API_KEY: z.string().optional(),
  MULTIHOPPER_WEBHOOK_SECRET: z.string().optional(),
  AI_PROVIDER: z.string().default('ZAI'),
})

type Env = z.infer<typeof schema> & { resolvedRpcUrl: string; authSecret: string; encryptionKey: string }

let cached: Env | null = null

export function env(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Environment validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  const e = parsed.data
  const isProd = e.NODE_ENV === 'production'
  if (isProd && (!e.AUTH_SECRET || !e.ENCRYPTION_KEY)) {
    throw new Error('AUTH_SECRET and ENCRYPTION_KEY are mandatory in production')
  }
  const resolvedRpcUrl =
    e.SOLANA_RPC_URL ??
    (e.SOLANA_NETWORK === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com')
  // Dev fallbacks are derived per boot and logged once; production fails fast above.
  const authSecret = e.AUTH_SECRET ?? `dev-only-auth-secret-${Date.now()}-rotate-me`
  const encryptionKey = e.ENCRYPTION_KEY ?? `dev-only-encryption-key-${Date.now()}-rotate-me`
  cached = { ...e, resolvedRpcUrl, authSecret, encryptionKey }
  if (!e.AUTH_SECRET || !e.ENCRYPTION_KEY) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'AUTH_SECRET/ENCRYPTION_KEY not configured — derived dev-only fallbacks in use. Do not run production without them.' }))
  }
  return cached
}

export function isProd(): boolean {
  return env().NODE_ENV === 'production'
}
