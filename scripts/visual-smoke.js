// Visual smoke v2: condition-based waits (dev server compiles routes lazily —
// fixed timeouts are unreliable). Full flow: register → verify → login → org →
// app views → batch dialog; screenshots + overflow checks.
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = 'http://localhost:3000'
const OUT = '/tmp/render'
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const results = []
  async function shot(page, name) {
    await page.screenshot({ path: `${OUT}/${name}.png` })
    results.push(name)
    console.log('shot', name)
  }
  async function waitUrl(page, substr, timeoutMs = 30000) {
    await page.waitForFunction(
      (s) => window.location.hash.includes(s) || window.location.search.includes(s),
      substr,
      { timeout: timeoutMs },
    )
  }
  // Dev-mode hydration can lag networkidle by seconds (fresh Turbopack compiles).
  // React 19 stamps __reactFiber$/__reactProps$ on the body root — wait for it,
  // then double-settle.
  async function waitHydrated(page, timeoutMs = 60000) {
    await page.waitForFunction(
      () => Object.keys(document.body).some((k) => k.startsWith('__reactFiber$')),
      undefined,
      { timeout: timeoutMs },
    ).catch(() => console.log('  (hydration marker not found — proceeding)'))
    await page.waitForTimeout(1500)
  }

  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  // Dev-mode Turbopack hydrates after networkidle settles — give React time
  // to attach handlers before any interaction, then poll for outcomes.
  const settle = (ms = 2200) => page.waitForTimeout(ms)

  // ── Register ──
  const email = `smoke2-${Date.now()}@example.com`
  await page.goto(BASE + '/#/register', { waitUntil: 'networkidle' })
  await waitHydrated(page)
  await page.fill('#name', 'Smoke Tester')
  await page.fill('#email', email)
  await page.fill('#password', 'SmokePass12345')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Create account').click())
  // Wait for the dev verification box (email delivery unconfigured in env)
  await page.waitForSelector('button.font-mono', { timeout: 45000 })
  console.log('registered:', email)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.classList.contains('font-mono')).click())
  await page.waitForFunction(() => document.body.textContent.includes('Email verified'), { timeout: 45000 })
  console.log('email verified')

  // ── Login ──
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' })
  await waitHydrated(page)
  await page.fill('#email', email)
  await page.fill('#password', 'SmokePass12345')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Sign in').click())
  await waitUrl(page, '/app', 45000)
  console.log('logged in, url:', page.url())

  // ── Create org if prompted ──
  await waitHydrated(page)
  const orgInput = await page.$('#org-name')
  if (orgInput) {
    console.log('create-org screen shown')
    await orgInput.fill('Smoke Org Dubai')
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Create organization').click())
    // Wait until the app shell actually renders (mobile: hamburger button is
    // the visible shell signal; aside stays hidden below md).
    await page.waitForSelector('button[aria-label="Open navigation"]', { timeout: 60000, state: 'visible' })
    console.log('org created, app shell mounted')
  }

  // ── App overview (mobile) ──
  await page.waitForTimeout(1200)
  console.log('app url:', page.url())
  await shot(page, 'app-overview-mobile')
  const hamburger = await page.$('button[aria-label="Open navigation"]')
  console.log('mobile hamburger present:', !!hamburger)
  if (hamburger) {
    await hamburger.click()
    await page.waitForTimeout(500)
    await shot(page, 'app-drawer-mobile')
    await page.keyboard.press('Escape')
    await page.evaluate(() => document.querySelector('button[aria-label="Close navigation"]')?.click()).catch(() => {})
    await page.waitForTimeout(300)
  }

  // ── Title per view + noindex ──
  await page.goto(BASE + '/#/app/payments', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const title = await page.title()
  const robotsMeta = await page.evaluate(() => document.querySelector('meta[name="robots"]')?.content ?? null)
  console.log('app title:', title, '| robots:', robotsMeta)
  await shot(page, 'app-payments-mobile')

  // ── Tablet: sidebar visible, no overflow ──
  await page.setViewportSize({ width: 800, height: 1024 })
  await page.waitForTimeout(600)
  const sidebarVisible = await page.isVisible('aside')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log('tablet sidebar visible:', sidebarVisible, '| hOverflow:', overflow)
  await shot(page, 'app-payments-tablet')

  // ── Batch builder dialog (mobile) ──
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(BASE + '/#/app/batches', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const newBatchBtn = await page.$('button:has-text("New batch")')
  if (newBatchBtn) {
    await newBatchBtn.click()
    await page.waitForSelector('[role="dialog"]', { timeout: 30000 })
    const dlgInfo = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      const cs = getComputedStyle(d)
      const footerBtn = [...d.querySelectorAll('button')].find((b) => /create batch|validate rows|import/i.test(b.textContent))
      return {
        clientH: d.clientHeight,
        scrollH: d.scrollHeight,
        scrollable: cs.overflowY === 'auto' || cs.overflowY === 'scroll',
        maxH: cs.maxHeight,
        csvStageButton: footerBtn ? footerBtn.textContent.trim().slice(0, 40) : null,
        inView: footerBtn ? footerBtn.getBoundingClientRect().top < window.innerHeight : false,
      }
    })
    console.log('batch dialog:', JSON.stringify(dlgInfo))
    await shot(page, 'batch-dialog-mobile')
  } else {
    console.log('batch: New batch button not found')
    await shot(page, 'batch-dialog-mobile-missing')
  }

  // ── Batch ≥1000 round-trip via API (the money round-trip bug) ──
  const apiCheck = await page.evaluate(async () => {
    // Use the app's real wrapper semantics: session cookie + org header.
    const session = await fetch('/api/auth/session').then((r) => r.json())
    const orgId = session?.data?.organizations?.[0]?.id
    const h = { 'content-type': 'application/json', 'x-organization-id': orgId }
    const w = await fetch('/api/wallets', { method: 'POST', headers: h, body: JSON.stringify({ label: 'Smoke Treasury', address: '9xQeWvG816bUx9EPjHmaTprYpRxpVkYnTdC8kP7d2wTE', network: 'devnet', kind: 'TREASURY' }) }).then((r) => r.json())
    if (!w?.data) return { fail: 'wallet ' + JSON.stringify(w).slice(0, 160) }
    const r1 = await fetch('/api/recipients', { method: 'POST', headers: h, body: JSON.stringify({ name: 'Big Amount Co', address: '4Nd1mBQtrMJVYVfKf2PJy9NZBCZd2ZQhRZk3Z5nL6dWx' }) }).then((r) => r.json())
    if (!r1?.data) return { fail: 'recipient ' + JSON.stringify(r1).slice(0, 160) }
    const r2 = await fetch('/api/batches', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        name: 'Smoke big amounts',
        sourceWalletId: w.data.wallet.id,
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        items: [{ recipientId: r1.data.id, recipientName: 'Big Amount Co', address: r1.data.address, amount: '1,250.50' }],
      }),
    }).then((r) => r.json())
    if (!r2?.data) return { fail: 'batch ' + JSON.stringify(r2).slice(0, 200) }
    const r3 = await fetch(`/api/batches/${r2.data.id}/actions`, { method: 'POST', headers: h, body: JSON.stringify({ action: 'validate' }) }).then((r) => r.json())
    return { batch: r2.data.status, validate: r3?.data ?? r3 }
  })
  console.log('batch ≥1000 unit round-trip:', JSON.stringify(apiCheck))

  await browser.close()
  console.log('SMOKE v2 COMPLETE:', results.join(', '))
})().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1) })
