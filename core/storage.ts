// A tiny synchronous key/value store for core.
//
// core can't touch localStorage: it doesn't exist in React Native, and merely
// referencing it throws. Rather than make every caller async — which would
// ripple through the YouTube cache and change web behaviour — each platform
// registers a synchronous adapter:
//
//   web/desktop  localStorage (persistent, unchanged from before the move)
//   mobile       the in-memory default
//
// In-memory is the right default on mobile rather than a shim over AsyncStorage:
// the only consumer is the YouTube search cache, and mobile reaches YouTube
// through the hosted /yt/search proxy, which is already CDN-cached and holds a
// 6-hour in-memory cache of its own. A repeated search there costs no quota
// whether or not the client remembers it.

export interface KV {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

function memoryKV(): KV {
  const map = new Map<string, string>()
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  }
}

let store: KV = memoryKV()

/** Called once per platform, at startup. */
export function setStorage(kv: KV): void {
  store = kv
}

export function storage(): KV {
  return store
}
