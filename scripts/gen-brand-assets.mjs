// Regenerates every raster brand asset from public/icon.svg with the
// "Arctic Deep" palette: favicon.ico (16/32/48), PWA 192/512, maskable
// variants, apple-touch-icon. Run: node scripts/gen-brand-assets.mjs
import { readFileSync } from 'fs'
import sharp from 'sharp'

const svg = readFileSync('public/icon.svg')

async function png(size, out, opts = {}) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 10, g: 18, b: 32, alpha: 0 } })
    .png()
    .toFile(out)
  console.log('wrote', out)
}

// Maskable icons need the mark inside a full-bleed safe zone (80% rule).
async function maskable(size, out) {
  const inner = Math.round(size * 0.72)
  const mark = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 10, g: 18, b: 32, alpha: 1 } } })
    .composite([{ input: mark, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png()
    .toFile(out)
  console.log('wrote', out)
}

// ICO container wrapping three PNG sizes.
async function ico(out) {
  const sizes = [16, 32, 48]
  const pngs = []
  for (const s of sizes) {
    const buf = await sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()
    pngs.push(buf)
  }
  // ICO header: 6 bytes + 16 bytes per entry + images.
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  pngs.forEach((buf, i) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0) // width
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1) // height
    e.writeUInt8(0, 2) // palette
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(buf.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += buf.length
    entries.push(e)
  })
  const icoBuf = Buffer.concat([header, ...entries, ...pngs])
  const { writeFile } = await import('fs/promises')
  await writeFile(out, icoBuf)
  console.log('wrote', out)
}

await ico('public/favicon.ico')
await png(192, 'public/icon-192.png')
await png(512, 'public/icon-512.png')
await maskable(192, 'public/icon-maskable-192.png')
await maskable(512, 'public/icon-maskable-512.png')
await png(180, 'public/apple-touch-icon.png')
await png(32, 'public/icon-32.png')
await png(16, 'public/icon-16.png')
console.log('brand assets regenerated')
