'use client'

// Per-route SEO for the single-page deployment. The environment exposes one
// server route, so crawlers get the full default metadata + JSON-LD from the
// server layout; this module keeps document.title, meta description, canonical,
// Open Graph / Twitter tags and BreadcrumbList JSON-LD in sync as users move
// between views. Public routes get full metadata; app routes are noindexed.

import { useEffect } from 'react'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_LOCALE } from '@/lib/site'

export type RouteSeo = {
  title: string
  description: string
  /** JSON-LD @type list injected for this route (FAQPage handled separately). */
  crumbs?: string[]
}

// Public marketing routes — title pattern: "<Route> · AZIMARA RELAY".
// Descriptions are written as direct, extractable answers (AEO/GEO practice).
export const PUBLIC_SEO: Record<string, RouteSeo> = {
  '/': {
    title: 'AZIMARA RELAY — Non-Custodial Treasury & Payment Operations on Solana',
    description:
      'AZIMARA RELAY is a non-custodial financial operations platform for businesses: approval-bound payments, batch payouts, schedules, reconciliation and AI-assisted operations on Solana. Built in Dubai, UAE.',
    crumbs: [],
  },
  '/product': {
    title: 'Product — One Application for the Entire Payment Operation',
    description:
      'AZIMARA RELAY models every step of an onchain payment: organization and RBAC, verified wallets, recipient directory, approval engine, MultiHopper routing, Relay Intelligence and reconciliation.',
    crumbs: ['Product'],
  },
  '/treasury': {
    title: 'Treasury Operations — Institutional Visibility on Solana',
    description:
      'Balances, obligations, pending approvals, in-flight transfers and expenditure analytics from real records only. AZIMARA RELAY treasury monitoring for businesses in the UAE and worldwide.',
    crumbs: ['Treasury'],
  },
  '/payouts': {
    title: 'Batch Payouts — Pay Twenty or Two Thousand Recipients',
    description:
      'A dedicated batch builder with CSV import, per-row validation, exact-integer allocation math, duplicate warnings and per-item error isolation. Solana batch payments with per-item accountability.',
    crumbs: ['Batch payouts'],
  },
  '/intelligence': {
    title: 'Relay Intelligence — An AI Assistant With No Signing Authority',
    description:
      'Relay Intelligence prepares batches, detects duplicates and explains failures with deterministic math and evidence references. Proposals require explicit human approval; the AI never signs.',
    crumbs: ['Relay Intelligence'],
  },
  '/integrations': {
    title: 'Integrations — Solana Wallets, MultiHopper, API & Webhooks',
    description:
      'Environment-isolated MultiHopper credentials, Phantom and injected wallet connections with ed25519 ownership verification, scoped API keys and HMAC-verified webhooks.',
    crumbs: ['Integrations'],
  },
  '/developers': {
    title: 'Developers — Documented, Versioned REST API',
    description:
      'Session-scoped application endpoints and key-scoped developer API v1 with scoped keys, per-key rate limits, access logs and an OpenAPI specification at /api/openapi.',
    crumbs: ['Developers'],
  },
  '/security': {
    title: 'Security — Non-Custodial, Auditable, Honest About Risk',
    description:
      'Seed phrases and private keys are never requested or stored. Server-side RBAC, MFA, payload-hash-bound approvals, timing-safe webhook verification and immutable audit trails.',
    crumbs: ['Security'],
  },
  '/pricing': {
    title: 'Pricing — Plans for Every Stage of Onchain Operations',
    description:
      'Starter $49/mo, Growth $199/mo, Business $499/mo and custom Enterprise. Every plan is non-custodial and includes the complete payment pipeline.',
    crumbs: ['Pricing'],
  },
  '/company': {
    title: 'AI Azimara — The Company Behind AZIMARA RELAY, Dubai UAE',
    description:
      'AI Azimara builds financial operations infrastructure from Dubai, United Arab Emirates, treating accountability as a product feature. First product: AZIMARA RELAY.',
    crumbs: ['Company'],
  },
  '/contact': {
    title: 'Contact — Sales, Integrations & Security Disclosure',
    description:
      'Talk to the AZIMARA RELAY team in Dubai about sales, integrations, enterprise deployments and responsible security disclosure.',
    crumbs: ['Contact'],
  },
  '/legal/privacy': {
    title: 'Privacy Policy — What We Collect and Never Collect',
    description:
      'AZIMARA RELAY processes account identifiers, organization settings and payment metadata. Seed phrases and private keys are never collected.',
    crumbs: ['Privacy'],
  },
  '/legal/terms': {
    title: 'Terms of Service — AZIMARA RELAY Platform Agreement',
    description:
      'The agreement governing use of the AZIMARA RELAY non-custodial treasury operations platform.',
    crumbs: ['Terms'],
  },
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function upsertJsonLd(id: string, data: unknown) {
  let el = document.getElementById(id) as HTMLScriptElement | null
  if (!el) {
    el = document.createElement('script')
    el.id = id
    el.type = 'application/ld+json'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

function setRouteMeta(seo: { title: string; description: string; crumbs?: string[] }, hashPath: string) {
  const fullTitle = hashPath === '/' ? seo.title : `${seo.title.replace(/^AZIMARA RELAY — /, '')} · ${SITE_NAME}`
  document.title = fullTitle
  upsertMeta('name', 'description', seo.description)
  const url = `${SITE_URL}/#${hashPath === '/' ? '' : hashPath}`
  upsertCanonical(url)
  upsertMeta('property', 'og:title', fullTitle)
  upsertMeta('property', 'og:description', seo.description)
  upsertMeta('property', 'og:url', url)
  upsertMeta('property', 'og:locale', SITE_LOCALE)
  upsertMeta('name', 'twitter:title', fullTitle)
  upsertMeta('name', 'twitter:description', seo.description)
  // BreadcrumbList: crawlers pick up the page hierarchy even inside the SPA.
  const crumbs = seo.crumbs ?? []
  if (crumbs.length > 0) {
    upsertJsonLd('ld-breadcrumbs', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((name, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name,
        item: `${SITE_URL}/#${crumbs.slice(0, i).length > 0 ? crumbs.slice(0, i + 1).join('/').toLowerCase().replace(/\s+/g, '-') : ''}`,
      })).map((item, i) => (i === crumbs.length - 1 ? { '@type': 'ListItem', position: i + 1, name: item.name } : item)),
    })
  }
}

/** Public pages: full metadata sync per route. */
export function useRouteSeo(path: string) {
  useEffect(() => {
    const seo = PUBLIC_SEO[path] ?? PUBLIC_SEO['/']
    setRouteMeta(seo, path)
  }, [path])
}

/** App routes: title only + noindex (authenticated content must not be indexed). */
export function useAppSeo(path: string, label: string) {
  useEffect(() => {
    document.title = `${label} · AZIMARA RELAY`
    upsertMeta('name', 'robots', 'noindex, nofollow')
    // Remove stale public-route breadcrumbs if any.
    document.getElementById('ld-breadcrumbs')?.remove()
  }, [path, label])
}
