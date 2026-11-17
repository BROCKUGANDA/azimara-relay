// Focused check: invalid payment id → contained error state
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  // reuse a fresh account
  await page.goto(BASE + '/#/register', { waitUntil: 'networkidle' })
  const email = `err-${Date.now()}@example.com`
  await page.fill('#name', 'Err Tester')
  await page.fill('#email', email)
  await page.fill('#password', 'ErrPass12345')
  await page.click('button:has-text("Create account")')
  await page.waitForTimeout(1500)
  const verifyBtn = await page.$('button.font-mono')
  if (verifyBtn) { await verifyBtn.click(); await page.waitForTimeout(1000) }
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', 'ErrPass12345')
  await page.click('button:has-text("Sign in")')
  await page.waitForSelector('#org-name', { timeout: 15000 }).catch(() => undefined)
  if (await page.$('#org-name')) { await page.fill('#org-name', 'Err Treasury'); await page.click('button:has-text("Create organization")') }
  await page.waitForSelector('nav[aria-label="Application"]', { timeout: 15000 })

  await page.evaluate(() => { window.location.hash = '#/app/payments/nonexistent-id' })
  await page.waitForTimeout(3500) // allow query retries to settle
  const text = (await page.evaluate(() => document.querySelector('main')?.textContent ?? '')).replace(/\s+/g, ' ')
  console.log('MAIN:', text.slice(0, 300))
  console.log('HAS_ERROR_STATE:', text.includes('Something went wrong'))
  console.log('SHELL_ALIVE:', !!(await page.$('nav[aria-label="Application"]')))
  console.log('RETRY_SHOWN:', text.includes('Retry'))
  await page.screenshot({ path: '/tmp/render/verify-03b-error-state.png' })
  await browser.close()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
