# Operations Runbook — AZIMARA RELAY

## Background workers

The worker boots via `src/instrumentation.ts` (once per server process) and processes a DB-backed queue (`JobRecord`) every 4 seconds: up to 5 jobs per tick, atomic claim with leases (5-minute max), exponential backoff with jitter, dead-letter (`DEAD`) after max attempts.

| Processor | Schedule | Purpose |
|---|---|---|
| WEBHOOK_PROCESS | on delivery | Validate, deduplicate, persist provider event, trigger transfer sync |
| QUOTE_EXPIRY_SWEEP | 60s | Expire stale quotes; payments at QUOTED → QUOTE_EXPIRED |
| APPROVAL_EXPIRY_SWEEP | 300s | Expire approvals; move QUOTED/AWAITING_SIGNATURE payments to MANUAL_REVIEW |
| RECONCILIATION_SWEEP | 120s | Provider sync for CREATED/PROCESSING transfers |
| SCHEDULE_SWEEP | 60s | Run due schedules into the normal payment pipeline |
| WEBHOOK_REPLAY_SWEEP | 60s | Detect permanently-dropped webhook deliveries |
| TRANSFER_MONITOR | per event | Post-confirmation monitoring |

Inspect: query `JobRecord` by `status` (`QUEUED`, `RUNNING`, `DEAD`). Replay a dead job by resetting `status='QUEUED'` and `attempts=0`. Setup-blocked jobs park quietly (provider credentials missing) — configure the integration instead of replaying.

## Reconciliation

Authority order: **provider API + chain evidence > webhooks**. Webhooks are hints that trigger syncs. `syncTransfer` maps provider status to internal state; COMPLETED requires provider settlement AND an onchain-confirmed signature. Manual resolution (`POST /api/reconciliation/actions` with `resolve`) requires a written note and is audited.

Weekly: review `ReconciliationRecord` states (MATCHED / UNRECONCILED / FAILED), the webhook inbox (rejected signatures = investigate), and `ProviderTransfer` phases stuck outside PROCESSING.

## Webhooks

Endpoint: `POST /api/webhooks/multihopper`. The provider signs the raw body with HMAC-SHA256 (`x-multihopper-signature`); verification is timing-safe against every configured org secret. Register the public URL in the provider console and store the signing secret in Integrations → MultiHopper. Webhook delivery can be permanently dropped by the provider — the RECONCILIATION_SWEEP is the fallback of record.

## Alerting

Error-level logs (request IDs included) for: unhandled route errors, dead-letter jobs, audit write failures, webhook rejections. Recommended alerts: dead-letter growth, webhook rejection spikes, reconciliation records stuck UNRECONCILED > 24h, repeated PROVIDER_SETUP_REQUIRED after credentials were configured, RPC health failures.

## State machine discipline

Never force-update `PaymentRequest.status` outside `lib/state-machine.ts` transitions. Uncertain outcomes (timeout after create, crash mid-broadcast) reconcile first: `POST /api/payments/{id}/sync` or the reconciliation sweep. Provider transfer retries reuse `relay-<paymentId>` as externalId — never mint a new one.

## Database

Migrations: `bun run db:migrate` (dev), review + apply in production. No cascading deletes exist on financial tables; retention is policy-driven. Backup before schema changes; restore-test quarterly (master prompt production gate).
