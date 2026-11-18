'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSession } from '@/lib/client/store'
import { useRouteSeo } from '@/lib/client/seo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Shield, Landmark, Workflow, BrainCircuit, Blocks, Lock, ArrowRight, Check,
  Wallet, FileCheck2, Webhook, KeyRound, Banknote, ChevronRight, Terminal, Building2, Send,
} from 'lucide-react'
import { Reveal, Tilt3D, MagneticButton, PulseDot } from './motion'
import { LogoGlyph, GlyphShield } from './glyphs'

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
      <LogoGlyph size={size} />
      <span className="text-[15px] font-semibold tracking-tight">
        AZIMARA <span className="text-[#39C6D8]">RELAY</span>
      </span>
    </span>
  )
}

function PublicHeader({ current }: { current: string }) {
  const { navigate } = useRouter()
  const session = useSession()
  return (
    <header className="relay-sticky-safe sticky top-0 z-40 border-b border-[#16273C] bg-[#0A1220]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <button onClick={() => navigate('/')} aria-label="AZIMARA RELAY home" className="shrink-0">
          <Logo />
        </button>
        <nav className="hidden items-center gap-1 xl:flex" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${current === item.path ? 'bg-[#142436] text-[#39C6D8]' : 'text-secondary hover:bg-[#142436] hover:text-foreground'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-2">
          {session.authenticated ? (
            <Button onClick={() => navigate('/app')} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
              Open app <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <>
              {/* Hidden on the tightest phones: the nav strip and register CTA
                  keep the header within 360px. */}
              <Button variant="ghost" onClick={() => navigate('/login')} className="px-2.5 text-xs text-secondary hover:text-foreground sm:px-4 sm:text-sm">Sign in</Button>
              <Button onClick={() => navigate('/register')} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">
                Get started
              </Button>
            </>
          )}
        </div>
      </div>
      {/* Scrollable chip strip: the 9-page top nav only fits at ≥1280px;
          everything smaller (phones + tablets) uses this strip. */}
      <div className="flex gap-1 overflow-x-auto border-t border-[#16273C] px-4 py-2 xl:hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        {NAV.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            aria-current={current === item.path ? 'page' : undefined}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-xs ${current === item.path ? 'bg-[#142436] text-[#39C6D8]' : 'text-secondary'}`}
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
    <footer className="mt-auto border-t border-[#16273C] bg-[#0D1622]">
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
            <button key={p} onClick={() => navigate(p)} className="block py-1 text-xs text-dim hover:text-[#39C6D8]">{l}</button>
          ))}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary">Developers</div>
          {[['/integrations', 'Integrations'], ['/developers', 'API reference'], ['/security', 'Security']].map(([p, l]) => (
            <button key={p} onClick={() => navigate(p)} className="block py-1 text-xs text-dim hover:text-[#39C6D8]">{l}</button>
          ))}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary">Legal & company</div>
          {[['/legal/privacy', 'Privacy'], ['/legal/terms', 'Terms'], ['/company', 'AI Azimara'], ['/contact', 'Contact']].map(([p, l]) => (
            <button key={p} onClick={() => navigate(p)} className="block py-1 text-xs text-dim hover:text-[#39C6D8]">{l}</button>
          ))}
        </div>
      </div>
      <div className="border-t border-[#16273C] px-4 py-4 text-center text-[11px] text-dim sm:px-6">
        {/* GEO: consistent entity + locality signal on every page. */}
        <address className="not-italic">
          AI Azimara · AZIMARA RELAY — Dubai, United Arab Emirates
        </address>
        <p className="mt-1">
          AZIMARA RELAY is a working product name; trademark clearance is pending. Routing does not guarantee anonymity and the interface makes no regulatory-compliance claims. Digital assets involve risk.
        </p>
      </div>
    </footer>
  )
}

function Hero({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="relay-radial relative overflow-hidden border-b border-[#16273C]">
      {/* Ambient aurora wash — breathes between 55% and 100% opacity. */}
      <div className="relay-aurora" aria-hidden />
      <div className="relay-grid-bg">
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          {/* Copy column — staggered entrance choreography. */}
          <div className="text-center lg:text-left">
            <Reveal variant="fade">
              <Badge variant="outline" className="border-[#39C6D8]/40 bg-[#39C6D8]/10 text-[#39C6D8]">
                <PulseDot className="mr-1.5" color="#39C6D8" size={6} /> {eyebrow}
              </Badge>
            </Reveal>
            <Reveal variant="rise" delay={80}>
              <h1 className="relay-gradient-text mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
            </Reveal>
            <Reveal variant="rise" delay={160}>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-secondary sm:text-base lg:mx-0">{sub}</p>
            </Reveal>
          </div>
          {/* 3D scene column — layered perspective composition. */}
          <HeroScene />
        </div>
      </div>
    </div>
  )
}

// Layered 3D hero scene: an orbiting relay ring system around a floating
// payment console, with a payment beam lane beneath. Pure CSS animation
// (opacity/transform) — no canvas, no WebGL, no runtime cost beyond compositing.
function HeroScene() {
  return (
    <div className="relative mx-auto hidden h-[340px] w-full max-w-md select-none lg:block" aria-hidden>
      {/* Perspective container */}
      <div style={{ perspective: '1100px' }} className="absolute inset-0">
        {/* Orbit ring system */}
        <div className="absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2">
          <svg viewBox="0 0 320 320" className="relay-orbit h-full w-full opacity-60">
            <ellipse cx="160" cy="160" rx="150" ry="58" fill="none" stroke="#39C6D8" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2 6" />
          </svg>
          <svg viewBox="0 0 320 320" className="relay-orbit-rev absolute inset-0 h-full w-full opacity-40">
            <ellipse cx="160" cy="160" rx="120" ry="104" fill="none" stroke="#F17FA8" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 9" />
          </svg>
          {/* Nodes riding the orbits */}
          <span className="absolute left-[6%] top-[46%] h-2.5 w-2.5 rounded-full bg-[#39C6D8] shadow-[0_0_12px_rgba(57,198,216,0.9)]" />
          <span className="absolute right-[9%] top-[24%] h-2 w-2 rounded-full bg-[#F17FA8] shadow-[0_0_10px_rgba(241,127,168,0.9)]" />
        </div>
        {/* Floating payment console */}
        <div className="relay-float absolute left-1/2 top-1/2 w-[290px] -translate-x-1/2 -translate-y-1/2" style={{ transform: 'translate(-50%, -50%)' }}>
          <div
            className="relay-glow-border rounded-2xl border border-[#1D2E42] bg-[#101C2C]/90 p-4 shadow-[0_30px_60px_rgba(0,0,0,0.5)] backdrop-blur"
            style={{ transform: 'rotateX(7deg) rotateY(-6deg)', transformStyle: 'preserve-3d' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogoGlyph size={20} />
                <span className="text-[11px] font-semibold tracking-tight">AZIMARA <span className="text-[#39C6D8]">RELAY</span></span>
              </div>
              <span className="rounded-full border border-[#2ED3A6]/30 bg-[#2ED3A6]/10 px-2 py-0.5 text-[9px] font-medium text-[#2ED3A6]">SETTLED</span>
            </div>
            <div className="mt-4 rounded-lg border border-[#16273C] bg-[#0D1622] p-3">
              <div className="flex items-center justify-between text-[10px] text-dim">
                <span>Relay payment · RPY-8841</span>
                <span className="font-mono">USDC</span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <div className="text-xl font-semibold tabular-nums text-[#39C6D8]">24,850.00</div>
                  <div className="mt-0.5 text-[10px] text-dim">Vendor distribution · 12 recipients</div>
                </div>
                <svg width="92" height="30" viewBox="0 0 92 30" fill="none">
                  <path d="M2 24 C 14 22, 18 12, 30 14 S 52 20, 62 12 S 82 4, 90 6" stroke="#39C6D8" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            {/* Approval chain — the maker-checker story in miniature. */}
            <div className="mt-3 flex items-center gap-1.5">
              {['Built', 'Approved ×2', 'Signed', 'Settled'].map((s, i) => (
                <div key={s} className="flex flex-1 items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: i < 3 ? '#2ED3A6' : '#1D2E42', boxShadow: i < 3 ? '0 0 6px rgba(46,211,166,0.8)' : 'none' }}
                  />
                  <span className="text-[9px] text-dim">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Floating satellite tiles */}
        <div className="relay-float-slow absolute left-[2%] top-[12%] rounded-xl border border-[#1D2E42] bg-[#101C2C]/85 px-3 py-2 shadow-lg backdrop-blur" style={{ animationDelay: '0.8s' }}>
          <div className="text-[9px] text-dim">Policy engine</div>
          <div className="mt-0.5 text-[11px] font-semibold text-[#8AA2F0]">2-of-3 approvers</div>
        </div>
        <div className="relay-float-slow absolute bottom-[8%] right-[2%] rounded-xl border border-[#1D2E42] bg-[#101C2C]/85 px-3 py-2 shadow-lg backdrop-blur" style={{ animationDelay: '1.6s' }}>
          <div className="text-[9px] text-dim">Non-custodial</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#2ED3A6]"><GlyphShield size={11} /> Keys stay yours</div>
        </div>
      </div>
    </div>
  )
}

function FeatureGrid({ items }: { items: { icon: React.ReactNode; title: string; body: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {items.map((f, i) => (
        <Reveal key={f.title} variant="rise" delay={(i % 3) * 90} as="div">
          <Tilt3D max={4} glare className="h-full">
            <Card className="h-full border-[#1D2E42] bg-[#101C2C] p-5 transition-colors duration-150 hover:border-[#39C6D8]/25 hover:bg-[#142436]">
              <div className="text-[#39C6D8] drop-shadow-[0_0_10px_rgba(57,198,216,0.4)]">{f.icon}</div>
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-dim">{f.body}</p>
            </Card>
          </Tilt3D>
        </Reveal>
      ))}
    </div>
  )
}

// Trust strip — continuously scrolling capability chips. The track renders
// the sequence twice (aria-hidden duplicate) and translates -50%, giving a
// seamless loop with pure transform animation. Pauses on hover.
const TRUST_ITEMS = [
  'Solana mainnet-beta & devnet isolation',
  'USDC · USDT · SOL settlement',
  'Smart payment routing with environment isolation',
  '23-state payment lifecycle',
  'Maker-checker approval policies',
  'Payload-hash approval binding',
  'HMAC-verified webhooks',
  'TOTP multi-factor authentication',
  'Organization RBAC — 7 roles',
  'Immutable audit trail',
  'AES-256-GCM secrets at rest',
  'CSV reconciliation exports',
]

function TrustMarquee() {
  const chip = (text: string, hidden = false) => (
    <span
      key={`${text}-${hidden ? 'dup' : 'orig'}`}
      aria-hidden={hidden || undefined}
      className="mx-2 inline-flex shrink-0 items-center gap-2 rounded-full border border-[#1D2E42] bg-[#101C2C]/80 px-3.5 py-1.5 text-[11px] text-secondary"
    >
      <PulseDot color="#39C6D8" size={5} />
      {text}
    </span>
  )
  return (
    <div className="relay-marquee border-b border-[#16273C] bg-[#0D1622]/70 py-3" role="presentation">
      <div className="relay-marquee-track">
        {TRUST_ITEMS.map((t) => chip(t))}
        {TRUST_ITEMS.map((t) => chip(t, true))}
      </div>
    </div>
  )
}

function Cta({ title, sub, primary, secondary, primaryTo = '/register', secondaryTo = '/contact' }: { title: string; sub: string; primary: string; secondary: string; primaryTo?: string; secondaryTo?: string }) {
  const { navigate } = useRouter()
  return (
    <div className="relative overflow-hidden">
      <div className="relay-aurora" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <Reveal variant="scale">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-secondary">{sub}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <MagneticButton onClick={() => navigate(primaryTo)} hapticEvent="select" className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#39C6D8] px-4 text-sm font-medium text-[#04121A] shadow-[0_0_24px_rgba(57,198,216,0.3)] transition-colors hover:bg-[#39C6D8]/90">
              {primary} <ArrowRight className="h-4 w-4" />
            </MagneticButton>
            <MagneticButton onClick={() => navigate(secondaryTo)} strength={5} className="inline-flex h-10 items-center justify-center rounded-md border border-[#1D2E42] bg-transparent px-4 text-sm font-medium text-secondary transition-colors hover:text-foreground">
              {secondary}
            </MagneticButton>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

function Page({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0A1220]">
      <PublicHeader current={path.replace('/', '')} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}

// ─── AEO/GEO: FAQ with extractable direct answers ──────────────────────────
// Each question gets a question-form H2 and a concise 40-60 word direct answer
// in the first paragraph — the format answer engines and generative engines
// quote. The identical content is emitted as FAQPage JSON-LD.

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'What is AZIMARA RELAY?',
    a: 'AZIMARA RELAY is a non-custodial financial operations platform for businesses that pay in digital assets on Solana. It combines a recipient directory, approval policies, batch payouts, schedules, reconciliation and AI-assisted operations in one application — customers keep custody of their own funds.',
  },
  {
    q: 'Is AZIMARA RELAY available in the United Arab Emirates?',
    a: 'Yes. AZIMARA RELAY is built and operated by AI Azimara from Dubai, United Arab Emirates, and is designed for UAE and wider GCC businesses. Virtual-asset activity in the UAE is regulated by authorities such as VARA in Dubai and the CBUAE; customers remain responsible for their own regulatory obligations.',
  },
  {
    q: 'What does non-custodial mean?',
    a: 'Non-custodial means AZIMARA RELAY never takes possession of customer funds. Seed phrases and private keys are never requested or stored, wallet connection alone authorizes nothing, and every transfer is executed only after authorization by the customer\u2019s own wallet.',
  },
  {
    q: 'How do payment approvals work?',
    a: 'Approvals are evaluated by a deterministic policy engine: amount thresholds, multiple independent approvers, new-recipient review and role-based rules. An approval binds a cryptographic hash of the exact payment payload, so any material change invalidates the approval automatically.',
  },
  {
    q: 'Which blockchains and tokens are supported?',
    a: 'AZIMARA RELAY operates on Solana, supporting SOL and SPL tokens such as USDC and USDT through an environment-isolated routing layer with a quote, create, prepare, sign, broadcast, confirm, settle and reconcile lifecycle.',
  },
  {
    q: 'Can AI approve or sign payments?',
    a: 'No. Relay Intelligence can prepare batches, flag duplicates and explain failures, but every proposal is validated deterministically in code and requires explicit human approval. The AI has zero signing authority and zero custody.',
  },
  {
    q: 'How much does AZIMARA RELAY cost?',
    a: 'Plans start at $49/month for small teams, $199/month for growing businesses and $499/month for finance teams, with custom enterprise agreements. Every plan includes the complete non-custodial payment pipeline; limits scale with the plan.',
  },
]

function FaqSection() {
  // Emit FAQPage structured data that exactly mirrors the visible content.
  useEffect(() => {
    const el = document.createElement('script')
    el.id = 'ld-faq'
    el.type = 'application/ld+json'
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ_ITEMS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })
    document.head.appendChild(el)
    return () => {
      el.remove()
    }
  }, [])
  return (
    <section className="border-y border-[#16273C] bg-[#0D1622]" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
        <p className="mt-2 text-sm text-secondary">Direct answers about custody, approvals, UAE availability, supported assets and pricing.</p>
        <div className="mt-8 divide-y divide-[#16273C]">
          {FAQ_ITEMS.map((f) => (
            <div key={f.q} className="py-5" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
              <h3 className="text-sm font-semibold" itemProp="name">{f.q}</h3>
              <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                <p className="mt-2 text-xs leading-relaxed text-secondary" itemProp="text">{f.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Home ───────────────────────────────────────────────────────────────────

function Home() {
  const { navigate } = useRouter()
  return (
    <Page path="/">
      <Hero
        eyebrow="Non-custodial · Solana mainnet-beta"
        title="Move money through software. Keep control over authorization. Make every payment accountable."
        sub="AZIMARA RELAY is a financial operations platform for businesses: recurring payments, vendor distributions, contractor payouts, treasury movements and multi-recipient settlements from one secure application."
      />
      <TrustMarquee />
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <FeatureGrid
          items={[
            { icon: <Wallet className="h-6 w-6" />, title: 'Your keys, your treasury', body: 'Connect existing Solana wallets. No seed phrases, no private keys, no omnibus custody — funds never sit in an AZIMARA-controlled wallet.' },
            { icon: <Workflow className="h-6 w-6" />, title: 'Approvals that bind payloads', body: 'Configurable policy engine: thresholds, maker-checker separation, new-recipient review. Approvals hash the exact payment and die when material fields change.' },
            { icon: <Blocks className="h-6 w-6" />, title: 'Programmable routing', body: 'Direct SOL and SPL transfers through an environment-isolated routing layer: estimate, create, prepare, sign, broadcast in order, confirm, settle, reconcile.' },
            { icon: <BrainCircuit className="h-6 w-6" />, title: 'Relay Intelligence', body: 'AI assistant that prepares batches, detects duplicates and explains failures — with deterministic math, evidence references, and zero signing authority.' },
            { icon: <FileCheck2 className="h-6 w-6" />, title: 'Reconciliation built in', body: 'Every completed payment traces to provider evidence and onchain signatures. Ledger entries, settlement records, CSV exports.' },
            { icon: <Shield className="h-6 w-6" />, title: 'Enterprise controls', body: 'Organization RBAC enforced server-side, MFA, immutable audit trail, HMAC-verified webhooks, idempotent payment creation.' },
          ]}
        />
      </section>
      <section className="border-y border-[#16273C] bg-[#0D1622]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          {[
            ['The problem', 'Wallets, spreadsheets, chat approvals and block explorers create duplicate payments, invalid addresses, missing approvals and manual reconciliation.'],
            ['The workflow', 'Register recipients → build or import obligations → policy review → wallet authorization → monitored settlement → reconciled records.'],
            ['The promise', 'A finance operator can connect a wallet, pay approved recipients and export verifiable records — without ever surrendering custody.'],
            ['The standard', 'Built as commercial infrastructure: failure recovery, auditability, entitlements and deployment hygiene from day one.'],
          ].map(([t, b]) => (
            <div key={t}>
              <div className="text-sm font-semibold text-[#39C6D8]">{t}</div>
              <p className="mt-2 text-xs leading-relaxed text-dim">{b}</p>
            </div>
          ))}
        </div>
      </section>
      <FaqSection />
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            ['Organization & onboarding', 'Multi-user workspaces, role-based permissions, invitations, guided setup checklist, business verification hooks.'],
            ['Wallet management', 'Connect supported wallets, verify ownership with message signatures, monitor SOL operational balances, discover supported tokens, track every change.'],
            ['Recipient directory', 'Address-book management with validation, duplicate detection, groups, CSV import/export, and address-change controls that invalidate stale approvals.'],
            ['Payment management', 'One-off payments, multi-recipient batches, schedules, recurring instructions, invoice-linked requests and API-generated payments.'],
            ['Approval engine', 'Thresholds, multiple independent approvers, expiring approvals, revocation, policy versioning. Deterministic evaluation in code.'],
            ['Payment routing', 'Environment-isolated routing adapter (devnet/production), quote → create → prepare → broadcast → confirm lifecycle, idempotent by design.'],
            ['Relay Intelligence', 'Natural-language operations with structured proposals, deterministic validation, evidence references and human approval handoff.'],
            ['Reconciliation & reporting', 'Provider sync, chain evidence, ledger entries, fee records, settlement records, exportable financial reports.'],
          ].map(([t, b]) => (
            <Card key={t} className="border-[#1D2E42] bg-[#101C2C] p-5">
              <h3 className="text-sm font-semibold text-[#39C6D8]">{t}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-dim">{b}</p>
            </Card>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-[#39C6D8]/30 bg-[#39C6D8]/5 p-5 text-sm text-secondary">
          <span className="font-semibold text-[#39C6D8]">Non-custodial by construction:</span> no customer seed phrases or private keys are ever requested or stored; wallet connection is not transfer authorization; AI output is never payment permission.
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            ['Import & validate', 'CSV or manual entry. Wallet validation, duplicate detection, allocation totals and fee estimation before anything is submitted.'],
            ['Approval aware', 'Batches follow the same policy engine: thresholds, independent approvers, expiring approvals — with the exact payload frozen at approval time.'],
            ['Independently tracked routes', 'Provider capability limits are configuration: a transfer reference supports up to 20 destinations, so larger batches split into multiple independently tracked routes.'],
            ['Per-item outcomes', 'Error isolation means one failed payout never hides another. Every item carries its own payment record, signature history and settlement state.'],
          ].map(([t, b]) => (
            <Card key={t} className="border-[#1D2E42] bg-[#101C2C] p-5">
              <h3 className="text-sm font-semibold text-[#39C6D8]">{t}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-dim">{b}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-[#1D2E42] bg-[#101C2C] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-dim">CSV format</div>
          <pre className="mt-2 min-w-0 overflow-x-auto rounded-lg bg-[#0A1220] p-3 font-mono text-xs text-[#39C6D8]">name,address,amount
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
        <Card className="mx-auto max-w-3xl border-[#8AA2F0]/30 bg-[#101C2C] p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#8AA2F0]">Example request</div>
          <p className="mt-2 font-mono text-sm text-secondary">“Prepare the approved contributor payments for this month, flag duplicate recipients and leave the required operating reserve untouched.”</p>
          <div className="mt-4 space-y-2 text-xs text-dim">
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2ED3A6]" /> Reads only your authorized records, summarized deterministically.</div>
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2ED3A6]" /> Proposes a batch; amounts recalculated in exact base units by code, never by the model.</div>
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2ED3A6]" /> Validates against your approval policy before anything reaches the approval queue.</div>
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2ED3A6]" /> Cannot sign, cannot approve, cannot bypass policy. Accept a proposal and it becomes normal payments — approvals still apply.</div>
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
            { icon: <Blocks className="h-6 w-6" />, title: 'Payment routing', body: 'Devnet and production routing credentials are never interchangeable. The routing adapter implements estimate, create, prepare, confirm-broadcast, status and webhooks.' },
            { icon: <Wallet className="h-6 w-6" />, title: 'Solana wallets', body: 'Phantom and injected wallet adapters plus a read-only mode. Ownership verified with ed25519 message signatures; balances via public RPC.' },
            { icon: <KeyRound className="h-6 w-6" />, title: 'Developer API', body: 'Scoped API keys (rk_test_/rk_live_) with per-key rate limits, access logs and an OpenAPI specification for your own tooling.' },
            { icon: <Webhook className="h-6 w-6" />, title: 'Webhooks', body: 'HMAC-SHA256 signatures verified against the raw body with timing-safe comparison; every delivery persisted before processing; reconciliation jobs as the authoritative fallback.' },
          ]}
        />
        <div className="mt-8 rounded-xl border border-[#F2BB62]/30 bg-[#F2BB62]/5 p-4 text-xs text-[#F2BB62]">
          Launch posture: subscription collection already settles on Solana mainnet-beta (USDC to the platform treasury, verified on-chain). Third-party payment routing stays credential-gated until current provider audit reports, program deployment information, vulnerability-disclosure arrangements and recovery documentation are in place — nothing is simulated in the meantime.
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="border-[#1D2E42] bg-[#101C2C] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4 text-[#39C6D8]" /> Application API</div>
            <p className="mt-2 text-xs text-dim">Cookie-session authenticated. Organization context via the <code className="font-mono text-[#39C6D8]">X-Organization-Id</code> header. RBAC enforced server-side.</p>
            <pre className="mt-3 min-w-0 overflow-x-auto rounded-lg bg-[#0A1220] p-3 font-mono text-[11px] leading-relaxed text-[#8FA5BC]">GET /api/payments?status=PENDING_APPROVAL
POST /api/payments
POST /api/payments/:id/quote
POST /api/payments/:id/approve
POST /api/batches/preview</pre>
          </Card>
          <Card className="border-[#1D2E42] bg-[#101C2C] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-[#F17FA8]" /> Developer API (v1)</div>
            <p className="mt-2 text-xs text-dim">API keys with explicit scopes: <code className="font-mono text-[#F17FA8]">payments:read</code>, <code className="font-mono text-[#F17FA8]">payments:create</code>, <code className="font-mono text-[#F17FA8]">recipients:read</code>, <code className="font-mono text-[#F17FA8]">recipients:create</code>.</p>
            <pre className="mt-3 min-w-0 overflow-x-auto rounded-lg bg-[#0A1220] p-3 font-mono text-[11px] leading-relaxed text-[#8FA5BC]">curl -H &quot;Authorization: Bearer rk_test_…&quot; \\
  /api/v1/recipients</pre>
          </Card>
        </div>
        <Card className="mt-4 border-[#1D2E42] bg-[#101C2C] p-5">
          <div className="text-sm font-semibold">Error envelope</div>
          <pre className="mt-2 min-w-0 overflow-x-auto rounded-lg bg-[#0A1220] p-3 font-mono text-[11px] text-[#8FA5BC]">{`{
  "error": {
    "code": "PAYMENT_VALIDATION_FAILED",
    "message": "The payment could not be validated.",
    "requestId": "…",
    "details": []
  }
}`}</pre>
          <p className="mt-2 text-xs text-dim">The full OpenAPI specification is served from <code className="font-mono text-[#39C6D8]">/api/openapi</code>. All requests are rate-limited and logged.</p>
        </Card>
        <div className="mt-6 text-center">
          <Button onClick={() => navigate('/register')} className="bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90">Get API keys</Button>
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
          <p><span className="font-semibold text-[#F2BB62]">Protocol dependency:</span> Payment routing depends on third-party routing programs. Published provider security documentation has advised caution until audit reports are available; Relay gates mainnet routing support on current audit and recovery documentation. Relay never claims a third-party protocol is audited when it is not.</p>
          <p><span className="font-semibold text-[#F2BB62]">Reporting:</span> Security issues can be reported through the contact page; we ask for responsible disclosure and will acknowledge receipt.</p>
        </div>
      </section>
      <Cta title="Security questions?" sub="We publish our boundaries plainly and prefer over-disclosure." primary="Contact the team" secondary="Review the product" secondaryTo="/product" />
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <Card key={p.id} className={`relative border p-5 ${p.featured ? 'border-[#39C6D8]/50 bg-[#101C2C]' : 'border-[#1D2E42] bg-[#101C2C]'}`}>
              {p.featured ? <Badge className="absolute -top-2.5 right-4 border-0 bg-[#39C6D8] text-[#04121A]">Most popular</Badge> : null}
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                {p.price}<span className="text-sm font-normal text-dim">{p.price !== 'Custom' ? '/mo' : ''}</span>
              </div>
              <div className="mt-1 text-xs text-dim">{p.seats} · {p.desc}</div>
              <ul className="mt-4 space-y-1.5">
                {p.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-secondary">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2ED3A6]" /> {i}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => navigate(p.price === 'Custom' ? '/contact' : '/register')}
                variant={p.featured ? 'default' : 'outline'}
                className={`mt-5 w-full ${p.featured ? 'bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90' : 'border-[#1D2E42]'}`}
              >
                {p.price === 'Custom' ? 'Talk to us' : 'Start with ' + p.name}
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-dim">
          Plans are billed in USDC on Solana mainnet-beta: upgrades and renewals settle on-chain to the platform treasury and are verified against the real ledger — no card processor involved, and your funds always stay in your custody. Enterprise is priced by contract.
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
        <h2 className="mt-10 text-base font-semibold text-foreground">Where is AI Azimara based?</h2>
        <p className="mt-2">
          AI Azimara operates from Dubai, United Arab Emirates, and builds AZIMARA RELAY for businesses in the UAE, the wider GCC and globally. The UAE has become a leading hub for digital-asset operations: Dubai&apos;s VARA (Virtual Assets Regulatory Authority) and the federal Central Bank of the UAE (CBUAE) set the regulatory framework for virtual-asset activity. AZIMARA RELAY is non-custodial infrastructure software — it never holds customer funds — and customers remain responsible for their own licensing and compliance obligations in their jurisdiction.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[['Accountability', 'Every payment operation is attributable, reviewable and reconcilable.'], ['Custody discipline', 'We never hold customer funds and never want to.'], ['Honesty', 'Unverified functionality is reported as unverified.']].map(([t, b]) => (
            <Card key={t} className="border-[#1D2E42] bg-[#101C2C] p-4">
              <div className="text-sm font-semibold text-[#39C6D8]">{t}</div>
              <p className="mt-1 text-xs text-dim">{b}</p>
            </Card>
          ))}
        </div>
      </section>
      <Cta title="Work with us" sub="Partnerships, integrations and enterprise deployments." primary="Contact" secondary="See pricing" secondaryTo="/pricing" />
    </Page>
  )
}

function ContactPage() {
  const [sent, setSent] = useState<null | { reference: string; inboxNotified: boolean; inboxConfigured: boolean }>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', company: '', topic: 'general', message: '' })
  return (
    <Page path="/contact">
      <Hero eyebrow="Contact" title="Talk to the AZIMARA RELAY team" sub="Sales, integrations, security disclosure and enterprise deployments." />
      <section className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        {sent ? (
          <Card className="border-[#2ED3A6]/40 bg-[#2ED3A6]/5 p-6 text-center text-sm">
            <Check className="mx-auto h-8 w-8 text-[#2ED3A6]" />
            <div className="mt-3 font-medium">Message recorded</div>
            <p className="mt-1 text-xs text-dim">
              Thank you — your message is saved with reference <span className="font-mono text-[10px] text-secondary">{sent.reference}</span>. The team reviews requests in order and will respond by email.
            </p>
            {!sent.inboxNotified ? (
              <p className="mt-2 text-[11px] text-[#F2BB62]">
                {sent.inboxConfigured
                  ? 'The team inbox notification is pending delivery — your message is safely recorded and will be picked up.'
                  : 'An email delivery provider is not configured in this environment — your message is recorded in the request pipeline and reviewed from there.'}
              </p>
            ) : null}
            <Button variant="outline" className="mt-4 border-[#263249]" onClick={() => setSent(null)}>Send another message</Button>
          </Card>
        ) : (
          <Card className="border-[#1D2E42] bg-[#101C2C] p-6">
            <div className="space-y-3">
              <Input placeholder="Your name" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-[#1D2E42] bg-[#0D1622]" />
              <Input placeholder="Work email" type="email" maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border-[#1D2E42] bg-[#0D1622]" />
              <Input placeholder="Company / organization (optional)" maxLength={120} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="border-[#1D2E42] bg-[#0D1622]" />
              <Select value={form.topic} onValueChange={(v) => setForm({ ...form, topic: v })}>
                <SelectTrigger className="border-[#1D2E42] bg-[#0D1622]" aria-label="Topic"><SelectValue /></SelectTrigger>
                <SelectContent className="border-[#1D2E42] bg-[#142436]">
                  <SelectItem value="general">General inquiry</SelectItem>
                  <SelectItem value="sales">Sales &amp; enterprise</SelectItem>
                  <SelectItem value="integrations">Integrations</SelectItem>
                  <SelectItem value="security">Security disclosure</SelectItem>
                  <SelectItem value="support">Product support</SelectItem>
                </SelectContent>
              </Select>
              <Textarea placeholder="What are you trying to solve?" rows={5} maxLength={4000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="border-[#1D2E42] bg-[#0D1622]" />
              <Button
                onClick={async () => {
                  const emailOk = /^\S+@\S+\.\S+$/.test(form.email.trim())
                  if (!form.name.trim() || !emailOk || form.message.trim().length < 10) {
                    toast.error('Name, a valid email and a message of at least 10 characters are required')
                    return
                  }
                  setBusy(true)
                  try {
                    const res = await fetch('/api/contact', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: form.name.trim(),
                        email: form.email.trim(),
                        company: form.company.trim() || undefined,
                        topic: form.topic,
                        message: form.message.trim(),
                      }),
                    })
                    const payload = (await res.json()) as { data?: { reference: string; inboxNotified: boolean; inboxConfigured: boolean }; error?: { message: string } }
                    if (!res.ok) throw new Error(payload.error?.message ?? 'Could not send the message')
                    setSent({ reference: payload.data!.reference, inboxNotified: payload.data!.inboxNotified, inboxConfigured: payload.data!.inboxConfigured })
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Could not send the message')
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
                className="w-full bg-[#39C6D8] font-medium text-[#04121A] hover:bg-[#39C6D8]/90"
              >
                <Send className="mr-2 h-4 w-4" /> {busy ? 'Sending…' : 'Send message'}
              </Button>
              <p className="text-center text-[11px] text-dim">For security disclosures, pick the security topic — we acknowledge within one business day.</p>
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
  // Keep title/description/canonical/OG in sync with the visible route.
  useRouteSeo(path)
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
