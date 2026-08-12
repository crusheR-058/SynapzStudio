// The Audius half of the two-engine design: real background audio, lockscreen
// transport, headphone buttons.
//
// TrackPlayer holds exactly ONE track at a time and the app keeps the queue.
// That looks wasteful and isn't: TrackPlayer's queue cannot hold a YouTube
// track, so using it would split the queue across two systems and make next/prev
// behave differently depending on which source you happened to be on. One
// app-level queue, one loaded track, no divergence.

import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
  State,
} from 'react-native-track-player'
import type { Track } from '@core/types'
import type { PlaybackEngine } from './player'

let ready: Promise<void> | null = null

/** Idempotent — setupPlayer() throws if called twice, and Fast Refresh will. */
export function ensurePlayer(): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    try {
      await TrackPlayer.setupPlayer({ autoHandleInterruptions: true })
    } catch (err) {
      // "player already initialized" is fine — anything else is not.
      const msg = String((err as Error)?.message ?? err)
      if (!/already/i.test(msg)) throw err
    }

    await TrackPlayer.updateOptions({
      android: {
        // Keep the notification alive when the app is swiped away, so playback
        // doesn't die with the task.
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      // What fits in the collapsed notification.
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      progressUpdateEventInterval: 1,
    })

    // The app advances the queue itself; letting TrackPlayer repeat the single
    // loaded track would fight it.
    await TrackPlayer.setRepeatMode(RepeatMode.Off)
  })().catch((err) => {
    // Reset so a later attempt can retry rather than being stuck on a rejected
    // promise for the life of the process.
    ready = null
    throw err
  })
  return ready
}

export const audioEngine: PlaybackEngine = {
  backgroundCapable: true,

  async load(track: Track) {
    if (!track.streamUrl) throw new Error(`Track ${track.id} has no stream URL`)
    await ensurePlayer()
    await TrackPlayer.reset()
    await TrackPlayer.add({
      id: track.id,
      url: track.streamUrl,
      title: track.title,
      artist: track.artist,
      artwork: track.artworkLarge || track.artwork,
      duration: track.duration,
    })
  },

  async play() {
    await ensurePlayer()
    await TrackPlayer.play()
  },

  async pause() {
    if (!ready) return
    await TrackPlayer.pause()
  },

  async seek(sec: number) {
    if (!ready) return
    await TrackPlayer.seekTo(Math.max(0, sec))
  },

  async stop() {
    if (!ready) return
    // reset() rather than stop(): this runs when handing off to the YouTube
    // engine, and a paused-but-loaded track leaves a stale notification sitting
    // there advertising a track that is no longer playing.
    await TrackPlayer.reset()
  },
}

/** True when the native player reports it is actually producing sound. */
export async function isActuallyPlaying(): Promise<boolean> {
  if (!ready) return false
  const state = await TrackPlayer.getPlaybackState()
  return state.state === State.Playing
}
