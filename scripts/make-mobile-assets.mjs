// Prepare Capacitor asset sources (assets/icon.png + assets/splash.png) from the
// Synapz logo, then run `npx capacitor-assets generate` to produce the native
// Android/iOS icon + splash sets. Run via `npm run assets:mobile`.

import sharp from 'sharp'
import { mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const assets = path.join(root, 'assets')
mkdirSync(assets, { recursive: true })

const iconSrc = path.join(root, 'build', 'icon.png') // produced by `npm run icons`
copyFileSync(iconSrc, path.join(assets, 'icon.png'))

// Splash: the logo centered on the app's near-black background.
const logo = await sharp(iconSrc)
  .resize(760, 760, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: { r: 10, g: 10, b: 12, alpha: 1 } },
})
  .composite([{ input: logo, gravity: 'center' }])
  .png()
  .toFile(path.join(assets, 'splash.png'))

console.log('✓ wrote assets/icon.png + assets/splash.png')
