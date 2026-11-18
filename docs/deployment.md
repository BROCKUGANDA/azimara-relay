# Deployment — AZIMARA RELAY

## Requirements

- Node.js 20+ or Bun 1.3+
- PostgreSQL (production) or SQLite (single-node/sandbox). The Prisma schema uses portable types only (no enums/JSON columns) and lifts to PostgreSQL without rewrites; add Row Level Security at the provider level for defense in depth.
- Optional: Redis for shared rate limiting and the queue backend at scale.

## Environment

Copy `.env.example` → `.env`. Mandatory in production: `AUTH_SECRET`, `ENCRYPTION_KEY` (startup fails fast without them), `DATABASE_URL`. Set `SOLANA_NETWORK=mainnet-beta` (the default) and `TREASURY_ADDRESS` (the public key that receives USDC) to activate on-chain subscription collection; `BILLING_*` variables control the mint, decimals and invoice validity.

RPC — paid provider REQUIRED before real volume: set `HELIUS_API_KEY` (recommended; the RPC URL is derived automatically) or `SOLANA_RPC_URL` explicitly. Without either, the platform falls back to the public `api.mainnet-beta.solana.com` endpoint, which rate-limits aggressively and logs a startup warning — acceptable for smoke testing only, never for customer traffic.

Email — SMTP is required for transactional delivery in production (verification, password reset, invitations): set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Without it, the platform honestly reports "delivery unavailable" and surfaces one-time links in the interface (development convenience only — never presented as a sent email).

Other integrations: `MULTIHOPPER_API_KEY` + `MULTIHOPPER_WEBHOOK_SECRET` (environment-validated: `mh_test_` devnet, `mh_live_` production — cross-usage is rejected; the provider identity is an internal detail, not exposed on public surfaces), AI provider keys.

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
3. Register the public webhook URL (`/api/webhooks/execution-rail`) with the provider and store the signing secret in Integrations.
4. Configure execution-rail provider credentials in Integrations → execution-rail provider and run the connectivity probe (an estimate call — no financial obligation).
5. Create the first organization (default approval policy and subscription are provisioned automatically).
6. Verify one wallet through the real signature challenge before enabling payments.
7. Confirm background workers are alive: `JobRecord` rows transition QUEUED → DONE.
8. Backup schedule active; restore tested (master prompt production gate).
9. execution-rail provider source wallet funding (per the provider's agentic integration guide): the wallet must hold the transfer amount + `requiredSolUpFrontLamports` (returned per transfer) + gas for the full broadcast sequence (keeper funding → route init → orchestrator init → session init → dispersion init) + the 0.002 SOL per-destination-wallet screening fee on mainnet (non-refundable). For pre-production validation, use `mh_test_` keys against devnet with faucet SOL instead — no real funds required. Until this gate and gate 4 pass, provider-routed payments surface `PROVIDER_SETUP_REQUIRED` and direct transfers (gas only) remain the available execution path.
