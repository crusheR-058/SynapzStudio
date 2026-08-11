// Renderer-side bridge to the desktop auto-updater.
//
// The main process does the work (see electron/updater.cjs); this just mirrors
// its state so the UI can say "update ready" and offer a restart. No-op on the
// plain web build, which updates itself by virtue of being a web page.

export type UpdateState = 'idle' | 'downloading' | 'ready'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
}

interface UpdaterBridge {
  isDesktop?: boolean
  updateStatus?: () => Promise<UpdateStatus>
  restartToUpdate?: () => void
  onUpdateStatus?: (cb: (s: UpdateStatus) => void) => () => void
}

const bridge = (): UpdaterBridge | undefined =>
  (window as unknown as { synapz?: UpdaterBridge }).synapz

/**
 * Subscribe to update state. Pulls the current value first — a check kicked off
 * at launch often resolves before this component has mounted, and without the
 * pull that transition would be missed entirely. Returns an unsubscribe.
 */
export function watchUpdates(cb: (s: UpdateStatus) => void): () => void {
  const api = bridge()
  if (!api?.isDesktop || !api.onUpdateStatus) return () => {}
  api.updateStatus?.().then(cb).catch(() => {})
  return api.onUpdateStatus(cb)
}

/** Install the downloaded update and relaunch. */
export function restartToUpdate(): void {
  bridge()?.restartToUpdate?.()
}
