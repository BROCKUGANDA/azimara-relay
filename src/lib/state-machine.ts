// Centralized payment state machine. Provider statuses map into internal
// states without ever discarding the original provider response. A payment
// never reaches COMPLETED merely because an HTTP call returned 200 —
// settlement verification requires provider + chain evidence.

export const PAYMENT_STATES = [
  'DRAFT',
  'VALIDATING',
  'PENDING_APPROVAL',
  'APPROVED',
  'QUOTING',
  'QUOTED',
  'AWAITING_SIGNATURE',
  'FUNDING_BROADCAST',
  'FUNDING_CONFIRMED',
  'INITIALIZATION_BROADCAST',
  'PROCESSING',
  'SETTLEMENT_VERIFICATION',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'QUOTE_EXPIRED',
  'TRANSFER_EXPIRED',
  'FAILED',
  'REFUNDED',
  'RECOVERABLE',
  'RESCUED',
  'MANUAL_REVIEW',
  'RECONCILIATION_REQUIRED',
] as const

export type PaymentState = (typeof PAYMENT_STATES)[number]

export const ALLOWED_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  DRAFT: ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['PENDING_APPROVAL', 'DRAFT', 'REJECTED', 'MANUAL_REVIEW', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['QUOTING', 'CANCELLED'],
  QUOTING: ['QUOTED', 'APPROVED', 'QUOTE_EXPIRED', 'FAILED', 'MANUAL_REVIEW'],
  QUOTED: ['AWAITING_SIGNATURE', 'QUOTING', 'QUOTE_EXPIRED', 'CANCELLED'],
  AWAITING_SIGNATURE: ['FUNDING_BROADCAST', 'QUOTING', 'CANCELLED', 'MANUAL_REVIEW'],
  FUNDING_BROADCAST: ['FUNDING_CONFIRMED', 'RECOVERABLE', 'FAILED', 'MANUAL_REVIEW'],
  FUNDING_CONFIRMED: ['INITIALIZATION_BROADCAST', 'RECOVERABLE', 'MANUAL_REVIEW'],
  INITIALIZATION_BROADCAST: ['PROCESSING', 'RECOVERABLE', 'FAILED', 'MANUAL_REVIEW'],
  PROCESSING: ['SETTLEMENT_VERIFICATION', 'RECOVERABLE', 'TRANSFER_EXPIRED', 'FAILED', 'RECONCILIATION_REQUIRED'],
  SETTLEMENT_VERIFICATION: ['COMPLETED', 'RECONCILIATION_REQUIRED', 'RECOVERABLE', 'FAILED', 'REFUNDED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  QUOTE_EXPIRED: ['QUOTING', 'CANCELLED'],
  TRANSFER_EXPIRED: ['QUOTING', 'MANUAL_REVIEW', 'CANCELLED'],
  FAILED: ['MANUAL_REVIEW', 'QUOTING', 'RECOVERABLE'],
  REFUNDED: ['COMPLETED'],
  RECOVERABLE: ['PROCESSING', 'RESCUED', 'FAILED', 'MANUAL_REVIEW'],
  RESCUED: ['SETTLEMENT_VERIFICATION', 'COMPLETED'],
  MANUAL_REVIEW: ['RECOVERABLE', 'FAILED', 'CANCELLED', 'QUOTING', 'PROCESSING'],
  RECONCILIATION_REQUIRED: ['COMPLETED', 'FAILED', 'MANUAL_REVIEW', 'RECOVERABLE'],
}

export function canTransition(from: string, to: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[from as PaymentState]
  return !!allowed && (allowed as string[]).includes(to)
}

export class InvalidTransitionError extends Error {
  code = 'INVALID_STATE_TRANSITION'
  status = 409
  constructor(from: string, to: string) {
    super(`Illegal payment state transition: ${from} → ${to}`)
  }
}

export function assertTransition(from: string, to: string, opts?: { force?: boolean }) {
  if (opts?.force) return
  if (from === to) return
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
}

/// MultiHopper provider status → internal state. Unknown statuses escalate to
/// RECONCILIATION_REQUIRED rather than guessing.
export function mapProviderStatus(providerStatus: string | null | undefined): PaymentState | 'RECONCILIATION_REQUIRED' {
  const map: Record<string, PaymentState> = {
    QUOTE_CREATED: 'QUOTED',
    DEPOSIT_CONFIRMED: 'FUNDING_CONFIRMED',
    PROCESSING: 'PROCESSING',
    PHASE_CHANGED: 'PROCESSING',
    HOP_COMPLETE: 'PROCESSING',
    COMPLETED: 'SETTLEMENT_VERIFICATION',
    FAILED: 'FAILED',
    EXPIRED: 'TRANSFER_EXPIRED',
    REFUNDED: 'REFUNDED',
    RECOVERABLE: 'RECOVERABLE',
    RESCUED: 'RESCUED',
  }
  if (!providerStatus) return 'RECONCILIATION_REQUIRED'
  return map[providerStatus.toUpperCase()] ?? 'RECONCILIATION_REQUIRED'
}

export const STATUS_META: Record<string, { label: string; tone: string; meaning: string }> = {
  DRAFT: { label: 'Draft', tone: 'grey', meaning: 'Not submitted' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'purple', meaning: 'Needs approval' },
  APPROVED: { label: 'Approved', tone: 'blue', meaning: 'Authorized' },
  QUOTING: { label: 'Quoting', tone: 'cyan', meaning: 'Retrieving provider quote' },
  QUOTED: { label: 'Quoted', tone: 'cyan', meaning: 'Pricing available' },
  AWAITING_SIGNATURE: { label: 'Awaiting signature', tone: 'amber', meaning: 'Wallet action required' },
  FUNDING_BROADCAST: { label: 'Keeper broadcast', tone: 'blue', meaning: 'Funding transaction broadcasting' },
  FUNDING_CONFIRMED: { label: 'Funding confirmed', tone: 'blue', meaning: 'Keeper funding confirmed' },
  INITIALIZATION_BROADCAST: { label: 'Initializing', tone: 'blue', meaning: 'Route initialization broadcasting' },
  PROCESSING: { label: 'Processing', tone: 'blue', meaning: 'Onchain processing' },
  SETTLEMENT_VERIFICATION: { label: 'Verifying settlement', tone: 'blue', meaning: 'Confirming settlement evidence' },
  COMPLETED: { label: 'Completed', tone: 'green', meaning: 'Verified settlement' },
  REJECTED: { label: 'Rejected', tone: 'red', meaning: 'Approval denied' },
  CANCELLED: { label: 'Cancelled', tone: 'grey', meaning: 'Cancelled before execution' },
  QUOTE_EXPIRED: { label: 'Quote expired', tone: 'grey', meaning: 'Quote or operation expired' },
  TRANSFER_EXPIRED: { label: 'Transfer expired', tone: 'grey', meaning: 'Provider transfer expired' },
  FAILED: { label: 'Failed', tone: 'red', meaning: 'Execution failed' },
  REFUNDED: { label: 'Refunded', tone: 'purple', meaning: 'Funds returned' },
  RECOVERABLE: { label: 'Recoverable', tone: 'amber', meaning: 'Recovery action required' },
  RESCUED: { label: 'Rescued', tone: 'green', meaning: 'Recovery confirmed' },
  MANUAL_REVIEW: { label: 'Manual review', tone: 'amber', meaning: 'Flagged for human review' },
  RECONCILIATION_REQUIRED: { label: 'Reconcile', tone: 'amber', meaning: 'Provider/chain evidence mismatch' },
  VALIDATING: { label: 'Validating', tone: 'cyan', meaning: 'Running validation checks' },
}

export const ACTIVE_EXECUTION_STATES: string[] = ['AWAITING_SIGNATURE', 'FUNDING_BROADCAST', 'FUNDING_CONFIRMED', 'INITIALIZATION_BROADCAST', 'PROCESSING', 'SETTLEMENT_VERIFICATION']
