import { ok } from '@/lib/api'

/// OpenAPI 3.1 specification for the AZIMARA RELAY application API and the
/// key-authenticated developer API. Served as JSON for developer tooling.
export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'AZIMARA RELAY API',
      version: '1.0.0',
      description:
        'Non-custodial Solana treasury operations and payment orchestration. Application endpoints use session auth with organization context (X-Organization-Id header). Developer endpoints under /api/v1 use API keys (Authorization: Bearer rk_test_…/rk_live_…) with explicit scopes.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'auth' }, { name: 'organizations' }, { name: 'wallets' }, { name: 'recipients' },
      { name: 'payments' }, { name: 'batches' }, { name: 'approvals' }, { name: 'schedules' },
      { name: 'treasury' }, { name: 'reconciliation' }, { name: 'intelligence' }, { name: 'integrations' },
      { name: 'webhooks' }, { name: 'developer-api' }, { name: 'billing' }, { name: 'audit' },
    ],
    paths: {
      '/api/auth/register': { post: { tags: ['auth'], summary: 'Register a user (optionally with a new organization)' } },
      '/api/auth/login': { post: { tags: ['auth'], summary: 'Login (TOTP MFA challenge when enabled)' } },
      '/api/auth/logout': { post: { tags: ['auth'], summary: 'Destroy the session' } },
      '/api/auth/session': { get: { tags: ['auth'], summary: 'Current user, memberships, MFA state' } },
      '/api/auth/mfa': { post: { tags: ['auth'], summary: 'MFA setup/enable/disable/challenge (TOTP)' } },
      '/api/organizations': { get: { tags: ['organizations'], summary: 'List my organizations' }, post: { tags: ['organizations'], summary: 'Create an organization with default policy' } },
      '/api/organizations/active': { get: { tags: ['organizations'], summary: 'Active org details, settings, entitlements' }, patch: { tags: ['organizations'], summary: 'Update org settings' } },
      '/api/onboarding': { get: { tags: ['organizations'], summary: 'Interactive onboarding checklist' }, patch: { tags: ['organizations'], summary: 'Update checklist step' } },
      '/api/members': { get: { tags: ['organizations'], summary: 'List members and roles' }, patch: { tags: ['organizations'], summary: 'Change member role' }, delete: { tags: ['organizations'], summary: 'Remove member' } },
      '/api/invitations': { get: { tags: ['organizations'], summary: 'List invitations' }, post: { tags: ['organizations'], summary: 'Invite a member' }, delete: { tags: ['organizations'], summary: 'Revoke invitation' } },
      '/api/invitations/accept': { post: { tags: ['organizations'], summary: 'Accept invitation (creates account when needed)' } },
      '/api/wallets': { get: { tags: ['wallets'], summary: 'List organization wallets' }, post: { tags: ['wallets'], summary: 'Register wallet (real address validation)' } },
      '/api/wallets/{walletId}/verify': { get: { tags: ['wallets'], summary: 'Get ownership challenge message' }, post: { tags: ['wallets'], summary: 'Submit signed challenge (ed25519 verified)' } },
      '/api/wallets/{walletId}/balance': { post: { tags: ['wallets'], summary: 'Refresh real balances via Solana RPC' } },
      '/api/recipients': { get: { tags: ['recipients'], summary: 'Search/filter recipient directory' }, post: { tags: ['recipients'], summary: 'Create recipient' } },
      '/api/recipients/{recipientId}': { get: { tags: ['recipients'], summary: 'Recipient detail with change history' }, patch: { tags: ['recipients'], summary: 'Update (address change invalidates approvals)' }, delete: { tags: ['recipients'], summary: 'Archive recipient' } },
      '/api/recipients/import': { post: { tags: ['recipients'], summary: 'CSV import with per-row validation' } },
      '/api/recipients/export': { get: { tags: ['recipients'], summary: 'CSV export' } },
      '/api/payments': { get: { tags: ['payments'], summary: 'List payments (filters: status, q, walletId)' }, post: { tags: ['payments'], summary: 'Create payment (validation → policy → PENDING_APPROVAL)' } },
      '/api/payments/{paymentId}': { get: { tags: ['payments'], summary: 'Full payment detail: lifecycle, approvals, signatures, quote' } },
      '/api/payments/{paymentId}/quote': { post: { tags: ['payments'], summary: 'Request provider quote (requires approval)' } },
      '/api/payments/{paymentId}/approve': { post: { tags: ['payments'], summary: 'Approve/reject with payload-hash evidence' } },
      '/api/payments/{paymentId}/execute': { post: { tags: ['payments'], summary: 'Create idempotent provider transfer' } },
      '/api/payments/{paymentId}/prepare': { post: { tags: ['payments'], summary: 'Get unsigned transaction bundles' } },
      '/api/payments/{paymentId}/broadcast': { post: { tags: ['payments'], summary: 'Keeper funding signed → intermediate confirm-broadcast' } },
      '/api/payments/{paymentId}/confirm': { post: { tags: ['payments'], summary: 'Final confirm-broadcast after chain confirmation' } },
      '/api/payments/{paymentId}/sync': { post: { tags: ['payments'], summary: 'Provider + chain reconciliation' } },
      '/api/payments/{paymentId}/cancel': { post: { tags: ['payments'], summary: 'Cancel pre-execution payment' } },
      '/api/batches': { get: { tags: ['batches'], summary: 'List batches' }, post: { tags: ['batches'], summary: 'Create batch (validation, duplicates, 20-destination limit)' } },
      '/api/batches/preview': { post: { tags: ['batches'], summary: 'Dry-run CSV validation' } },
      '/api/batches/{batchId}/actions': { get: { tags: ['batches'], summary: 'Batch detail with per-item status' }, post: { tags: ['batches'], summary: 'validate | execute' } },
      '/api/approvals': { get: { tags: ['approvals'], summary: 'Approval queue with independence state' } },
      '/api/policies': { get: { tags: ['approvals'], summary: 'Policy versions' }, post: { tags: ['approvals'], summary: 'Create new policy version' } },
      '/api/schedules': { get: { tags: ['schedules'], summary: 'List recurring schedules' }, post: { tags: ['schedules'], summary: 'Create schedule' } },
      '/api/treasury': { get: { tags: ['treasury'], summary: 'Treasury overview aggregation' } },
      '/api/analytics': { get: { tags: ['treasury'], summary: 'Analytics series (timeline, status, assets, fees)' } },
      '/api/activity': { get: { tags: ['audit'], summary: 'Recent organization activity' } },
      '/api/reconciliation': { get: { tags: ['reconciliation'], summary: 'Reconciliation records, webhook inbox, transfers' } },
      '/api/reconciliation/actions': { post: { tags: ['reconciliation'], summary: 'sync_payment | resync_all | resolve' } },
      '/api/exports': { get: { tags: ['reconciliation'], summary: 'List exports' }, post: { tags: ['reconciliation'], summary: 'Generate CSV export (PAYMENTS|RECONCILIATION|LEDGER|AUDIT)' } },
      '/api/integrations/status': { get: { tags: ['integrations'], summary: 'Provider/RPC/AI status + non-custodial attestation' } },
      '/api/integrations/multihopper': { get: { tags: ['integrations'], summary: 'MultiHopper configuration state' }, post: { tags: ['integrations'], summary: 'Configure credentials (env-isolated keys)' }, put: { tags: ['integrations'], summary: 'Connectivity probe' }, delete: { tags: ['integrations'], summary: 'Remove credentials' } },
      '/api/webhooks/multihopper': { post: { tags: ['webhooks'], summary: 'Provider webhook receiver (HMAC-SHA256 verified)' } },
      '/api/intelligence/sessions': { get: { tags: ['intelligence'], summary: 'AI sessions + proposals' } },
      '/api/intelligence/chat': { get: { tags: ['intelligence'], summary: 'Session messages' }, post: { tags: ['intelligence'], summary: 'Send message / extract invoice' } },
      '/api/intelligence/proposals/{proposalId}/action': { post: { tags: ['intelligence'], summary: 'ACCEPT → deterministic payment creation; REJECT' } },
      '/api/api-keys': { get: { tags: ['developer-api'], summary: 'List API credentials' }, post: { tags: ['developer-api'], summary: 'Create API key (shown once)' } },
      '/api/api-keys/{keyId}': { delete: { tags: ['developer-api'], summary: 'Revoke API key' } },
      '/api/v1/payments': { get: { tags: ['developer-api'], summary: 'List payments (API key: payments:read)' }, post: { tags: ['developer-api'], summary: 'Create payment (API key: payments:create)' } },
      '/api/v1/recipients': { get: { tags: ['developer-api'], summary: 'List recipients (API key: recipients:read)' }, post: { tags: ['developer-api'], summary: 'Create recipient (API key: recipients:create)' } },
      '/api/billing': { get: { tags: ['billing'], summary: 'Subscription, entitlements, usage' }, post: { tags: ['billing'], summary: 'Change plan (no payment collection configured)' } },
      '/api/audit': { get: { tags: ['audit'], summary: 'Immutable audit trail' } },
      '/api/health': { get: { tags: ['integrations'], summary: 'Service health' } },
    },
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'relay_session' },
        apiKey: { type: 'http', scheme: 'bearer', description: 'rk_test_/rk_live_ API keys' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' }, details: {} },
              required: ['code', 'message', 'requestId'],
            },
          },
        },
      },
    },
  }
  return ok(spec)
}
