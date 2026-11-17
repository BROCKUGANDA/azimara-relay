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

  // Icons: render the SVG logo on brand background at each size.
  const svg = fs.readFileSync(path.join(OUT, 'icon.svg'), 'utf8')
  const iconHtml = `<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:0;background:#080D17}
    .wrap{display:flex;align-items:center;justify-content:center;width:512px;height:512px}
    svg{width:384px;height:384px}
  </style></head><body><div class="wrap">${svg.replace('width="32" height="32"', 'width="384" height="384"')}</div></body></html>`
  const iconPath = path.join(ROOT, 'scripts', 'icon-render.html')
  fs.writeFileSync(iconPath, iconHtml)
  await page.goto('file://' + iconPath)
  await page.waitForTimeout(200)
  await shot(page, { width: 512, height: 512, out: path.join(OUT, 'icon-512.png') })

  // apple-touch-icon: 180px, tight crop on the mark
  const appleHtml = iconHtml.replace('width:512px;height:512px', 'width:180px;height:180px').replace('width:384px;height:384px">it', 'width:128px;height:128px">').replace(/svg\{width:384px;height:384px\}/, 'svg{width:128px;height:128px}')
  fs.writeFileSync(iconPath, appleHtml)
  await page.goto('file://' + iconPath)
  await page.waitForTimeout(200)
  await shot(page, { width: 180, height: 180, out: path.join(OUT, 'apple-touch-icon.png') })

  // 192 PWA icon
  const icon192 = appleHtml.replace('width:180px;height:180px', 'width:192px;height:192px').replace(/svg\{width:128px;height:128px\}/, 'svg{width:140px;height:140px}')
  fs.writeFileSync(iconPath, icon192)
  await page.goto('file://' + iconPath)
  await page.waitForTimeout(200)
  await shot(page, { width: 192, height: 192, out: path.join(OUT, 'icon-192.png') })

  await browser.close()
  console.log('done')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
