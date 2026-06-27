import { watch } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

/**
 * Auto-deploy on save. Watches the source that affects the deployment and runs
 * `vercel --prod` a few seconds after you stop editing (debounced). Saves made
 * during a deploy are queued so nothing is missed.
 *
 *   npm run deploy:watch
 *
 * Tunables (env): DEPLOY_DEBOUNCE_MS (default 8000).
 * Leave it running in a terminal while you work; Ctrl+C to stop.
 */

const ROOT = process.cwd()
const PROD_URL = 'https://synapz-music.vercel.app'
const DEBOUNCE = Number(process.env.DEPLOY_DEBOUNCE_MS || 8000)

// Only watch what actually ships to Vercel (NOT dist/.vercel — would loop).
const WATCH_DIRS = ['src', 'api', 'lib', 'public']
const WATCH_FILES = ['index.html', 'vite.config.ts', 'vercel.json', 'package.json']
// Editor temp files / noise to ignore.
const IGNORE = /(~$|\.tmp$|\.swp$|\.log$|(^|[\\/])\.[^\\/]*\.(swp|tmp)$|(^|[\\/])(node_modules|dist|\.vercel|\.git|\.screenshots)([\\/]|$))/i

let timer = null
let deploying = false
let pending = false
const changed = new Set()

const ts = () => new Date().toLocaleTimeString()
const log = (msg) => console.log(`[${ts()}] ${msg}`)

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(deploy, DEBOUNCE)
}

function deploy() {
  if (deploying) {
    pending = true
    return
  }
  deploying = true
  const files = [...changed]
  changed.clear()
  log(`🚀 Deploying ${files.length} change${files.length === 1 ? '' : 's'} to production…`)
  let out = ''
  const child = spawn('vercel --prod --yes', { cwd: ROOT, shell: true })
  child.stdout.on('data', (d) => {
    out += d
    process.stdout.write(d)
  })
  child.stderr.on('data', (d) => {
    out += d
    process.stderr.write(d)
  })
  child.on('close', (code) => {
    deploying = false
    if (code === 0) {
      const url = (out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) || []).pop()
      log(`✅ Deployed${url ? ` (${url})` : ''} — live at ${PROD_URL}`)
    } else {
      log(`❌ Deploy failed (exit ${code}). It'll retry on your next save.`)
    }
    if (pending) {
      pending = false
      schedule()
    }
  })
}

function onChange(file) {
  if (!file || IGNORE.test(file)) return
  changed.add(file)
  log(`✏️  ${file} — deploying in ${Math.round(DEBOUNCE / 1000)}s${deploying ? ' (after current deploy)' : ''}…`)
  schedule()
}

let watching = 0
for (const d of WATCH_DIRS) {
  try {
    watch(path.join(ROOT, d), { recursive: true }, (_e, file) => onChange(file))
    watching++
  } catch (e) {
    log(`(skip ${d}/: ${e.message})`)
  }
}
for (const f of WATCH_FILES) {
  try {
    watch(path.join(ROOT, f), () => onChange(f))
    watching++
  } catch {
    /* file may not exist; ignore */
  }
}

log(`👀 Watching ${watching} path(s) — save any file and it auto-deploys to ${PROD_URL}`)
log(`   debounce ${DEBOUNCE / 1000}s · Ctrl+C to stop`)
