// Renders resources/evrohq-icon-1024.svg into a multi-resolution Windows .ico
// (PNG-compressed frames, Vista+) plus a 256px PNG. The 16px frame comes from
// resources/evrohq-icon-16.svg, a simplified variant that stays readable there.
// Run: node scripts/make-icon.cjs
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const resDir = path.join(__dirname, '..', 'resources')
const svgPath = path.join(resDir, 'evrohq-icon-1024.svg')
const svg16Path = path.join(resDir, 'evrohq-icon-16.svg')
const icoPath = path.join(resDir, 'icon.ico')
const png256Path = path.join(resDir, 'icon-256.png')

const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  const svg = fs.readFileSync(svgPath)
  const svg16 = fs.readFileSync(svg16Path)

  // Render one crisp frame per target size straight from the vector source.
  const pngs = await Promise.all(
    SIZES.map((size) =>
      sharp(size === 16 ? svg16 : svg, { density: 384 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer()
    )
  )

  fs.writeFileSync(png256Path, pngs[SIZES.indexOf(256)])

  // Assemble the .ico: 6-byte header + one 16-byte dir entry per image + blobs.
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)

  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngs.forEach((png, i) => {
    const size = SIZES[i]
    const e = entries.subarray(i * 16, i * 16 + 16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // width  (0 => 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1) // height (0 => 256)
    e.writeUInt8(0, 2) // palette count
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // color planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
  })

  fs.writeFileSync(icoPath, Buffer.concat([header, entries, ...pngs]))
  console.log(`Wrote ${icoPath} (${SIZES.join(', ')} px, ${fs.statSync(icoPath).size} bytes)`)
  console.log(`Wrote ${png256Path}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
