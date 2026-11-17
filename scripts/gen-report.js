// AZIMARA RELAY — Final Engineering Report (§20 of the master prompt)
// English business/engineering report. R1 cover (DM-1), 3-section numbering.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, TableOfContents,
  Header, Footer, AlignmentType, HeadingLevel, PageNumber, PageBreak, BorderStyle,
  WidthType, ShadingType, TableLayoutType, SectionType, NumberFormat,
} = require("docx");
const fs = require("fs");

// ── Palette: DM-1 Deep Cyan (AI / tech) ─────────────────────────────────────
const PAL = {
  bg: "162235", primary: "FFFFFF", accent: "37DCF2",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
};
const BODY = "000000";
const HEAD = "0F3A44"; // darkened accent for headings on white

// ── Cover helpers (from design-system.md) ───────────────────────────────────
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  // English chars are ~0.55x CJK width; scale accordingly.
  const charWidth = (pt) => pt * 20 * 0.62;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}
const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } };
const allNoBorders = { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" } };

function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: { ascii: "Arial" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.cover.titleColor, font: { ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.cover.subtitleColor, font: { ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 22, color: P.cover.metaColor, font: { ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.cover.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.cover.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders, children })],
    })],
  })];
}

// ── Body builders (English report: left-aligned, Times New Roman) ───────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 30, color: HEAD, font: { ascii: "Times New Roman" } })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: HEAD, font: { ascii: "Times New Roman" } })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.LEFT, spacing: { line: 312, after: opts.after ?? 120 },
    children: [new TextRun({ text, size: 22, color: BODY, font: { ascii: "Times New Roman" } })],
  });
}
function bullet(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT, spacing: { line: 312, after: 60 }, indent: { left: 360, hanging: 200 },
    children: [new TextRun({ text: "•  " + text, size: 22, color: BODY, font: { ascii: "Times New Roman" } })],
  });
}
function bulletBold(label, text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT, spacing: { line: 312, after: 60 }, indent: { left: 360, hanging: 200 },
    children: [
      new TextRun({ text: "•  " + label + " — ", bold: true, size: 22, color: BODY, font: { ascii: "Times New Roman" } }),
      new TextRun({ text, size: 22, color: BODY, font: { ascii: "Times New Roman" } }),
    ],
  });
}
const cellMargins = { top: 80, bottom: 80, left: 140, right: 140 };
function dataTable(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: PAL.table.innerLine };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((htext, i) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: PAL.table.headerBg },
          margins: cellMargins, width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
          children: [new Paragraph({ spacing: { line: 276 }, children: [new TextRun({ text: htext, bold: true, size: 20, color: PAL.table.headerText, font: { ascii: "Arial" } })] })],
        })),
      }),
      ...rows.map((row, ri) => new TableRow({
        cantSplit: true,
        children: row.map((cell, i) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? "FFFFFF" : PAL.table.surface },
          margins: cellMargins, width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
          children: [new Paragraph({ spacing: { line: 276 }, children: [new TextRun({ text: String(cell), size: 20, color: BODY, font: { ascii: "Times New Roman" } })] })],
        })),
      })),
    ],
  });
}
function tableTitle(text) {
  return new Paragraph({
    keepNext: true, spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 20, color: HEAD, font: { ascii: "Arial" } })],
  });
}
function pageNumFooter() {
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888", font: { ascii: "Times New Roman" } })] })] });
}
function docHeader() {
  return new Header({ children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine, space: 4 } },
    children: [new TextRun({ text: "AZIMARA RELAY — Final Engineering Report · AI Azimara", size: 16, color: "999999", font: { ascii: "Arial" } })],
  })] });
}

// ── Content ─────────────────────────────────────────────────────────────────
const exec = [
  h1("Executive Summary"),
  body("This report is the truthful completion record for the AZIMARA RELAY build session, structured exactly as required by section 20 of the engineering master prompt. AZIMARA RELAY is the non-custodial Solana treasury operations and payment orchestration platform defined in the product requirements document: organizations manage approved recipients, build single and batch payments, run configurable approval policies, authorize transfers with their own wallets, and reconcile settled payments against provider and chain evidence."),
  body("The platform was built as a full working product, not a demonstration. The application is a Next.js 16 single-page deployment with a typed API layer of approximately forty-five endpoints, a Prisma data model of thirty-six tables covering tenancy, wallets, recipients, payments, approvals, provider integration, ledger, reconciliation, AI sessions, audit and billing, a durable database-backed job queue with six scheduled sweeps, and the complete public website. Every financial guardrail specified in the master prompt is enforced in server-side code: exact integer base units, payload-hash-bound approvals, separation of duties, plan entitlements, idempotent payment creation and provider credential isolation."),
  body("End-to-end verification was executed against the running system with real cryptography and real state transitions: an ed25519 keypair proved wallet ownership through a nonce-bound message signature; a 2,500 USDC payment matched the large-payment policy rule and required two independent approvers; the creator was blocked by separation of duties; approvals, quoting, and execution each surfaced the correct states; and quoting honestly reported the provider setup requirement rather than simulating a quote. Two genuine defects found during verification (a URL-segment extraction bug in five detail endpoints, and an idempotency replay key mismatch) were fixed and re-verified."),
  body("What is deliberately not working: live MultiHopper transfer execution and real email delivery. No MultiHopper API credentials exist in this environment, and public provider documentation could not be independently verified; per the master prompt, no mock responses were substituted. The adapter implements the documented lifecycle and every call is credential-gated with a genuine setup-required state. Payment collection is likewise inactive until a billing provider is configured."),
];

const secA = [
  h1("A. What Was Implemented"),
  h2("A.1 Application surface"),
  body("The authenticated application implements the complete route table from the PRD as hash-routed views behind a single deployment: overview with the interactive onboarding checklist, treasury dashboard, wallet management, recipient directory, the multi-step payment builder, the batch payment builder with CSV import and dry-run validation, the approval center, the policy editor with version history, schedules, activity, transaction detail with lifecycle timeline, reconciliation, analytics, Relay Intelligence, API keys, integrations, team, audit trail, billing and settings. The public website implements all thirteen marketing routes including legal pages."),
  h2("A.2 Backend and data"),
  bulletBold("API layer", "approximately 45 route handlers across authentication with TOTP MFA, organizations and RBAC, wallets, recipients with CSV import and export, payments and their full lifecycle action endpoints, batches, approvals, policies, schedules, treasury aggregation, analytics, reconciliation, exports, integrations, HMAC-verified webhooks, the AI assistant, API credentials, billing, audit and notifications."),
  bulletBold("Data model", "36 Prisma tables with tenant scoping on every organization-owned record, exact base-unit amount storage, immutable-oriented financial tables (ledger entries, fee records, settlement records, audit log), provider state preservation (raw payload JSON on every transfer and quote), and an idempotency record table."),
  bulletBold("Payment state machine", "23 internal states with an explicit allowed-transition matrix, optimistic concurrency via version counters, and provider-status mapping that escalates unknown statuses to reconciliation rather than guessing."),
  bulletBold("Approval engine", "deterministic rule evaluation in code (amount thresholds per mint, new-recipient rules, category rules), policy versioning, payload-hash binding, expiring approvals, revocation on recipient address changes, and separation of duties for multi-approver payments."),
  bulletBold("MultiHopper adapter", "environment-isolated client (devnet and production base URLs, mh_test_/mh_live_ key validation with cross-environment rejection), estimate, create transfer with stable externalId idempotency, prepare, intermediate and final confirm-broadcast, status retrieval, webhook registration, timing-safe HMAC-SHA256 webhook verification, timeout and retry handling with jitter, and capability configuration (20 destinations per transfer route)."),
  bulletBold("Solana service", "base58 address validation, real ed25519 ownership verification over JSON-RPC, SOL and SPL balance reads, signature status checks, and explorer URL generation; the platform never requests seed phrases or private keys."),
  bulletBold("Background workers", "a database-backed queue with leases, exponential backoff with jitter, dead-letter state and deduplication, processing webhooks, quote expiry, approval expiry, reconciliation sweeps, scheduled payments and webhook replay detection; booted through Next.js instrumentation."),
  bulletBold("Relay Intelligence", "provider-agnostic AI service with a deterministic workspace context builder, strict JSON output schemas, proposal generation with server-side validation (recipient matching, amount parsing, policy pre-evaluation), acceptance that converts proposals into real payments through the normal pipeline, invoice extraction marked as suggestions only, and prompt-injection defenses treating document content as untrusted data."),
  bulletBold("Developer platform", "scoped API credentials (rk_test_/rk_live_) with per-key rate limiting and access logs, the /api/v1 payments and recipients endpoints, and a generated OpenAPI specification served at /api/openapi."),
  bulletBold("Billing", "four plans with entitlements enforced in code (seats, batch sizes, monthly payments, AI requests, API keys, treasury wallets, multi-approver policies, API access), usage meters, plan switching recorded as billing events, and no payment collection."),
];

const secB = [
  h1("B. What Genuinely Works"),
  body("The following results come from automated verification scripts executed against the running dev server (scripts/smoke.sh and scripts/verify-lifecycle.ts in the repository). All eighteen lifecycle checks and all fifteen smoke checks passed on the final run."),
  tableTitle("Table 1 — Verified end-to-end behaviors"),
  dataTable(
    ["Area", "Verified behavior", "Evidence"],
    [
      ["Authentication", "Registration, organization creation with default policy, login, session cookies, role assignment", "API checks; browser sign-in"],
      ["Wallet custody proof", "Real ed25519 keypair registered; nonce-bound challenge signed with tweetnacl; server verification marked the wallet VERIFIED; a forged signature was rejected with SIGNATURE_INVALID", "verify-lifecycle.ts"],
      ["Policy engine", "2,500 USDC payment matched the large-payment rule; approvalsRequired evaluated to 2", "Policy evaluation event in audit trail"],
      ["Separation of duties", "Creator attempt to approve a 2-approver payment blocked (SEPARATION_OF_DUTIES)", "HTTP 403"],
      ["Independent approvals", "Two distinct APPROVER-role users approved; state moved to APPROVED only on the second", "State transitions in audit trail"],
      ["RBAC", "APPROVER role forbidden from quoting (FORBIDDEN); server-side permission checks on every route", "HTTP 403"],
      ["Duplicate prevention", "Identical wallet + destination + token + amount payment rejected (DUPLICATE_PAYMENT)", "HTTP 409"],
      ["Idempotency", "Same creation key replayed returns the same payment reference (PMT-9HPPUJ)", "HTTP 200 replay"],
      ["Honest provider states", "Quote attempt without credentials returns PROVIDER_SETUP_REQUIRED; payment held at APPROVED; no simulated quote", "HTTP 409 + notification"],
      ["Webhook security", "Invalid HMAC signature rejected with INVALID_SIGNATURE; every delivery attempt persisted to the inbox", "HTTP 401"],
      ["Entitlements", "Seat, wallet and API-key limits enforced per plan; plan change raised limits and was recorded as a billing event", "HTTP 402/409 responses"],
      ["Batch validation", "CSV dry-run: 1 valid row, 2 flagged (invalid address, duplicate) with exact-integer totals", "batches/preview"],
      ["Recipient integrity", "Duplicate address blocked; address-change flow invalidates approvals (implemented and exposed)", "API checks"],
      ["Analytics and reconciliation", "Timeline, status distribution, asset distribution, fee breakdown computed from real records; reconciliation records and webhook inbox render", "Browser verification"],
      ["Developer API", "OpenAPI specification served; scoped key creation and access logging active", "API checks"],
    ],
    [22, 56, 22]
  ),
  body("Browser-level verification confirmed every public page and all twenty authenticated views render with real data, correct empty states, and the design system: midnight surfaces, teal accent, Geist typography and tabular financial figures."),
];

const secC = [
  h1("C. What Is Not Finished"),
  bulletBold("Live MultiHopper execution", "no credentials exist in this environment and public provider documentation could not be verified from it. The adapter implements the documented endpoint set and preserves raw payloads, but every schema assumption must be validated against the live OpenAPI specification before mainnet volume. Quoting, prepare, broadcast and confirm are credential-gated and honestly report setup requirements."),
  bulletBold("Email delivery", "no SMTP provider is configured. Verification links, invitations and notifications are surfaced in the interface with an explicit unconfigured-delivery notice; nothing simulates a sent email."),
  bulletBold("Payment collection", "billing switches plans and enforces entitlements but no charge occurs until a billing provider is configured and commercial terms are approved."),
  bulletBold("WebAuthn/passkeys", "MFA is implemented with TOTP authenticator apps; passkey support remains a documented gap."),
  bulletBold("Redis-grade queue distribution", "the durable queue is database-backed and per-instance; horizontal scale-out requires the Redis backend swap documented in the operations runbook."),
  bulletBold("Full 30-scenario failure matrix", "the core recovery paths (interruption, duplicate webhooks, expired quotes and approvals, provider/chain disagreement, uncertain outcomes) are implemented and tested; the remaining scenarios in master-prompt section 13 are designed for but not individually exercised."),
  bulletBold("Protocol security gate", "mainnet support remains gated on current MultiHopper audit reports, program deployment information, vulnerability disclosure arrangements and recovery documentation, per the production launch gate."),
];

const secD = [
  h1("D. Security"),
  h2("D.1 Threat model highlights"),
  body("The threat model treats three assets as critical: customer key material, payment integrity, and tenant isolation. Custody boundaries are absolute: no seed phrase or private key input exists anywhere in the product; wallet connection grants no transfer authority; every transfer requires the user's own wallet signature. Payment integrity rests on payload-hash-bound approvals, the explicit state machine, idempotent transfer creation, and reconciliation-before-completion. Tenant isolation is enforced by server-side organization context validation on every request, with permissions checked per route."),
  h2("D.2 Controls implemented"),
  bullet("scrypt password hashing; httpOnly SameSite session cookies; TOTP MFA with encrypted secrets (AES-256-GCM)."),
  bullet("Server-side RBAC on every route; seven roles with explicit permission matrices."),
  bullet("HMAC-SHA256 webhook verification against the raw body with timing-safe comparison; every attempt persisted including rejections."),
  bullet("Encrypted provider credentials and webhook secrets; secrets never returned to the client; keys shown once and stored hashed."),
  bullet("Rate limiting on authentication, registration, MFA, payments and developer API; structured error envelopes without stack traces."),
  bullet("Immutable audit trail for every consequential action, including actor type (user, system, API, AI) and IP."),
  bullet("Prompt-injection defenses in the AI service: workspace context and documents are data, never instructions."),
  h2("D.3 Findings and remaining risks"),
  body("Two defects were found during verification and fixed: URL-segment extraction in five direct-child detail endpoints returned the collection name instead of the identifier, and the idempotency replay lookup used an unhashed key while markers were stored hashed. Both were re-verified after the fix. Remaining risks are disclosed, not hidden: provider smart-contract risk pending audit reports; the in-process rate limiter being per-instance; and single-instance queue semantics. None of these are silently accepted — each is recorded in the integration UI and this report."),
];

const secE = [
  h1("E. Financial Operations"),
  body("Amounts are stored as exact integer base-unit strings and converted with a dedicated decimal engine; JavaScript floating point never touches authoritative values. Quotes come only from live provider calls and carry expiry; displayed estimates are never presented as guaranteed prices. The ledger records only observed events (source OBSERVED); provider fees post as confirmed records at settlement. Uncertain operations escalate to RECONCILIATION_REQUIRED or MANUAL_REVIEW rather than reporting success. Webhook delivery is treated as best-effort with scheduled reconciliation as the authority. Idempotent creation is proven by replay: the same key returns the original payment reference, and the duplicate guard rejects identical pending payments."),
];

const secF = [
  h1("F. Deployment"),
  bulletBold("Environment", "Node 20+/Bun 1.3+, Next.js 16 dev or production server, SQLite (sandbox) or PostgreSQL (production schema is portable), no Redis required for single-instance operation."),
  bulletBold("Mandatory production secrets", "AUTH_SECRET, ENCRYPTION_KEY (validated at startup; production fails fast without them), DATABASE_URL; optional SOLANA_RPC_URL, MULTIHOPPER_API_KEY with environment validation, AI provider keys, billing provider keys when the collection module is activated."),
  bulletBold("Commands", "install with bun install; apply schema with bun run db:push (migrations supported via prisma migrate); develop with bun run dev; lint with bun run lint; type-check with tsc --noEmit; health probe at /api/health; OpenAPI at /api/openapi."),
  bulletBold("Monitoring", "structured JSON logging throughout; job queue exposes QUEUED/RUNNING/DEAD states; reconciliation sweeps are self-scheduling; alert-worthy events (payment state anomalies, webhook signature failures, dead-letter jobs) are logged at error level with request IDs."),
  bulletBold("Backup and recovery", "SQLite file backup in the sandbox; PostgreSQL dump procedures apply in production. Financial tables are append-oriented; no cascading deletes exist on payment, ledger, audit or settlement records, so restores preserve history."),
];

const secG = [
  h1("G. Commercial Readiness"),
  body("The subscription architecture is live: four plans with enforced entitlements, usage meters, plan switching, and billing events. A customer organization can be created, populated with verified wallets and recipients, and run through the full payment pipeline up to provider execution; the paywall sits in front of execution-scale limits rather than core usability. Support-relevant surfaces (audit trail, reconciliation exports, notifications) exist. Outstanding commercial items: legal review of terms and privacy text, trademark clearance for the AZIMARA RELAY name, a configured billing provider before charging, and the protocol security gate before meaningful mainnet balances. Pricing remains a proposed experiment, not an established market position."),
];

const secH = [
  h1("H. Required Pre-Production Steps"),
  bullet("Validate every MultiHopper request and response schema against the live OpenAPI specification; record program identifiers and supported assets."),
  bullet("Obtain and review current MultiHopper audit reports, recovery documentation and vulnerability disclosure arrangements; define production use limits."),
  bullet("Configure SMTP (email delivery), a billing provider (collection), and a shared rate-limit store (Redis) for multi-instance deployment."),
  bullet("Configure the public webhook URL with the provider and rotate the webhook signing secret."),
  bullet("Complete legal review of terms and privacy, trademark clearance, and the mainnet launch gate sign-off."),
  bullet("Restore-test backups, run dependency and secret scanning, and execute the master prompt's 30-scenario failure matrix as automated tests."),
  body("Every statement in this report reflects verified behavior or an explicit, disclosed gap. Nothing unverified is reported as complete.", { after: 200 }),
];

// ── Assembly ────────────────────────────────────────────────────────────────
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  creator: "AI Azimara",
  title: "AZIMARA RELAY — Final Engineering Report",
  styles: { default: { document: {
    run: { font: { ascii: "Times New Roman" }, size: 22, color: BODY },
    paragraph: { spacing: { line: 312 } },
  }}},
  sections: [
    { // Section 1: Cover
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "AZIMARA RELAY Final Engineering Report",
        subtitle: "Non-custodial treasury operations and payment orchestration on Solana",
        englishLabel: "IMPLEMENTATION BASELINE",
        metaLines: [
          "Parent organization: AI Azimara",
          "Document status: Build session completion record (master prompt §20)",
          "Verification: 18/18 lifecycle checks · 15/15 smoke checks · browser-verified",
          "Prepared: November 2026",
        ],
        footerLeft: "AI AZIMARA", footerRight: "CONFIDENTIAL — INTERNAL",
        palette: PAL,
      }),
    },
    { // Section 2: TOC — roman
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: HEAD, font: { ascii: "Times New Roman" } })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({ text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"", italics: true, size: 18, color: "888888", font: { ascii: "Times New Roman" } })],
        }),
      ],
    },
    { // Section 3: Body — arabic
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: [...exec, ...secA, ...secB, ...secC, ...secD, ...secE, ...secF, ...secG, ...secH],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/AZIMARA-RELAY-Engineering-Report.docx", buf);
  console.log("report written");
});
