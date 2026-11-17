# Deployment — AZIMARA RELAY

## Requirements

- Node.js 20+ or Bun 1.3+
- PostgreSQL (production) or SQLite (single-node/sandbox). The Prisma schema uses portable types only (no enums/JSON columns) and lifts to PostgreSQL without rewrites; add Row Level Security at the provider level for defense in depth.
- Optional: Redis for shared rate limiting and the queue backend at scale.

## Environment

Copy `.env.example` → `.env`. Mandatory in production: `AUTH_SECRET`, `ENCRYPTION_KEY` (startup fails fast without them), `DATABASE_URL`. Optional integrations: `SOLANA_RPC_URL`, `MULTIHOPPER_API_KEY` + `MULTIHOPPER_WEBHOOK_SECRET` (environment-validated: `mh_test_` devnet, `mh_live_` production — cross-usage is rejected), AI provider keys, billing provider keys when collection is activated.

Never commit real secrets; rotate `AUTH_SECRET`/`ENCRYPTION_KEY` through a secret manager. Note: rotating `ENCRYPTION_KEY` invalidates stored provider credentials and TOTP secrets — re-enter them after rotation.

## Commands

```bash
bun install
bun run db:push          # apply schema (dev)
bun run db:migrate       # migrations (review before production)
bun run dev              # development server on :3000
bun run lint && bunx tsc --noEmit
```

Production build follows the Next.js standard pipeline (`next build` + `next start`) with the same environment; containerize with the base image of your choice. The single visible page route serves the whole SPA; all state lives behind the API.

## Post-deploy checklist

1. `GET /api/health` returns healthy (database connectivity).
2. `GET /api/openapi` serves the specification.
3. Register the public webhook URL (`/api/webhooks/multihopper`) with the provider and store the signing secret in Integrations.
4. Configure MultiHopper credentials in Integrations → MultiHopper and run the connectivity probe (an estimate call — no financial obligation).
5. Create the first organization (default approval policy and subscription are provisioned automatically).
6. Verify one wallet through the real signature challenge before enabling payments.
7. Confirm background workers are alive: `JobRecord` rows transition QUEUED → DONE.
8. Backup schedule active; restore tested (master prompt production gate).
