// Bridge between the playback service and the React tree.
//
// react-native-track-player's service runs OUTSIDE React — it is registered at
// app entry and must keep working when no component is mounted (that is the
// whole point: lockscreen and notification controls have to respond when the UI
// is gone). So it cannot call into a hook or a context. It reads these handlers
// instead, and PlayerProvider keeps them pointed at the current callbacks.

export interface RemoteHandlers {
  play(): void
  pause(): void
  next(): void
  prev(): void
  seek(sec: number): void
}

let handlers: Partial<RemoteHandlers> = {}

export function setRemoteHandlers(next: Partial<RemoteHandlers>): void {
  handlers = next
}

export function remote(): Partial<RemoteHandlers> {
  return handlers
}
