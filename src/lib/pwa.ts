// Installable web app: service-worker registration and the install prompt.
//
// Web build only. The desktop app is served from http://localhost by its own
// bundled backend and updates through electron-updater — a service worker there
// would just be a second, competing cache of the UI.

import { useEffect, useState } from 'react'
import { isDesktop } from './discord'

export function registerServiceWorker(): void {
  if (isDesktop() || !('serviceWorker' in navigator)) return
  // Not in dev: a worker caching Vite's module graph breaks hot reload.
  if (!(import.meta as any).env?.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell is a nicety; the app works without it */
    })
  })
}

// Chrome fires this once it judges the page installable. It has to be caught
// and held: the prompt can only be shown from a user gesture, later.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** `canInstall` flips true when the browser is ready to show its install dialog. */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const [canInstall, setCanInstall] = useState(!!deferred)
  useEffect(() => {
    const sync = () => setCanInstall(!!deferred)
    listeners.add(sync)
    return () => void listeners.delete(sync)
  }, [])
  const install = async () => {
    const e = deferred
    if (!e) return
    deferred = null
    notify()
    await e.prompt()
    await e.userChoice.catch(() => null)
  }
  return { canInstall, install }
}
