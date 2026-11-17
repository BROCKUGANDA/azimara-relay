// Subscription entitlements. Plans gate real features and limits in code.
// No payment collection is configured — plan switches are recorded as
// billing events and take effect immediately (documented in billing UI).

export type PlanId = 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE'

export type Entitlements = {
  seats: number
  maxBatchItems: number
  monthlyPayments: number
  aiRequestsPerMonth: number
  apiKeys: number
  treasuryWallets: number
  exports: boolean
  apiAccess: boolean
  multiApprover: boolean
  priceMonthlyUsd: number | null
}

export const PLANS: Record<PlanId, Entitlements> = {
  STARTER: {
    seats: 3,
    maxBatchItems: 20,
    monthlyPayments: 100,
    aiRequestsPerMonth: 200,
    apiKeys: 1,
    treasuryWallets: 2,
    exports: true,
    apiAccess: false,
    multiApprover: false,
    priceMonthlyUsd: 49,
  },
  GROWTH: {
    seats: 10,
    maxBatchItems: 100,
    monthlyPayments: 1000,
    aiRequestsPerMonth: 2000,
    apiKeys: 5,
    treasuryWallets: 10,
    exports: true,
    apiAccess: true,
    multiApprover: true,
    priceMonthlyUsd: 199,
  },
  BUSINESS: {
    seats: 25,
    maxBatchItems: 250,
    monthlyPayments: 10000,
    aiRequestsPerMonth: 10000,
    apiKeys: 20,
    treasuryWallets: 25,
    exports: true,
    apiAccess: true,
    multiApprover: true,
    priceMonthlyUsd: 499,
  },
  ENTERPRISE: {
    seats: 100,
    maxBatchItems: 2000,
    monthlyPayments: 100000,
    aiRequestsPerMonth: 50000,
    apiKeys: 100,
    treasuryWallets: 100,
    exports: true,
    apiAccess: true,
    multiApprover: true,
    priceMonthlyUsd: null,
  },
}

export function entitlementsFor(plan: string): Entitlements {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : 'STARTER']
}

export class EntitlementError extends Error {
  code = 'ENTITLEMENT_LIMIT_REACHED'
  constructor(message: string) {
    super(message)
  }
}

export function assertWithinLimit(ent: Entitlements, key: 'monthlyPayments' | 'maxBatchItems' | 'aiRequestsPerMonth' | 'apiKeys' | 'treasuryWallets' | 'seats', current: number) {
  const limit = ent[key]
  if (typeof limit === 'number' && current >= limit) {
    throw new EntitlementError(`Plan limit reached: ${key} (${current}/${limit}). Upgrade the subscription to raise this limit.`)
  }
}

export function assertFeature(ent: Entitlements, key: 'exports' | 'apiAccess' | 'multiApprover') {
  if (!ent[key]) throw new EntitlementError(`Feature not included in the current plan: ${key}`)
}
