// The track-player playback service: how the lockscreen, the notification, and
// headphone buttons reach the app.
//
// Registered at entry (see index.js) rather than from a component, because it
// must survive the UI being torn down — that is exactly when someone reaches for
// the lockscreen.
//
// Every remote event is routed through remote() to the APP's queue rather than
// TrackPlayer's own. The app queue is the only one that can hold YouTube tracks;
// TrackPlayer's holds one track at a time. Calling skipToNext() here would work
// on an all-Audius queue and silently do nothing on a mixed one.

import TrackPlayer, { Event } from 'react-native-track-player'
import { remote } from './remote'

export default async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => remote().play?.())
  TrackPlayer.addEventListener(Event.RemotePause, () => remote().pause?.())
  TrackPlayer.addEventListener(Event.RemoteNext, () => remote().next?.())
  TrackPlayer.addEventListener(Event.RemotePrevious, () => remote().prev?.())
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => remote().seek?.(position))

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    remote().pause?.()
    void TrackPlayer.reset()
  })

  // Fired when the single loaded track finishes. Advancing here is what makes a
  // queue play through with the screen off.
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => remote().next?.())
}
