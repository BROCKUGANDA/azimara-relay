// Test all handlers + capture everything
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  page.on('console', (m) => console.log('CONSOLE[' + m.type() + ']:', m.text().slice(0, 200)))
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 800)))
  await page.goto(BASE + '/#/register', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // Test 1: "← Back to site" (simple navigate onClick)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Back to site'))
    b.click()
  })
  await page.waitForTimeout(600)
  console.log('after back-click url:', page.url())

  // Test 2: header logo button
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('AZIMARA'))
    if (b) b.click()
  })
  await page.waitForTimeout(600)
  console.log('after logo-click url:', page.url())
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
