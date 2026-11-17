# Threat Model — AZIMARA RELAY

## Critical assets

1. **Customer key material** — seed phrases and private keys. The platform has no input path for either. Wallet connection (public key) grants zero transfer authority.
2. **Payment integrity** — the exact approved payload (destination, mint, amount, source wallet) must be what executes.
3. **Tenant isolation** — organization A must never read or mutate organization B's records.

## Custody boundaries (architectural)

- Wallets are registered as public keys; ownership is proven by an ed25519 message signature over a nonce-bound challenge. Verification never authorizes transfers.
- Every transfer requires the user's own wallet signature on the provider-prepared transaction bundle. The backend builds nothing that moves funds on its own.
- No omnibus wallet exists; customer funds are never pooled or commingled.
- AI (Relay Intelligence) cannot sign, approve, or bypass policy. AI proposals become payments only through the normal pipeline.

## Controls

| Control | Implementation |
|---|---|
| Authentication | scrypt password hashing; httpOnly SameSite=Lax session cookies; TOTP MFA (RFC 6238), secrets encrypted AES-256-GCM |
| Authorization | Server-side RBAC on every route (7 roles / 21 permissions); permission checks are never frontend-only |
| Tenancy | Organization context validated per request (`X-Organization-Id` + membership lookup); all queries scoped by orgId |
| Approvals | Payload-hash bound; any material change voids approvals; expiry; revocation; separation of duties on multi-approver payments; policy versioning never retroactively reuses approvals |
| Idempotency | Stable externalId per payment; per-org hashed idempotency keys; replay returns the original payment |
| Webhooks | HMAC-SHA256 over the raw body, timing-safe comparison; every delivery persisted (valid or rejected) before processing; processing is asynchronous |
| Secrets | Provider keys and webhook secrets encrypted at rest; API keys shown once and stored hashed; secrets never logged |
| Input | Zod validation on every mutating route; CSV parsing is RFC-4180 style; token mints validated against the supported-asset registry |
| Rate limiting | Per-IP sliding windows on auth, registration, MFA, payments, developer API (per-instance; use a shared store for multi-instance) |
| Audit | Immutable audit log for every consequential action with actor type and IP; financial tables never cascade-delete |

## Disclosed risks (not silently accepted)

1. **Provider smart-contract risk** — routing depends on MultiHopper programs. Published provider security documentation has advised caution until audit reports are available. Mainnet support is gated on current audits, program deployment information, vulnerability disclosure and recovery documentation. RELAY never claims a third-party protocol is audited when it is not.
2. **Per-instance rate limiting** — the in-process limiter must be replaced with a shared store (Redis) for horizontal scale-out.
3. **Single-instance queue** — the durable DB queue leases within one process; multi-instance deployment needs the Redis-backed swap documented in the operations runbook.
4. **Routing transparency** — routing does not guarantee anonymity; onchain traceability remains. The interface makes no sanctions-clearance or compliance claims; jurisdictional controls are the customer's responsibility.
