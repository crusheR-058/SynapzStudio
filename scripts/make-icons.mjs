// Rasterize the Synapz SVG logo into the app-icon set electron-builder needs:
//   build/icon.png  (1024²) — Linux + source of truth
//   build/icon.ico          — Windows installer + exe
//   build/icon.icns         — macOS .app / .dmg
// Run via `npm run icons` (also wired into the dist scripts).

import sharp from 'sharp'
import png2icons from 'png2icons'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
mkdirSync(buildDir, { recursive: true })

const svg = readFileSync(path.join(root, 'public', 'icon.svg'))

// High density so the 64-unit SVG rasterizes crisply at 1024².
const png = await sharp(svg, { density: 512 })
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

writeFileSync(path.join(buildDir, 'icon.png'), png)
writeFileSync(path.join(buildDir, 'icon.ico'), png2icons.createICO(png, png2icons.BICUBIC, 0, false))
writeFileSync(path.join(buildDir, 'icon.icns'), png2icons.createICNS(png, png2icons.BICUBIC, 0))

console.log('✓ wrote build/icon.png, build/icon.ico, build/icon.icns')
