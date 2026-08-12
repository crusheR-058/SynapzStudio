// Emit the baked catalogues as static JSON under public/catalog/, so the mobile
// app can fetch them instead of bundling them.
//
// Why not just import the .ts files on mobile: Metro has no dynamic import()
// code-splitting, so every catalogue would land in the JS bundle — 1.2 MB from
// indian.ts alone, paid on every cold start of every install. Served as JSON and
// cached to disk, the app starts small and the catalogue can be refreshed
// without shipping a release (which on Play means without waiting for review).
//
// Run: node scripts/export-catalog.mjs

import { build } from 'esbuild'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { createGzip } from 'node:zlib'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = 'public/catalog'
const TMP = 'node_modules/.cache/catalog-export'

/** Each source module, and the exports to lift out of it. */
const SOURCES = [
  { file: 'indian', tracks: 'INDIAN_TRACKS', extra: { artists: 'INDIAN_ARTISTS', scenes: 'INDIAN_SCENES' } },
  { file: 'bollywood', tracks: 'BOLLYWOOD_TRACKS', extra: {} },
  { file: 'hollywood', tracks: 'HOLLYWOOD_TRACKS', extra: { artists: 'HOLLYWOOD_ARTISTS' } },
  { file: 'podcasts', tracks: 'PODCAST_TRACKS', extra: {} },
  { file: 'stations', tracks: 'STATION_TRACKS', extra: {} },
]

await mkdir(OUT, { recursive: true })
await mkdir(TMP, { recursive: true })

const manifest = []

for (const src of SOURCES) {
  // Bundle rather than transform: the catalogue modules import ./types, and a
  // bare transform would leave that import in place for Node to choke on.
  const outfile = path.resolve(TMP, `${src.file}.mjs`)
  await build({
    entryPoints: [`src/lib/${src.file}.ts`],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  })

  const mod = await import(pathToFileURL(outfile).href)
  const tracks = mod[src.tracks]
  if (!Array.isArray(tracks) || !tracks.length) {
    throw new Error(`${src.file}: expected ${src.tracks} to be a non-empty array`)
  }

  const payload = { tracks }
  for (const [key, exportName] of Object.entries(src.extra)) {
    payload[key] = mod[exportName]
  }

  const json = JSON.stringify(payload)
  await writeFile(path.join(OUT, `${src.file}.json`), json)

  const gz = await gzipSize(json)
  manifest.push({
    name: src.file,
    tracks: tracks.length,
    bytes: Buffer.byteLength(json),
    gzip: gz,
  })
  console.log(
    `${src.file.padEnd(10)} ${String(tracks.length).padStart(5)} tracks  ` +
      `${mb(Buffer.byteLength(json))} raw  ${mb(gz)} gzipped`,
  )
}

// A version stamp lets the client cache aggressively and still notice a refresh.
// Sourced from the content itself, not a timestamp: re-running the export with
// unchanged catalogues must not invalidate every client's cache.
const version = hash(manifest.map((m) => `${m.name}:${m.tracks}:${m.bytes}`).join('|'))
await writeFile(path.join(OUT, 'index.json'), JSON.stringify({ version, catalogs: manifest }, null, 2))

await rm(TMP, { recursive: true, force: true })

const total = manifest.reduce((n, m) => n + m.tracks, 0)
console.log(`\n${total} tracks across ${manifest.length} catalogues -> ${OUT}/  (version ${version})`)

function mb(n) {
  return `${(n / 1048576).toFixed(2)}MB`
}

function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

async function gzipSize(str) {
  const gzip = createGzip()
  let size = 0
  gzip.on('data', (c) => (size += c.length))
  const done = new Promise((res) => gzip.on('end', res))
  gzip.end(str)
  await done
  return size
}
