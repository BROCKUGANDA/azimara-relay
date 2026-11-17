// Inspect buttons and click precisely
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('Error')) console.log('CONSOLE:', m.text().slice(0, 300)) })
  page.on('response', (r) => { if (r.url().includes('/api/auth')) console.log('API', r.status(), r.url().replace(BASE, '')) })
  await page.goto(BASE + '/#/register', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const btns = await page.$$eval('button', (els) => els.map((b) => ({ text: b.textContent.trim().slice(0, 40), type: b.getAttribute('type'), disabled: b.disabled })))
  console.log(JSON.stringify(btns, null, 1))
  await page.fill('#name', 'UI Tester')
  await page.fill('#email', `ui2-${Date.now()}@example.com`)
  await page.fill('#password', 'SmokePass12345')
  // click the exact submit button (first button whose text is exactly "Create account")
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Create account')
    if (!b) return 'NOT FOUND'
    b.click()
    return 'clicked'
  })
  console.log('click result:', clicked)
  await page.waitForTimeout(1800)
  const body = (await page.textContent('body')).slice(0, 260).replace(/\s+/g, ' ')
  console.log('body:', body)
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
