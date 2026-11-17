// Verification: custom states (boot splash, skeletons, view boundary wrapper,
// funding panel calculator, error states) across desktop + mobile.
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'
const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ' | ' + extra : ''}`)
}
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401') && !m.text().includes('Failed to load resource')) errors.push('CONSOLE: ' + m.text().slice(0, 200)) })

  // 1. Boot splash: capture immediately after navigation before session resolves
  await page.goto(BASE + '/#/register', { waitUntil: 'domcontentloaded' })
  const bootSeen = await page.evaluate(() => document.body.textContent.includes('AZIMARA') && !!document.querySelector('[role="status"]'))
  check('boot splash renders on first paint', bootSeen)
  await page.screenshot({ path: '/tmp/render/verify-01-boot.png' })

  // 2. Register → verify → land in app
  await page.waitForSelector('#name', { timeout: 15000 })
  const email = `state-${Date.now()}@example.com`
  await page.fill('#name', 'State Tester')
  await page.fill('#email', email)
  await page.fill('#password', 'StatePass12345')
  await page.click('button:has-text("Create account")')
  await page.waitForTimeout(1500)
  const verifyBtn = await page.$('button.font-mono')
  if (verifyBtn) { await verifyBtn.click(); await page.waitForTimeout(1200) }
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', 'StatePass12345')
  await page.click('button:has-text("Sign in")')
  // First login lands on create-org for a fresh account
  await page.waitForSelector('#org-name', { timeout: 15000 }).catch(() => undefined)
  const orgInput = await page.$('#org-name')
  if (orgInput) {
    await orgInput.fill('Verify Treasury')
    await page.click('button:has-text("Create organization")')
  }
  await page.waitForSelector('nav[aria-label="Application"]', { timeout: 15000 })
  check('app shell renders after login + org creation', true)

  // 3. View boundary wrapper present around content
  const wrapper = await page.$('main .view-enter')
  check('view-enter wrapper (keyed boundary) mounted', !!wrapper)

  // 4. Overview loads data-driven content (no stuck skeleton)
  await page.waitForTimeout(2500)
  const overviewText = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
  check('overview shows content', overviewText.length > 100, `len=${overviewText.length}`)
  check('no shimmer stuck after load', (await page.$$('main .relay-shimmer')).length === 0)

  // 5. Skeletons on first load of a list view: intercept API to slow it, then watch shimmer appear
  await page.route('**/api/payments*', async (route) => {
    await new Promise((r) => setTimeout(r, 900))
    route.continue()
  })
  await page.click('a:has-text("Payments"), button:has-text("Payments")', { timeout: 5000 }).catch(async () => {
    // sidebar buttons are not anchors — fall back to hash navigation
    await page.evaluate(() => { window.location.hash = '#/app/payments' })
  })
  await page.waitForTimeout(350)
  const shimmerOnPayments = await page.$$('main .relay-shimmer')
  check('payments view shows skeleton while fetching', shimmerOnPayments.length > 0, `bars=${shimmerOnPayments.length}`)
  await page.waitForTimeout(1500)
  const paymentsSettled = await page.evaluate(() => {
    const t = document.querySelector('main')?.textContent ?? ''
    return t.includes('No payments found') || t.toLowerCase().includes('payments')
  })
  check('payments view settles to content', paymentsSettled)
  await page.unroute('**/api/payments*')

  // 6. Integrations: funding requirements panel + calculator math
  await page.evaluate(() => { window.location.hash = '#/app/integrations' })
  await page.waitForTimeout(1200)
  const mainText = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
  check('funding requirements panel present', mainText.includes('Wallet funding requirements'))
  check('screening fee documented (0.002 SOL/wallet)', mainText.includes('0.002'))
  check('keeper funding requirement documented', mainText.includes('requiredSolUpFrontLamports'))
  check('devnet faucet path offered', mainText.includes('No real funds needed to validate the flow'))
  check('direct-transfer alternative offered', mainText.includes('Alternative without MultiHopper'))
  const calc = await page.evaluate(() => {
    const out = [...document.querySelectorAll('main span')].find((s) => /SOL$/.test(s.textContent.trim()) && /^\d+\.\d{4}/.test(s.textContent.trim()))
    return out ? out.textContent.trim() : null
  })
  check('calculator default = 5 × 0.002 = 0.0100 SOL', calc === '0.0100 SOL', `got=${calc}`)
  await page.fill('input[aria-label="Destination wallets"]', '10')
  await page.waitForTimeout(200)
  const calc10 = await page.evaluate(() => {
    const out = [...document.querySelectorAll('main span')].find((s) => /SOL$/.test(s.textContent.trim()) && /^\d+\.\d{4}/.test(s.textContent.trim()))
    return out ? out.textContent.trim() : null
  })
  check('calculator 10 wallets = 0.0200 SOL', calc10 === '0.0200 SOL', `got=${calc10}`)
  await page.screenshot({ path: '/tmp/render/verify-02-integrations.png', fullPage: true })

  // 7. Error state on invalid payment detail (API 404 → ErrorState, not crash)
  await page.evaluate(() => { window.location.hash = '#/app/payments/nonexistent-id' })
  await page.waitForTimeout(1200)
  const errText = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
  check('invalid payment id → contained error state (shell alive)', errText.includes('Something went wrong') && !!(await page.$('nav[aria-label="Application"]')), errText.slice(0, 120).replace(/\s+/g, ' '))
  await page.screenshot({ path: '/tmp/render/verify-03-error-state.png' })

  // 8. Mobile: integrations funding panel + no horizontal blowout
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const mpage = await mob.newPage()
  mpage.on('pageerror', (e) => errors.push('MOBILE PAGEERROR: ' + String(e).slice(0, 300)))
  await mpage.goto(BASE + '/#/login', { waitUntil: 'networkidle' })
  await mpage.fill('#email', email)
  await mpage.fill('#password', 'StatePass12345')
  await mpage.click('button:has-text("Sign in")')
  await mpage.waitForSelector('header', { timeout: 15000 })
  await mpage.evaluate(() => { window.location.hash = '#/app/integrations' })
  await mpage.waitForTimeout(1500)
  const mText = await mpage.evaluate(() => document.querySelector('main')?.textContent ?? '')
  check('mobile: funding panel renders', mText.includes('Wallet funding requirements'))
  const noHScroll = await mpage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)
  check('mobile: no page-level horizontal overflow', noHScroll, `scrollW=${await mpage.evaluate(() => document.documentElement.scrollWidth)}`)
  await mpage.screenshot({ path: '/tmp/render/verify-04-mobile-integrations.png', fullPage: true })

  // 9. Console/page errors
  const relevant = errors.filter((e) => !e.includes('favicon'))
  check('no runtime/page errors during session', relevant.length === 0, relevant.slice(0, 3).join(' || '))

  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  await browser.close()
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(2) })
