// Focused auth UI debug
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  page.on('console', (m) => console.log('CONSOLE[' + m.type() + ']:', m.text().slice(0, 300)))
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 500)))
  page.on('response', (r) => { if (r.url().includes('/api/auth') ) console.log('API', r.status(), r.url().replace(BASE, '')) })

  const email = `ui-${Date.now()}@example.com`
  await page.goto(BASE + '/#/register', { waitUntil: 'networkidle' })
  await page.fill('#name', 'UI Tester')
  await page.fill('#email', email)
  await page.fill('#password', 'SmokePass12345')
  await page.click('button:has-text("Create account")')
  await page.waitForTimeout(1500)
  const verifyBtn = await page.$('button.font-mono')
  console.log('verify link visible:', !!verifyBtn)
  if (verifyBtn) { await verifyBtn.click(); await page.waitForTimeout(1200) }
  console.log('after verify url:', page.url(), '| body snippet:', (await page.textContent('body')).slice(0, 120).replace(/\s+/g, ' '))

  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', 'SmokePass12345')
  await page.click('button:has-text("Sign in")')
  await page.waitForTimeout(2000)
  console.log('after login url:', page.url())
  console.log('body snippet:', (await page.textContent('body')).slice(0, 200).replace(/\s+/g, ' '))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
