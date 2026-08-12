// The Audius audio engine: background playback with lockscreen controls.
//
// Built on expo-audio, after react-native-track-player turned out not to compile
// against React Native 0.86 at all — its MusicModule.kt passes a Bundle? where
// the newer Kotlin signatures require a Bundle, so :compileDebugKotlin fails
// outright. That was not a New Architecture warning to work around; the library
// simply cannot build on this SDK.
//
// Nothing is lost by dropping it. expo-audio 57 ships a real MediaSession
// (AudioControlsService / AudioMediaSessionCallback), which is the only reason
// track-player was here. And it removes a whole class of risk: expo-audio is
// versioned with the SDK, so it cannot fall out of step with it.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import type { Track } from '@core/types'
import type { PlaybackEngine } from './player'

let player: AudioPlayer | null = null
let configured = false
let onEnded: (() => void) | null = null
let sub: { remove: () => void } | null = null

/** The app advances its own queue; the engine reports the end of a track. */
export function setOnEnded(cb: (() => void) | null): void {
  onEnded = cb
}

async function ensureMode(): Promise<void> {
  if (configured) return
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  })
  configured = true
}

function release(): void {
  sub?.remove()
  sub = null
  if (!player) return
  try {
    player.clearLockScreenControls()
    player.remove()
  } catch {
    /* already gone */
  }
  player = null
}

export const audioEngine: PlaybackEngine = {
  backgroundCapable: true,

  async load(track: Track) {
    if (!track.streamUrl) throw new Error(`Track ${track.id} has no stream URL`)
    await ensureMode()
    // A fresh player per track: reusing one across sources leaks the previous
    // stream's buffered state and occasionally resumes at the old position.
    release()

    const p = createAudioPlayer({ uri: track.streamUrl })
    player = p

    // This is NOT only about showing controls. On Android, sustained background
    // playback requires an active media session — without it the OS stops the
    // audio after roughly three minutes, which would look like a random cutout
    // rather than a missing feature.
    p.setActiveForLockScreen(
      true,
      {
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artworkLarge || track.artwork,
      },
      { showSeekForward: true, showSeekBackward: true, isLiveStream: false },
    )

    sub = p.addListener('playbackStatusUpdate', (status) => {
      // Guard on identity: a status from the outgoing player can arrive after a
      // skip and would advance the queue a second time.
      if (player !== p) return
      if (status.didJustFinish) onEnded?.()
    })
  },

  async play() {
    await ensureMode()
    player?.play()
  },

  async pause() {
    player?.pause()
  },

  async seek(sec: number) {
    await player?.seekTo(Math.max(0, sec))
  },

  async stop() {
    // Full release rather than pause: this runs when handing off to the YouTube
    // engine, and a paused-but-loaded player leaves a stale lockscreen entry
    // advertising a track that is no longer playing.
    release()
  },
}

/** Current position in seconds, or null when nothing is loaded. */
export function audioPosition(): number | null {
  return player ? player.currentTime : null
}
