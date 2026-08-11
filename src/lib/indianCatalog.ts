// Lazy access to the baked Indian catalog.
//
// src/lib/indian.ts is several hundred KB of harvested track data. Imported
// normally it would join the initial bundle and be downloaded by every visitor,
// including the ones who never open the Artists section — on top of a main
// chunk that is already ~1.2MB. So it is reached only through a dynamic
// import(), which Vite splits into its own chunk fetched on first use and
// cached by the browser thereafter.

import { useEffect, useState } from 'react'

type Catalog = typeof import('./indian')

let cache: Catalog | null = null
let inflight: Promise<Catalog> | null = null

/** Load (once) and return the catalog module. */
export function loadIndianCatalog(): Promise<Catalog> {
  if (cache) return Promise.resolve(cache)
  // Share one promise so several components mounting together trigger a single
  // fetch rather than racing each other into duplicate requests.
  if (!inflight) {
    inflight = import('./indian').then((m) => {
      cache = m
      inflight = null
      return m
    })
  }
  return inflight
}

/** Already resolved? Lets a view skip its loading state on revisit. */
export const indianCatalogReady = () => cache !== null

/**
 * React binding. Returns the module once loaded; `null` while the chunk is in
 * flight. Errors surface as `error` rather than throwing — a failed chunk fetch
 * (offline, cache miss on a stale deploy) should show a message, not blank the
 * whole view.
 */
export function useIndianCatalog(): { data: Catalog | null; error: string | null } {
  const [data, setData] = useState<Catalog | null>(cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache) {
      setData(cache)
      return
    }
    let live = true
    loadIndianCatalog()
      .then((m) => live && setData(m))
      .catch(() => live && setError('Could not load the catalogue. Check your connection.'))
    return () => {
      live = false
    }
  }, [])

  return { data, error }
}
