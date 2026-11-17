# AZIMARA RELAY

Non-custodial treasury operations, payment orchestration and programmable onchain payouts for businesses on Solana. A product of AI Azimara.

## What this repository contains

A full working platform (not a prototype):

- **Public website** — 13 marketing routes (home, product, treasury, payouts, intelligence, integrations, developers, security, pricing, company, contact, legal) rendered as hash-routed views.
- **Authenticated application** — 20 operational views: onboarding checklist, treasury, wallets, recipients, payment builder, batch builder, approval center, policy editor, schedules, activity, transaction detail, reconciliation, analytics, Relay Intelligence (AI), API keys, integrations, team, audit, billing, settings.
- **Backend** — ~45 API route handlers, 36-table Prisma schema, payment state machine (23 states), approval policy engine, MultiHopper adapter, Solana service, DB-backed durable job queue, HMAC-verified webhooks, OpenAPI spec at `/api/openapi`.

## Architecture (single-deployment layout)

```
src/
├── app/
│   ├── page.tsx              # single visible route → SPA shell
│   └── api/                  # backend route handlers (~45 endpoints)
├── components/relay/         # design system, shell, public site, all app views
├── instrumentation.ts        # boots asset seed + background worker
└── lib/
    ├── api.ts                # route wrapper: session → org → RBAC → rate limit
    ├── auth.ts               # sessions, TOTP MFA, org context
    ├── rbac.ts               7 roles, 21 permissions (server-side)
    ├── entitlements.ts       # plan gates enforced in code
    ├── state-machine.ts      # payment lifecycle + provider status mapping
    ├── approvals.ts          # deterministic policy evaluation, payload hashing
    ├── payments.ts           # payment domain service (idempotent, versioned)
    ├── batches.ts            # batch validation, isolation, execution
    ├── multihopper.ts        # env-isolated provider adapter
    ├── solana.ts             # address validation, ed25519 ownership, RPC
    ├── ai.ts                 # Relay Intelligence (z-ai) with deterministic checks
    ├── jobs.ts + worker-processor.ts  # durable queue + all processors
    └── client/               # SPA router, API wrapper, formatters, wallet
```

## Running

```bash
bun install
bun run db:push          # apply schema (SQLite in this environment; schema is PostgreSQL-portable)
bun run dev              # http://localhost:3000
bun run lint             # eslint
bunx tsc --noEmit        # typecheck
```

Health: `GET /api/health` · OpenAPI: `GET /api/openapi`

## Environment

See `.env.example`. Production fails fast without `AUTH_SECRET` and `ENCRYPTION_KEY`. MultiHopper keys are validated per environment (`mh_test_` → devnet only, `mh_live_` → production only).

## Commercialization — on-chain subscription collection

Subscription collection is LIVE on Solana **mainnet-beta** in USDC (native Circle mint), payable to the configured treasury (`TREASURY_ADDRESS`):

- **Invoices** — an upgrade or renewal creates a `SubscriptionInvoice` whose amount carries a globally-unique micro-suffix (e.g. `199.311518 USDC`), so an incoming transfer can be matched to exactly one invoice with no off-chain binding.
- **Two settlement paths, both reading the real chain** — a `BILLING_SWEEP` cron (60 s) watches the treasury owner address + its derived USDC ATA via `getSignaturesForAddress` at `finalized` commitment, and customers can paste a transaction signature for instant verification. PDA/ATA derivation is byte-identical to `@solana/web3.js` (verified by `scripts/verify-billing.ts`).
- **Idempotent and honest** — signatures are unique-indexed (one transfer credits one invoice, claims are idempotent), failed/wrong-recipient/unmatched transfers return typed errors, and unmatched incoming deposits are recorded (`TreasuryDeposit`) for reconciliation — never dropped, never simulated.
- **Entitlements** — plan switches apply only after on-chain settlement; downgrades remain immediate and keep their usage guards. Enterprise is contract-priced (`CUSTOM_QUOTE_REQUIRED`).
- The platform never requests or stores private keys; the treasury address is a public key.

## Responsive, cross-browser and search visibility

- **Mobile / tablet** — every public and authenticated view is verified overflow-free at 320 / 375 / 768 / 1024 / 1440 px (Playwright sweep: `scripts/visual-smoke.js`). Dense tables scroll horizontally with min-widths; dialogs clamp to `max-h-[calc(100dvh-2rem)]` and scroll; touch targets are ≥36-44 px; the desktop sidebar appears from `md` (tablets keep the real sidebar), the 9-page marketing nav collapses to a scrollable chip strip below `xl`.
- **Cross-browser** — `color-scheme: dark` for native controls, Firefox `scrollbar-width/color` scrollbars, autofill repaint fix (WebKit), dark `<option>` palettes for Windows Chrome, dark calendar-picker indicators, `-webkit-tap-highlight-color` suppression, `dvh` upgrade for iOS Safari toolbars, and 16 px input font-size on coarse pointers to stop iOS focus zoom.
- **SEO** — server-rendered metadata (canonical, Open Graph with 1200×630 `/og.png`, Twitter card, robots directives, geo meta for Dubai) plus per-route client sync of title/description/canonical/OG via `src/lib/client/seo.ts`; app views are `noindex`. `/sitemap.xml`, `/robots.txt` and `/manifest.webmanifest` are generated metadata routes. JSON-LD (`Organization`, `WebSite`, `SoftwareApplication`, per-route `BreadcrumbList`, home `FAQPage`) is emitted server-side.
- **AEO / GEO** — a visible FAQ section with question-form headings and concise extractable answers (mirrored as `FAQPage` JSON-LD + microdata), `public/llms.txt` and `public/llms-full.txt` for generative engines, and consistent Dubai / UAE entity signals (footer address element, company page regional compliance paragraph referencing VARA/CBUAE, `areaServed` in schema, `en-AE` locale).
- Set `NEXT_PUBLIC_SITE_URL` to the production origin before launch — every canonical/OG/sitemap URL derives from it.

## Verification tooling

- `scripts/visual-smoke.js` — end-to-end Playwright smoke: register → verify → login → org → app views → batch dialog at mobile/tablet widths, plus overflow checks and title/noindex assertions.
- `scripts/verify-billing.ts` — commercialization suite: PDA/on-curve differential vs `@solana/web3.js`, real mainnet transfer parsing, live treasury sweep, invoice lifecycle API tests (fabricated claims fail honestly).
- `scripts/verify-sweep-live.ts` — points the sweep at a wallet with genuine USDC traffic and asserts real transfers are recorded then cleaned up.
- `scripts/verify-lifecycle.ts` — 24-check financial pipeline: ed25519 ownership, duplicate guard, separation of duties, RBAC, honest `PROVIDER_SETUP_REQUIRED`, invoice issuance.
- `scripts/debug-overflow.js` — reports elements wider than the viewport (excludes intentional scroll containers).
- `scripts/gen-og.js` — regenerates `/og.png` and the PWA/apple icons from `scripts/og-template.html`.

## Non-negotiable rules honored by this codebase

1. No fake functionality — mock responses never enter production paths; missing dependencies surface genuine setup-required states.
2. No unauthorized execution — no seed phrases, no private keys, no silent payments, no approval bypass, AI output is never authorization.
3. Provider schemas are implemented from the documented workflow and raw payloads are preserved; validate against the live OpenAPI spec before mainnet volume (see `docs/security/threat-model.md`).
4. Build for failure — retries only for idempotent operations, same externalId on transfer retries, reconciliation before uncertain transitions.

## Documentation

- `docs/deployment.md` — environment, commands, production checklist
- `docs/security/threat-model.md` — custody boundaries, controls, disclosed risks
- `docs/runbooks/operations.md` — queue, reconciliation, webhooks, alerting
