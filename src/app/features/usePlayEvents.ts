// Where the recap and the mixes get their play history.
//
// Signed out, it is the local play log, read fresh every time — it is a small
// localStorage read, and caching it would hide the song you just played.
//
// Signed in, it is the cloud history (every device). That fetch is a few
// thousand rows, so it is shared between Home (the mixes shelf) and the Recap
// view through a short-lived module cache. Plays made since the cache was
// filled are layered on top from the local log, so the cache never makes the
// recap lag behind what was just listened to.

import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { cloudFetchPlayEvents, type PlayEvent } from '../../lib/cloud'
import { localPlayEvents } from '../../lib/playlog'

const TTL_MS = 5 * 60_000

let cache: { key: string; at: number; events: PlayEvent[] } | null = null
let inflight: { key: string; promise: Promise<PlayEvent[]> } | null = null

const withRecent = (c: { at: number; events: PlayEvent[] }) => [
  ...localPlayEvents(c.at).filter((e) => e.track.source !== 'local'),
  ...c.events,
]

async function load(key: string, signedIn: boolean): Promise<PlayEvent[]> {
  if (!signedIn) return localPlayEvents()
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return withRecent(cache)
  if (inflight && inflight.key === key) return inflight.promise
  const promise = (async () => {
    const at = Date.now()
    const cloud = await cloudFetchPlayEvents()
    // Nothing in the cloud (new account, or the fetch failed): fall back to the
    // local log, and don't cache the miss.
    if (!cloud.length) return localPlayEvents()
    cache = { key, at, events: cloud }
    return cloud
  })()
  inflight = { key, promise }
  try {
    return await promise
  } finally {
    if (inflight?.promise === promise) inflight = null
  }
}

export function usePlayEvents(): { events: PlayEvent[]; loading: boolean } {
  const { user } = useAuth()
  const key = user?.email || 'local'
  const [state, setState] = useState<{ events: PlayEvent[]; loading: boolean }>({
    events: [],
    loading: true,
  })

  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    load(key, !!user).then((events) => live && setState({ events, loading: false }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
