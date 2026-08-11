// Rasterize the Synapz SVG logo into the app-icon set electron-builder needs:
//   build/icon.png  (1024²) — Linux + source of truth
//   build/icon.ico          — Windows installer + exe
//   build/icon.icns         — macOS .app / .dmg
// …plus the 16² transport glyphs for the Windows taskbar thumbnail toolbar:
//   electron/thumbar/{prev,play,pause,next}.png
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

// --- taskbar thumbnail toolbar glyphs -----------------------------------
// Windows draws these at 16² on the flyout under the taskbar preview, on a
// themed (usually dark) background — so they're flat white with an alpha
// channel and let the OS supply the contrast. They live under electron/ because
// that's what the electron-builder `files` globs ship.

const thumbarDir = path.join(root, 'electron', 'thumbar')
mkdirSync(thumbarDir, { recursive: true })

const GLYPHS = {
  prev: '<rect x="3" y="3.2" width="1.9" height="9.6" rx=".5"/><path d="M13 3.4 L6 8 L13 12.6 Z"/>',
  play: '<path d="M4.8 3.2 L13 8 L4.8 12.8 Z"/>',
  pause:
    '<rect x="4" y="3.2" width="2.9" height="9.6" rx=".5"/><rect x="9.1" y="3.2" width="2.9" height="9.6" rx=".5"/>',
  next: '<path d="M3 3.4 L10 8 L3 12.6 Z"/><rect x="11.1" y="3.2" width="1.9" height="9.6" rx=".5"/>',
}

for (const [name, shapes] of Object.entries(GLYPHS)) {
  const glyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="#ffffff">${shapes}</svg>`
  // Rasterize ~5× then downsample: librsvg's direct 16² output is harsh on the
  // triangles' diagonals, Lanczos from 80² is not.
  const buf = await sharp(Buffer.from(glyph), { density: 360 })
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  writeFileSync(path.join(thumbarDir, `${name}.png`), buf)
}

console.log(`✓ wrote electron/thumbar/{${Object.keys(GLYPHS).join(',')}}.png`)
