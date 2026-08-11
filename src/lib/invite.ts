// Where a Listen Along invite comes from, and how it reaches the app.
//
// One code, three routes in:
//
//   1. Desktop, app already running — Discord's button opened the web page,
//      which bounced to synapz://listen/<code>; the main process forwards it.
//   2. Desktop, cold start — the same link LAUNCHED the app, so the code was
//      parked in the main process before the UI existed and is drained here.
//   3. Web — the visitor is simply sitting on /listen/<code>, which is the page
//      that offers them the desktop app.
//
// The web build only ever sees (3); the desktop bridge is absent there and the
// electron paths no-op.

const PATH_RE = /^\/listen\/([a-z0-9]{4,32})\/?$/i

interface InviteBridge {
  isDesktop?: boolean
  consumePendingListen?: () => Promise<string | null>
  onListenInvite?: (cb: (code: string) => void) => () => void
}

const bridge = (): InviteBridge | undefined =>
  (window as unknown as { synapz?: InviteBridge }).synapz

/** The room code in the current URL, if this is a /listen/<code> page. */
export function inviteFromUrl(): string | null {
  const m = PATH_RE.exec(window.location.pathname)
  return m ? m[1].toLowerCase() : null
}

/**
 * Drop /listen/<code> from the address bar once it's been handled, so a refresh
 * (or a later share of the URL) doesn't re-prompt for a session already joined.
 */
export function clearInviteFromUrl(): void {
  if (inviteFromUrl()) window.history.replaceState(null, '', '/')
}

/**
 * Watch every route an invite can arrive by. Fires immediately for one already
 * present, then again for any that lands while the app is open. Returns an
 * unsubscribe.
 */
export function watchInvites(cb: (code: string) => void): () => void {
  const fromUrl = inviteFromUrl()
  if (fromUrl) cb(fromUrl)

  const api = bridge()
  if (!api?.isDesktop) return () => {}

  // Cold start: the invite launched the app and has been waiting in the main
  // process for the UI to come up.
  api.consumePendingListen?.().then((code) => {
    if (code) cb(code)
  })

  return api.onListenInvite?.(cb) ?? (() => {})
}

/** True inside the Electron app — the web build shows the download prompt instead. */
export function isDesktopApp(): boolean {
  return !!bridge()?.isDesktop
}

/**
 * Hand a web visitor off into the desktop app. Navigating to the custom scheme
 * either launches Synapz or does nothing at all (no app registered) — the
 * browser gives no callback either way, so the caller keeps the download option
 * on screen rather than trying to detect success.
 */
export function openInDesktopApp(code: string): void {
  window.location.href = `synapz://listen/${code}`
}

/** Where to send someone who doesn't have the app yet. */
export const DOWNLOAD_URL = 'https://github.com/crusheR-058/SynapzStudio/releases/latest'
