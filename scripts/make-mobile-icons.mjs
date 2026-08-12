// Generate the mobile app's icons from the same 1024px source the desktop build
// uses, so the phone icon is the real Synapz mark rather than Expo's template.
//
// Run: node scripts/make-mobile-icons.mjs

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const SRC = 'assets/icon.png'
const OUT = 'mobile/assets/images'
const GROUND = '#0a0a0c' // the app's own background, from src/styles/theme.css

await mkdir(OUT, { recursive: true })

const bg = { r: 10, g: 10, b: 12, alpha: 1 }

/**
 * Android adaptive icons are masked to a circle/squircle and the system may
 * scale them up, so only the middle ~66% is reliably visible. The mark is
 * inset into that safe zone; drawn edge-to-edge it gets its corners cropped
 * on most launchers.
 */
const SAFE = 0.62

async function foreground(size) {
  const inner = Math.round(size * SAFE)
  const pad = Math.round((size - inner) / 2)
  const mark = await sharp(SRC).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer()
}

// Main launcher icon: flattened onto the app's ground, since iOS forbids alpha
// in the app icon and renders a transparent one with a black box behind it.
await sharp(SRC).resize(1024, 1024).flatten({ background: bg }).png().toFile(`${OUT}/icon.png`)

await sharp(await foreground(1024)).png().toFile(`${OUT}/android-icon-foreground.png`)

/**
 * Monochrome (themed icons, Android 13+): a white silhouette of the SYNAPSE
 * GLYPH, not of the disc.
 *
 * Taking the source's own alpha would give a solid white circle — the glyph is
 * a hole in it, so the mark disappears entirely. Instead the image is flattened
 * onto white and thresholded: the glyph is #0a0a0c (luma ~10) and the disc is
 * #ff2e4c (luma ~112), so a cut at 60 separates them cleanly. Negating turns the
 * glyph white, and that becomes the alpha channel.
 */
{
  const inner = Math.round(1024 * SAFE)
  const pad = Math.round((1024 - inner) / 2)
  const glyph = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .greyscale()
    .threshold(60)
    .negate()
    .toBuffer()

  // sharp's create() needs 3 or 4 channels, so the canvas is built in RGB and
  // reduced to a single channel afterwards — that one channel is the alpha.
  const alpha = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: glyph, top: pad, left: pad }])
    .greyscale()
    .toColourspace('b-w')
    .raw()
    .toBuffer()

  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha, { raw: { width: 1024, height: 1024, channels: 1 } })
    .png()
    .toFile(`${OUT}/android-icon-monochrome.png`)
}

await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: bg },
})
  .png()
  .toFile(`${OUT}/android-icon-background.png`)

// Splash mark sits on the ground colour set in app.json, so it keeps its alpha.
await sharp(SRC).resize(512, 512).png().toFile(`${OUT}/splash-icon.png`)

await sharp(SRC).resize(96, 96).flatten({ background: bg }).png().toFile(`${OUT}/favicon.png`)

console.log(`mobile icons written to ${OUT}/ from ${SRC} (ground ${GROUND})`)
