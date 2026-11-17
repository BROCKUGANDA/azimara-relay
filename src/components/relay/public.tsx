'use client'

import { useState } from 'react'
import { useRouter, useSession } from '@/lib/client/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Shield, Landmark, Workflow, BrainCircuit, Blocks, Lock, ArrowRight, Check,
  Wallet, FileCheck2, Webhook, KeyRound, Banknote, ChevronRight, Terminal, Building2, Send,
} from 'lucide-react'

const NAV: { path: string; label: string }[] = [
  { path: '/product', label: 'Product' },
  { path: '/treasury', label: 'Treasury' },
  { path: '/payouts', label: 'Payouts' },
  { path: '/intelligence', label: 'Intelligence' },
  { path: '/integrations', label: 'Integrations' },
  { path: '/developers', label: 'Developers' },
  { path: '/security', label: 'Security' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/company', label: 'Company' },
]

function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="#35D6C0" strokeWidth="1.6" />
        <path d="M9 20.5 16 8l7 12.5" stroke="#35D6C0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12.2 17.4h7.6" stroke="#658CFF" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        AZIMARA <span className="text-[#35D6C0]">RELAY</span>
      </span>
    </span>
  )
}

function PublicHeader({ current }: { current: string }) {
  const { navigate } = useRouter()
  const session = useSession()
  return (
    <header className="sticky top-0 z-40 border-b border-[#1A293D] bg-[#080D17]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <button onClick={() => navigate('/')} aria-label="AZIMARA RELAY home">
          <Logo />
        </button>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${current === item.path ? 'bg-[#142135] text-[#35D6C0]' : 'text-secondary hover:bg-[#142135] hover:text-foreground'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {session.authenticated ? (
            <Button onClick={() => navigate('/app')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
              Open app <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate('/login')} className="text-secondary hover:text-foreground">Sign in</Button>
              <Button onClick={() => navigate('/register')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
                Get started
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-[#1A293D] px-4 py-2 lg:hidden">
        {NAV.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs ${current === item.path ? 'bg-[#142135] text-[#35D6C0]' : 'text-secondary'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  )
}

function Footer() {
  const { navigate } = useRouter()
  return (
    <footer className="mt-auto border-t border-[#1A293D] bg-[#0B1220]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div>
          <Logo size={22} />
          <p className="mt-3 text-xs leading-relaxed text-dim">
            Non-custodial treasury operations, payment orchestration and programmable onchain payouts. A product of AI Azimara.
          </p>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary">Product</div>
          {[['/product', 'Product'], ['/treasury', 'Treasury'], ['/payouts', 'Batch payouts'], ['/intelligence', 'Relay Intelligence'], ['/pricing', 'Pricing']].map(([p, l]) => (
            <button key={p} onClick={() => navigate(p)} className="block py-1 text-xs text-dim hover:text-[#35D6C0]">{l}</button>
          ))}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary">Developers</div>
          {[['/integrations', 'Integrations'], ['/developers', 'API reference'], ['/security', 'Security']].map(([p, l]) => (
            <button key={p} onClick={() => navigate(p)} className="block py-1 text-xs text-dim hover:text-[#35D6C0]">{l}</button>
          ))}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary">Legal & company</div>
          {[['/legal/privacy', 'Privacy'], ['/legal/terms', 'Terms'], ['/company', 'AI Azimara'], ['/contact', 'Contact']].map(([p, l]) => (
            <button key={p} onClick={() => navigate(p)} className="block py-1 text-xs text-dim hover:text-[#35D6C0]">{l}</button>
          ))}
        </div>
      </div>
      <div className="border-t border-[#1A293D] px-6 py-4 text-center text-[11px] text-dim">
        AZIMARA RELAY is a working product name; trademark clearance is pending. Routing does not guarantee anonymity and the interface makes no regulatory-compliance claims. Digital assets involve risk.
      </div>
    </footer>
  )
}

function Hero({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="relay-radial border-b border-[#1A293D]">
      <div className="relay-grid-bg">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <Badge variant="outline" className="border-[#35D6C0]/40 bg-[#35D6C0]/10 text-[#35D6C0]">{eyebrow}</Badge>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-secondary sm:text-base">{sub}</p>
        </div>
      </div>
    </div>
  )
}

function FeatureGrid({ items }: { items: { icon: React.ReactNode; title: string; body: string }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((f) => (
        <Card key={f.title} className="border-[#26374C] bg-[#0E1725] p-5 transition-colors duration-150 hover:bg-[#142135]">
          <div className="text-[#35D6C0]">{f.icon}</div>
          <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-dim">{f.body}</p>
        </Card>
      ))}
    </div>
  )
}

function Cta({ title, sub, primary, secondary }: { title: string; sub: string; primary: string; secondary: string }) {
  const { navigate } = useRouter()
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-secondary">{sub}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => navigate('/register')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">{primary}</Button>
        <Button variant="outline" onClick={() => navigate('/contact')} className="border-[#26374C] text-secondary hover:text-foreground">{secondary}</Button>
      </div>
    </div>
  )
}

function Page({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#080D17]">
      <PublicHeader current={path.replace('/', '')} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}

// ─── Home ───────────────────────────────────────────────────────────────────

function Home() {
  const { navigate } = useRouter()
  return (
    <Page path="/">
      <Hero
        eyebrow="Non-custodial · Solana · MultiHopper"
        title="Move money through software. Keep control over authorization. Make every payment accountable."
        sub="AZIMARA RELAY is a financial operations platform for businesses: recurring payments, vendor distributions, contractor payouts, treasury movements and multi-recipient settlements from one secure application."
      />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <FeatureGrid
          items={[
            { icon: <Wallet className="h-6 w-6" />, title: 'Your keys, your treasury', body: 'Connect existing Solana wallets. No seed phrases, no private keys, no omnibus custody — funds never sit in an AZIMARA-controlled wallet.' },
            { icon: <Workflow className="h-6 w-6" />, title: 'Approvals that bind payloads', body: 'Configurable policy engine: thresholds, maker-checker separation, new-recipient review. Approvals hash the exact payment and die when material fields change.' },
            { icon: <Blocks className="h-6 w-6" />, title: 'Programmable routing', body: 'MultiHopper-powered transfers with the documented lifecycle: estimate, create, prepare, sign, broadcast in order, confirm, settle, reconcile.' },
            { icon: <BrainCircuit className="h-6 w-6" />, title: 'Relay Intelligence', body: 'AI assistant that prepares batches, detects duplicates and explains failures — with deterministic math, evidence references, and zero signing authority.' },
            { icon: <FileCheck2 className="h-6 w-6" />, title: 'Reconciliation built in', body: 'Every completed payment traces to provider evidence and onchain signatures. Ledger entries, settlement records, CSV exports.' },
            { icon: <Shield className="h-6 w-6" />, title: 'Enterprise controls', body: 'Organization RBAC enforced server-side, MFA, immutable audit trail, HMAC-verified webhooks, idempotent payment creation.' },
          ]}
        />
      </section>
      <section className="border-y border-[#1A293D] bg-[#0B1220]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          {[
            ['The problem', 'Wallets, spreadsheets, chat approvals and block explorers create duplicate payments, invalid addresses, missing approvals and manual reconciliation.'],
            ['The workflow', 'Register recipients → build or import obligations → policy review → wallet authorization → monitored settlement → reconciled records.'],
            ['The promise', 'A finance operator can connect a wallet, pay approved recipients and export verifiable records — without ever surrendering custody.'],
            ['The standard', 'Built as commercial infrastructure: failure recovery, auditability, entitlements and deployment hygiene from day one.'],
          ].map(([t, b]) => (
            <div key={t}>
              <div className="text-sm font-semibold text-[#35D6C0]">{t}</div>
              <p className="mt-2 text-xs leading-relaxed text-dim">{b}</p>
            </div>
          ))}
        </div>
      </section>
      <Cta
        title="Run your onchain payment operations like a financial institution"
        sub="Set up a workspace, connect a wallet, register recipients and put your first approved batch through the full lifecycle."
        primary="Create your workspace"
        secondary="Talk to us"
      />
    </Page>
  )
}

// ─── Product / Treasury / Payouts / Intelligence ────────────────────────────

function ProductPage() {
  return (
    <Page path="/product">
      <Hero eyebrow="Product overview" title="One application for the entire payment operation" sub="From obligation to verified settlement, every step is modeled, authorized and auditable." />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['Organization & onboarding', 'Multi-user workspaces, role-based permissions, invitations, guided setup checklist, business verification hooks.'],
            ['Wallet management', 'Connect supported wallets, verify ownership with message signatures, monitor SOL operational balances, discover supported tokens, track every change.'],
            ['Recipient directory', 'Address-book management with validation, duplicate detection, groups, CSV import/export, and address-change controls that invalidate stale approvals.'],
            ['Payment management', 'One-off payments, multi-recipient batches, schedules, recurring instructions, invoice-linked requests and API-generated payments.'],
            ['Approval engine', 'Thresholds, multiple independent approvers, expiring approvals, revocation, policy versioning. Deterministic evaluation in code.'],
            ['MultiHopper integration', 'Environment-isolated adapter (devnet/mainnet), quote → create → prepare → broadcast → confirm lifecycle, idempotent by design.'],
            ['Relay Intelligence', 'Natural-language operations with structured proposals, deterministic validation, evidence references and human approval handoff.'],
            ['Reconciliation & reporting', 'Provider sync, chain evidence, ledger entries, fee records, settlement records, exportable financial reports.'],
          ].map(([t, b]) => (
            <Card key={t} className="border-[#26374C] bg-[#0E1725] p-5">
              <h3 className="text-sm font-semibold text-[#35D6C0]">{t}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-dim">{b}</p>
            </Card>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-[#35D6C0]/30 bg-[#35D6C0]/5 p-5 text-sm text-secondary">
          <span className="font-semibold text-[#35D6C0]">Non-custodial by construction:</span> no customer seed phrases or private keys are ever requested or stored; wallet connection is not transfer authorization; AI output is never payment permission.
        </div>
      </section>
      <Cta title="See the full lifecycle in your own workspace" sub="The free workspace includes the complete payment pipeline with plan-based limits." primary="Start now" secondary="Contact sales" />
    </Page>
  )
}

function TreasuryPage() {
  return (
    <Page path="/treasury">
      <Hero eyebrow="Treasury operations" title="Institutional visibility over every treasury movement" sub="Balances, obligations, approvals, processing transfers and expenditure — data-rich but uncluttered." />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <FeatureGrid
          items={[
            { icon: <Landmark className="h-6 w-6" />, title: 'Treasury overview', body: 'Available balances from verified wallets, active obligations, pending approvals, transfers in flight, monthly volume, failures and recent activity.' },
            { icon: <Banknote className="h-6 w-6" />, title: 'Expenditure analytics', body: 'Payment volume over time, asset distribution, fee breakdowns, settlement durations and category analytics from real records only.' },
            { icon: <Wallet className="h-6 w-6" />, title: 'Operational SOL monitoring', body: 'Keeper funding and transaction costs need SOL. Relay monitors operational balances so payments do not stall silently.' },
            { icon: <Webhook className="h-6 w-6" />, title: 'Settlement monitoring', body: 'Webhook events are hints, not truth — scheduled reconciliation jobs verify provider status and onchain evidence before anything is marked complete.' },
          ]}
        />
        <p className="mt-8 text-xs text-dim">Never treat a transfer&apos;s intermediate hops as business payment volume. Relay counts payments, not hops.</p>
      </section>
      <Cta title="Know where every unit of treasury is going" sub="Treasury operations ship with every plan." primary="Open a workspace" secondary="Request a walkthrough" />
    </Page>
  )
}

function PayoutsPage() {
  return (
    <Page path="/payouts">
      <Hero eyebrow="Batch payments" title="Pay twenty or two thousand recipients — with per-item accountability" sub="A dedicated batch builder with CSV import, per-row validation, exact-integer allocation math, duplicate warnings and error isolation." />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['Import & validate', 'CSV or manual entry. Wallet validation, duplicate detection, allocation totals and fee estimation before anything is submitted.'],
            ['Approval aware', 'Batches follow the same policy engine: thresholds, independent approvers, expiring approvals — with the exact payload frozen at approval time.'],
            ['Independently tracked routes', 'Provider capability limits are configuration: a transfer reference supports up to 20 destinations, so larger batches split into multiple independently tracked routes.'],
            ['Per-item outcomes', 'Error isolation means one failed payout never hides another. Every item carries its own payment record, signature history and settlement state.'],
          ].map(([t, b]) => (
            <Card key={t} className="border-[#26374C] bg-[#0E1725] p-5">
              <h3 className="text-sm font-semibold text-[#35D6C0]">{t}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-dim">{b}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-[#26374C] bg-[#0E1725] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-dim">CSV format</div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-[#080D17] p-3 font-mono text-xs text-[#35D6C0]">name,address,amount
Acme Contributions,9xQeWvG816bUx9EPjHmaTprYpRxpVkYnTdC8kP7d2wTE,1250.50
Lab Services LLC,4Nd1mBQtrMJVYVfKf2PJy9NZBCZd2ZQhRZk3Z5nL6dWx,892.25</pre>
          <p className="mt-2 text-xs text-dim">Amounts are parsed as exact decimals in the token&apos;s base units — never floating point.</p>
        </div>
      </section>
      <Cta title="Ship your next distribution with receipts" sub="Batch payouts are the platform's core differentiator." primary="Try the batch builder" secondary="Talk to us" />
    </Page>
  )
}

function IntelligencePage() {
  return (
    <Page path="/intelligence">
      <Hero eyebrow="Relay Intelligence" title="An AI assistant with no signing authority and no custody" sub="Prepare approved contributor payments, flag duplicates, explain fees and failures — every proposal carries evidence and requires explicit human approval." />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Card className="mx-auto max-w-3xl border-[#A18BEB]/30 bg-[#0E1725] p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#A18BEB]">Example request</div>
          <p className="mt-2 font-mono text-sm text-secondary">“Prepare the approved contributor payments for this month, flag duplicate recipients and leave the required operating reserve untouched.”</p>
          <div className="mt-4 space-y-2 text-xs text-dim">
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#36C995]" /> Reads only your authorized records, summarized deterministically.</div>
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#36C995]" /> Proposes a batch; amounts recalculated in exact base units by code, never by the model.</div>
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#36C995]" /> Validates against your approval policy before anything reaches the approval queue.</div>
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#36C995]" /> Cannot sign, cannot approve, cannot bypass policy. Accept a proposal and it becomes normal payments — approvals still apply.</div>
          </div>
        </Card>
        <div className="mt-10">
          <FeatureGrid
            items={[
              { icon: <BrainCircuit className="h-6 w-6" />, title: 'Context-aware analysis', body: 'Treasury summaries, expenditure analysis, duplicate detection, anomaly assistance and natural-language reporting over your workspace data.' },
              { icon: <FileCheck2 className="h-6 w-6" />, title: 'Invoice extraction', body: 'Paste invoice text; extracted fields are clearly labeled suggestions and recalculated deterministically when you create payments.' },
              { icon: <Shield className="h-6 w-6" />, title: 'Prompt-injection defenses', body: 'Documents and records are treated as untrusted data. Instruction-like content inside context is refused and reported.' },
              { icon: <Workflow className="h-6 w-6" />, title: 'Approval handoff', body: 'Proposals convert into real payments through the standard pipeline — validation, policy evaluation and human sign-off included.' },
            ]}
          />
        </div>
      </section>
      <Cta title="Delegate the busywork, keep the authority" sub="Relay Intelligence is included with plan-based usage limits." primary="Start now" secondary="Contact us" />
    </Page>
  )
}

// ─── Integrations / Developers ──────────────────────────────────────────────

function IntegrationsPage() {
  return (
    <Page path="/integrations">
      <Hero eyebrow="Integrations" title="Built for the Solana operations stack" sub="Environment-isolated provider credentials, HMAC-verified webhooks, scoped API keys and real RPC connectivity." />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <FeatureGrid
          items={[
            { icon: <Blocks className="h-6 w-6" />, title: 'MultiHopper', body: 'Devnet (mh_test_) and production (mh_live_) environments are never interchangeable. The adapter implements estimate, create, prepare, confirm-broadcast, status and webhooks.' },
            { icon: <Wallet className="h-6 w-6" />, title: 'Solana wallets', body: 'Phantom and injected wallet adapters plus a read-only mode. Ownership verified with ed25519 message signatures; balances via public RPC.' },
            { icon: <KeyRound className="h-6 w-6" />, title: 'Developer API', body: 'Scoped API keys (rk_test_/rk_live_) with per-key rate limits, access logs and an OpenAPI specification for your own tooling.' },
            { icon: <Webhook className="h-6 w-6" />, title: 'Webhooks', body: 'HMAC-SHA256 signatures verified against the raw body with timing-safe comparison; every delivery persisted before processing; reconciliation jobs as the authoritative fallback.' },
          ]}
        />
        <div className="mt-8 rounded-xl border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-4 text-xs text-[#F2BB62]">
          Launch gate: meaningful mainnet balances require current provider audit reports, program deployment information, vulnerability-disclosure arrangements and recovery documentation. Until then Relay supports devnet end-to-end and production configuration is credential-gated.
        </div>
      </section>
      <Cta title="Wire Relay into your operations" sub="Configure the provider connection from Settings → Integrations after signup." primary="Create workspace" secondary="Contact engineering" />
    </Page>
  )
}

function DevelopersPage() {
  const { navigate } = useRouter()
  return (
    <Page path="/developers">
      <Hero eyebrow="API" title="A documented, versioned API for your own tooling" sub="Session-scoped application endpoints plus key-scoped developer endpoints, both speaking the same error envelope." />
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-[#26374C] bg-[#0E1725] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4 text-[#35D6C0]" /> Application API</div>
            <p className="mt-2 text-xs text-dim">Cookie-session authenticated. Organization context via the <code className="font-mono text-[#35D6C0]">X-Organization-Id</code> header. RBAC enforced server-side.</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-[#080D17] p-3 font-mono text-[11px] leading-relaxed text-[#A0AEC0]">GET /api/payments?status=PENDING_APPROVAL
POST /api/payments
POST /api/payments/:id/quote
POST /api/payments/:id/approve
POST /api/batches/preview</pre>
          </Card>
          <Card className="border-[#26374C] bg-[#0E1725] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-[#658CFF]" /> Developer API (v1)</div>
            <p className="mt-2 text-xs text-dim">API keys with explicit scopes: <code className="font-mono text-[#658CFF]">payments:read</code>, <code className="font-mono text-[#658CFF]">payments:create</code>, <code className="font-mono text-[#658CFF]">recipients:read</code>, <code className="font-mono text-[#658CFF]">recipients:create</code>.</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-[#080D17] p-3 font-mono text-[11px] leading-relaxed text-[#A0AEC0]">curl -H &quot;Authorization: Bearer rk_test_…&quot; \\
  /api/v1/recipients</pre>
          </Card>
        </div>
        <Card className="mt-4 border-[#26374C] bg-[#0E1725] p-5">
          <div className="text-sm font-semibold">Error envelope</div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-[#080D17] p-3 font-mono text-[11px] text-[#A0AEC0]">{`{
  "error": {
    "code": "PAYMENT_VALIDATION_FAILED",
    "message": "The payment could not be validated.",
    "requestId": "…",
    "details": []
  }
}`}</pre>
          <p className="mt-2 text-xs text-dim">The full OpenAPI specification is served from <code className="font-mono text-[#35D6C0]">/api/openapi</code>. All requests are rate-limited and logged.</p>
        </Card>
        <div className="mt-6 text-center">
          <Button onClick={() => navigate('/register')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">Get API keys</Button>
        </div>
      </section>
    </Page>
  )
}

// ─── Security ───────────────────────────────────────────────────────────────

function SecurityPage() {
  return (
    <Page path="/security">
      <Hero eyebrow="Security & trust" title="Non-custodial, auditable, and honest about risk" sub="Relay is engineered so that no single failure — or compromise — can move customer funds without wallet-level authorization." />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <FeatureGrid
          items={[
            { icon: <Lock className="h-6 w-6" />, title: 'Custody boundaries', body: 'Seed phrases and private keys are never requested or stored. Funds are never pooled. Wallet connection alone authorizes nothing.' },
            { icon: <Shield className="h-6 w-6" />, title: 'Application controls', body: 'Server-side RBAC on every operation, MFA (TOTP), session hardening, rate limiting, tenant isolation, immutable audit events.' },
            { icon: <FileCheck2 className="h-6 w-6" />, title: 'Financial integrity', body: 'Exact integer base units, payload-hash-bound approvals, idempotent transfer creation, reconciliation before uncertain transitions.' },
            { icon: <Webhook className="h-6 w-6" />, title: 'Integration security', body: 'Timing-safe webhook signature verification, encrypted provider credentials, secrets never logged, scoped API credentials.' },
          ]}
        />
        <div className="mt-8 space-y-3 text-xs leading-relaxed text-dim">
          <p><span className="font-semibold text-[#F2BB62]">Risk disclosures:</span> Routing does not guarantee anonymity or regulatory clearance; public-chain traceability remains. The interface makes no sanctions or legal-immunity claims. Digital assets are volatile and involve risk of loss.</p>
          <p><span className="font-semibold text-[#F2BB62]">Protocol dependency:</span> Payment routing depends on MultiHopper smart contracts. Published provider security documentation has advised caution until audit reports are available; Relay gates mainnet support on current audit and recovery documentation. Relay never claims a third-party protocol is audited when it is not.</p>
          <p><span className="font-semibold text-[#F2BB62]">Reporting:</span> Security issues can be reported through the contact page; we ask for responsible disclosure and will acknowledge receipt.</p>
        </div>
      </section>
      <Cta title="Security questions?" sub="We publish our boundaries plainly and prefer over-disclosure." primary="Contact the team" secondary="Review the product" />
    </Page>
  )
}

// ─── Pricing ────────────────────────────────────────────────────────────────

const PLANS = [
  { id: 'STARTER', price: '$49', name: 'Starter', desc: 'Small teams starting structured onchain payouts.', seats: '3 seats', items: ['100 payments / month', 'Batches up to 20 items', '2 treasury wallets', 'Email + audit trail', 'Relay Intelligence (200 req/mo)'] },
  { id: 'GROWTH', price: '$199', name: 'Growth', desc: 'Growing businesses with recurring distributions.', seats: '10 seats', items: ['1,000 payments / month', 'Batches up to 100 items', '10 treasury wallets', 'Multi-approver policies', 'Developer API access', 'Relay Intelligence (2k req/mo)'], featured: true },
  { id: 'BUSINESS', price: '$499', name: 'Business', desc: 'Finance teams running full payment operations.', seats: '25 seats', items: ['10,000 payments / month', 'Batches up to 250 items', '25 treasury wallets', 'API keys + access logs', 'Financial exports', 'Relay Intelligence (10k req/mo)'] },
  { id: 'ENTERPRISE', price: 'Custom', name: 'Enterprise', desc: 'Protocols, agencies and agentic platforms.', seats: '100 seats', items: ['Custom limits', 'Priority support', 'Custom policy review', 'Deployment assistance', 'Security review collaboration'] },
]

function PricingPage() {
  const { navigate } = useRouter()
  return (
    <Page path="/pricing">
      <Hero eyebrow="Pricing" title="Plans that match how businesses actually pay" sub="Subscriptions include the full payment pipeline. Limits scale with the plan; every plan is non-custodial." />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <Card key={p.id} className={`relative border p-5 ${p.featured ? 'border-[#35D6C0]/50 bg-[#0E1725]' : 'border-[#26374C] bg-[#0E1725]'}`}>
              {p.featured ? <Badge className="absolute -top-2.5 right-4 border-0 bg-[#35D6C0] text-[#062A26]">Most popular</Badge> : null}
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                {p.price}<span className="text-sm font-normal text-dim">{p.price !== 'Custom' ? '/mo' : ''}</span>
              </div>
              <div className="mt-1 text-xs text-dim">{p.seats} · {p.desc}</div>
              <ul className="mt-4 space-y-1.5">
                {p.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-secondary">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#36C995]" /> {i}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => navigate('/register')}
                variant={p.featured ? 'default' : 'outline'}
                className={`mt-5 w-full ${p.featured ? 'bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90' : 'border-[#26374C]'}`}
              >
                {p.price === 'Custom' ? 'Talk to us' : 'Start with ' + p.name}
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-dim">
          Prices are proposed pricing experiments, not established market rates. Payment collection is not active until a billing provider is configured and commercial terms are approved.
        </p>
      </section>
    </Page>
  )
}

// ─── Company / Contact / Legal ──────────────────────────────────────────────

function CompanyPage() {
  return (
    <Page path="/company">
      <Hero eyebrow="AI Azimara" title="The company behind AZIMARA RELAY" sub="AI Azimara builds financial operations infrastructure that treats accountability as a product feature, not an afterthought." />
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 text-sm leading-relaxed text-secondary">
        <p>
          AI Azimara&apos;s first commercial product is AZIMARA RELAY: non-custodial treasury operations, payment orchestration and programmable onchain payouts for businesses operating on Solana. The product is designed to stand on its own commercial merits — subscription software that businesses pay for because it makes their payment operations safer and faster.
        </p>
        <p className="mt-4">
          The AZIMARA RELAY name is a working title; the parent-brand direction requires trademark clearance before commercial launch. We build in public about our engineering standards, publish our risk boundaries plainly, and hold ourselves to the same approval discipline we sell.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[['Accountability', 'Every payment operation is attributable, reviewable and reconcilable.'], ['Custody discipline', 'We never hold customer funds and never want to.'], ['Honesty', 'Unverified functionality is reported as unverified.']].map(([t, b]) => (
            <Card key={t} className="border-[#26374C] bg-[#0E1725] p-4">
              <div className="text-sm font-semibold text-[#35D6C0]">{t}</div>
              <p className="mt-1 text-xs text-dim">{b}</p>
            </Card>
          ))}
        </div>
      </section>
      <Cta title="Work with us" sub="Partnerships, integrations and enterprise deployments." primary="Contact" secondary="See pricing" />
    </Page>
  )
}

function ContactPage() {
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' })
  return (
    <Page path="/contact">
      <Hero eyebrow="Contact" title="Talk to the AZIMARA RELAY team" sub="Sales, integrations, security disclosure and enterprise deployments." />
      <section className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        {sent ? (
          <Card className="border-[#36C995]/40 bg-[#36C995]/5 p-6 text-center text-sm">
            <Check className="mx-auto h-8 w-8 text-[#36C995]" />
            <div className="mt-3 font-medium">Message recorded</div>
            <p className="mt-1 text-xs text-dim">Thank you — the team reviews requests in order and will respond by email. (Note: an email delivery provider is not configured in this environment; in production this form writes to the sales pipeline.)</p>
          </Card>
        ) : (
          <Card className="border-[#26374C] bg-[#0E1725] p-6">
            <div className="space-y-3">
              <Input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-[#26374C] bg-[#0B1220]" />
              <Input placeholder="Work email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border-[#26374C] bg-[#0B1220]" />
              <Input placeholder="Company / organization" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="border-[#26374C] bg-[#0B1220]" />
              <Textarea placeholder="What are you trying to solve?" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="border-[#26374C] bg-[#0B1220]" />
              <Button
                onClick={() => {
                  if (!form.name || !form.email || !form.message) {
                    toast.error('Name, email and message are required')
                    return
                  }
                  setSent(true)
                }}
                className="w-full bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90"
              >
                <Send className="mr-2 h-4 w-4" /> Send message
              </Button>
              <p className="text-center text-[11px] text-dim">For security disclosures, mark the subject line accordingly and we will acknowledge within one business day.</p>
            </div>
          </Card>
        )}
      </section>
    </Page>
  )
}

function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const privacy = kind === 'privacy'
  return (
    <Page path={`/legal/${kind}`}>
      <Hero eyebrow="Legal" title={privacy ? 'Privacy policy' : 'Terms of service'} sub={privacy ? 'What AZIMARA RELAY collects, stores and never stores.' : 'The agreement governing use of the AZIMARA RELAY platform.'} />
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 text-sm leading-relaxed text-secondary">
        {privacy ? (
          <>
            <h2 className="mt-8 text-base font-semibold text-foreground">Data we process</h2>
            <p className="mt-2">We process account identifiers (name, email), organization settings, recipient records you create, payment metadata, and security telemetry (audit events, IP addresses on security-relevant actions) to operate the service.</p>
            <h2 className="mt-8 text-base font-semibold text-foreground">Data we never collect</h2>
            <p className="mt-2">Seed phrases and private keys. AZIMARA RELAY is non-custodial: wallet authorization happens in your own wallet. Provider credentials are stored encrypted and never logged.</p>
            <h2 className="mt-8 text-base font-semibold text-foreground">Third parties</h2>
            <p className="mt-2">Payment routing metadata is shared with the routing provider necessary to execute transfers you authorize. Solana transactions are public by nature. We publish subprocessor changes before they take effect.</p>
            <h2 className="mt-8 text-base font-semibold text-foreground">Retention</h2>
            <p className="mt-2">Financial records, audit events and ledger entries are retained for the retention period required by applicable law and our reconciliation obligations. Account data can be deleted on request subject to those obligations.</p>
            <p className="mt-8 text-xs text-dim">This template requires review by qualified counsel before production use; it is infrastructure, not legal advice.</p>
          </>
        ) : (
          <>
            <h2 className="mt-8 text-base font-semibold text-foreground">1. Service</h2>
            <p className="mt-2">AZIMARA RELAY provides non-custodial treasury operations and payment orchestration software. We never take custody of customer funds; transfers are authorized by your own wallets.</p>
            <h2 className="mt-8 text-base font-semibold text-foreground">2. Customer responsibilities</h2>
            <p className="mt-2">You are responsible for recipient records, approval policies, the jurisdictional legality of your payments, and your own regulatory obligations. You must not use the service to evade sanctions or law.</p>
            <h2 className="mt-8 text-base font-semibold text-foreground">3. Risks</h2>
            <p className="mt-2">Digital assets are volatile. Routing depends on third-party protocols and infrastructure whose availability and security are outside our control. Routing does not provide anonymity or remove public-chain traceability.</p>
            <h2 className="mt-8 text-base font-semibold text-foreground">4. Availability and support</h2>
            <p className="mt-2">We target high availability but provide the service as-is during early access. Plan limits apply; enterprise agreements may vary terms.</p>
            <h2 className="mt-8 text-base font-semibold text-foreground">5. Liability</h2>
            <p className="mt-2">To the maximum extent permitted by law, our aggregate liability is limited to fees paid in the preceding twelve months. Nothing in these terms limits liability that cannot be limited by law.</p>
            <p className="mt-8 text-xs text-dim">These terms are a working draft and require review by qualified counsel before production use.</p>
          </>
        )}
      </section>
    </Page>
  )
}

export function PublicSite() {
  const { path } = useRouter()
  switch (path) {
    case '/product': return <ProductPage />
    case '/treasury': return <TreasuryPage />
    case '/payouts': return <PayoutsPage />
    case '/intelligence': return <IntelligencePage />
    case '/integrations': return <IntegrationsPage />
    case '/developers': return <DevelopersPage />
    case '/security': return <SecurityPage />
    case '/pricing': return <PricingPage />
    case '/company': return <CompanyPage />
    case '/contact': return <ContactPage />
    case '/legal/privacy': return <LegalPage kind="privacy" />
    case '/legal/terms': return <LegalPage kind="terms" />
    default: return <Home />
  }
}

export { Logo, Footer as PublicFooter }
