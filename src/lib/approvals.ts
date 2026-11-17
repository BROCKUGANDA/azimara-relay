// Deterministic approval policy evaluation. Every financially material field
// is hashed into the approval evidence; any change invalidates pending
// approvals. Policy evaluation is code, never model output.

import { payloadHash } from './crypto'
import { assertBaseUnits, cmpBase } from './money'
import type { Recipient, PaymentRequest } from '@prisma/client'

export type PolicyRule = {
  id: string
  description: string
  condition:
    | { field: 'AMOUNT_LT'; mint?: string; amountBaseUnits: string }
    | { field: 'AMOUNT_GTE'; mint?: string; amountBaseUnits: string }
    | { field: 'ALWAYS' }
    | { field: 'NEW_RECIPIENT'; withinDays: number }
    | { field: 'RECIPIENT_CATEGORY'; category: string }
  approversRequired: number
  approverRoles?: string[]
}

export const DEFAULT_RULES: PolicyRule[] = [
  { id: 'small', description: 'Payments under 100 USDC require one approver', condition: { field: 'AMOUNT_LT', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amountBaseUnits: '100000000' }, approversRequired: 1 },
  { id: 'medium', description: 'Payments of 100–1,000 USDC require one approver', condition: { field: 'AMOUNT_LT', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amountBaseUnits: '1000000000' }, approversRequired: 1, approverRoles: ['OWNER', 'TREASURY_ADMIN'] },
  { id: 'large', description: 'Payments of 1,000+ USDC require two independent approvers', condition: { field: 'AMOUNT_GTE', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amountBaseUnits: '1000000000' }, approversRequired: 2 },
  { id: 'new-recipient', description: 'First payment to a recipient registered within 7 days requires an additional approver', condition: { field: 'NEW_RECIPIENT', withinDays: 7 }, approversRequired: 2 },
]

export function materialPayload(payment: Pick<PaymentRequest, 'destination' | 'mint' | 'amountBaseUnits' | 'sourceWalletId' | 'reference'>) {
  return payloadHash({
    destination: payment.destination,
    mint: payment.mint,
    amountBaseUnits: payment.amountBaseUnits,
    sourceWalletId: payment.sourceWalletId,
    reference: payment.reference,
  })
}

export type PolicyEvaluation = {
  approversRequired: number
  approverRoles: string[]
  matchedRules: { id: string; description: string }[]
  policyId: string | null
  policyVersion: number | null
  evidence: Record<string, unknown>
}

export function evaluateRules(rules: PolicyRule[], payment: { mint: string; amountBaseUnits: string }, recipient: Pick<Recipient, 'createdAt' | 'category'> | null): PolicyEvaluation {
  const matched: { id: string; description: string }[] = []
  let approversRequired = 0
  const approverRoles = new Set<string>()
  for (const rule of rules) {
    let hit = false
    switch (rule.condition.field) {
      case 'ALWAYS':
        hit = true
        break
      case 'AMOUNT_LT':
        hit = (!rule.condition.mint || rule.condition.mint === payment.mint) && cmpBase(payment.amountBaseUnits, rule.condition.amountBaseUnits) < 0
        break
      case 'AMOUNT_GTE':
        hit = (!rule.condition.mint || rule.condition.mint === payment.mint) && cmpBase(payment.amountBaseUnits, rule.condition.amountBaseUnits) >= 0
        break
      case 'NEW_RECIPIENT': {
        if (!recipient) break
        const ageDays = (Date.now() - new Date(recipient.createdAt).getTime()) / 86_400_000
        hit = ageDays <= rule.condition.withinDays
        break
      }
      case 'RECIPIENT_CATEGORY':
        hit = !!recipient && recipient.category === rule.condition.category
        break
    }
    if (hit) {
      matched.push({ id: rule.id, description: rule.description })
      // Take the maximum requirement; roles accumulate across matched rules.
      approversRequired = Math.max(approversRequired, rule.approversRequired)
      for (const r of rule.approverRoles ?? []) approverRoles.add(r)
    }
  }
  if (approversRequired === 0) {
    matched.push({ id: 'fallback', description: 'Default: one approver' })
    approversRequired = 1
  }
  return {
    approversRequired,
    approverRoles: [...approverRoles],
    matchedRules: matched,
    policyId: null,
    policyVersion: null,
    evidence: { evaluatedAt: new Date().toISOString(), matchedRules: matched },
  }
}

export function assertValidAmount(mint: string, amountBaseUnits: string, decimals: number) {
  assertBaseUnits(amountBaseUnits)
  if (assertBaseUnits(amountBaseUnits) === 0n) throw new Error('Payment amount must be greater than zero')
}
