// Local music library — folder scan + a private scheme to stream the files.
//
// The UI is served from http://localhost, and a page on an http origin cannot
// load file:// URLs. So the files are exposed over `synapz-file://` instead,
// which this module answers by reading from disk.
//
// That scheme is a hole from the web into the filesystem, so it is kept narrow:
//   • it only serves files inside folders the user picked in the OS dialog —
//     the renderer can ask for a scan but cannot name a folder itself;
//   • it only serves audio extensions, so even inside a music folder it can't
//     be used to read a stray document.
//
// Range requests are answered by hand. Seeking in an <audio> element is a
// Range request, and without 206 support a local track could only ever be
// played from the start.

const { app, dialog, ipcMain, protocol } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')

const SCHEME = 'synapz-file'

const MIME = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.weba': 'audio/webm',
  '.webm': 'audio/webm',
}

const MAX_FILES = 5000
const MAX_DEPTH = 8

// Must run before the app is ready, i.e. at require time. `stream` is what lets
// a media element treat the response as seekable.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

let roots = []
const storeFile = () => path.join(app.getPath('userData'), 'local-library.json')

function loadRoots() {
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
    roots = Array.isArray(data.roots) ? data.roots.filter((r) => typeof r === 'string') : []
  } catch {
    roots = []
  }
}

function saveRoots() {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify({ roots }, null, 2))
  } catch (err) {
    console.error('[synapz] could not save the local library folders:', err)
  }
}

const isAudio = (file) => Object.hasOwn(MIME, path.extname(file).toLowerCase())

/** True if `file` is an audio file inside one of the user's chosen folders. */
function allowed(file) {
  if (!path.isAbsolute(file) || !isAudio(file)) return false
  const full = path.resolve(file)
  return roots.some((root) => {
    const rel = path.relative(root, full)
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
  })
}

async function walk(dir, depth, out) {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return // unreadable folder (permissions, unplugged drive) — skip it
  }
  for (const e of entries) {
    if (out.length >= MAX_FILES) return
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walk(full, depth + 1, out)
    } else if (e.isFile() && isAudio(e.name)) {
      let size = 0
      try {
        size = (await fs.promises.stat(full)).size
      } catch {
        continue
      }
      out.push({ path: full, name: e.name, dir: path.basename(dir), size })
    }
  }
}

async function scan() {
  const files = []
  for (const root of roots) await walk(root, 0, files)
  return { roots, files, truncated: files.length >= MAX_FILES }
}

async function serve(request) {
  let file
  try {
    file = decodeURIComponent(new URL(request.url).pathname.slice(1))
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!allowed(file)) return new Response('Forbidden', { status: 403 })

  let size
  try {
    size = (await fs.promises.stat(file)).size
  } catch {
    return new Response('Not found', { status: 404 })
  }

  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()],
    'Accept-Ranges': 'bytes',
  }
  if (size === 0) return new Response(null, { status: 200, headers })

  let start = 0
  let end = size - 1
  let status = 200
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '')
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = Number(m[1])
      if (m[2]) end = Math.min(Number(m[2]), size - 1)
    } else {
      // Suffix form, "bytes=-500": the last 500 bytes.
      start = Math.max(0, size - Number(m[2]))
    }
    if (start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${size}` },
      })
    }
    status = 206
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  }
  headers['Content-Length'] = String(end - start + 1)

  const stream = fs.createReadStream(file, { start, end })
  return new Response(Readable.toWeb(stream), { status, headers })
}

/** Call once the app is ready. `getWindow` supplies the parent for the dialog. */
function init(getWindow) {
  loadRoots()
  protocol.handle(SCHEME, serve)

  ipcMain.handle('local:scan', () => scan())

  ipcMain.handle('local:add-folder', async () => {
    const win = getWindow()
    const opts = { title: 'Choose a music folder', properties: ['openDirectory'] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths.length) return null
    const picked = path.resolve(res.filePaths[0])
    if (!roots.includes(picked)) {
      roots.push(picked)
      saveRoots()
    }
    return scan()
  })

  ipcMain.handle('local:remove-folder', (_e, root) => {
    roots = roots.filter((r) => r !== root)
    saveRoots()
    return scan()
  })
}

module.exports = { init }
