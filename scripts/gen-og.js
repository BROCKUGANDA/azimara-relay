// Generates brand image assets from og-template.html via Playwright:
//  - public/og.png (1200×630 Open Graph card)
//  - public/apple-touch-icon.png (180×180)
//  - public/icon-192.png / public/icon-512.png (PWA icons)
//  - public/favicon.ico-adjacent 32px is covered by public/icon.svg
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const ROOT = '/home/z/my-project'
const OUT = path.join(ROOT, 'public')

async function shot(page, { width, height, out, clipSelector }) {
  await page.setViewportSize({ width, height })
  const target = clipSelector ? await page.$(clipSelector) : null
  if (target) {
    await target.screenshot({ path: out })
  } else {
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } })
  }
  console.log('wrote', out)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // OG card
  await page.goto('file://' + path.join(ROOT, 'scripts', 'og-template.html'))
  await page.waitForTimeout(300)
  await shot(page, { width: 1200, height: 630, out: path.join(OUT, 'og.png') })

    console.log('OG card regenerated')

  await browser.close()
  console.log('done')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
