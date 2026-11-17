// Debug horizontal overflow: report the widest offending elements per route.
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } })
  for (const route of ['/', '/developers']) {
    await page.goto(BASE + '/#' + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const offenders = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const out = []
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.right > vw + 2 && r.width > 40) {
          out.push({ tag: el.tagName, cls: String(el.className).slice(0, 80), w: Math.round(r.width), right: Math.round(r.right), text: (el.textContent || '').slice(0, 40) })
        }
      })
      return out.slice(0, 12)
    })
    console.log('== route', route, '==')
    offenders.forEach((o) => console.log(JSON.stringify(o)))
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
