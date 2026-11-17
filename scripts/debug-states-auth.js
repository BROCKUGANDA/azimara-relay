// Focused auth debug for state verification
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', (m) => console.log('CONSOLE[' + m.type() + ']:', m.text().slice(0, 250)))
  page.on('response', (r) => { if (r.url().includes('/api/')) console.log('API', r.status(), r.request().method(), r.url().replace(BASE, '')) })

  await page.goto(BASE + '/#/register', { waitUntil: 'networkidle' })
  const email = `dbg-${Date.now()}@example.com`
  await page.fill('#name', 'Dbg Tester')
  await page.fill('#email', email)
  await page.fill('#password', 'DbgPass12345')
  await page.click('button:has-text("Create account")')
  await page.waitForTimeout(1800)
  console.log('AFTER REGISTER URL:', page.url())
  console.log('BODY:', (await page.textContent('body')).slice(0, 250).replace(/\s+/g, ' '))
  const verifyBtn = await page.$('button.font-mono')
  console.log('verify btn:', !!verifyBtn)
  if (verifyBtn) { await verifyBtn.click(); await page.waitForTimeout(1200) }
  console.log('AFTER VERIFY BODY:', (await page.textContent('body')).slice(0, 200).replace(/\s+/g, ' '))

  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', 'DbgPass12345')
  await page.click('button:has-text("Sign in")')
  await page.waitForTimeout(3000)
  console.log('AFTER LOGIN URL:', page.url())
  console.log('BODY:', (await page.textContent('body')).slice(0, 250).replace(/\s+/g, ' '))
  await page.screenshot({ path: '/tmp/render/dbg.png' })
  await browser.close()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
