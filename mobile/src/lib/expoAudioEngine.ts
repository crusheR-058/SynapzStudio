// Fallback audio engine, built on expo-audio.
//
// It exists because react-native-track-player 4.1.2 is a legacy-architecture
// module and Expo SDK 57 is New Architecture only. RN's interop layer may carry
// it; if it doesn't, this takes over and the app still plays music in the
// background instead of failing outright.
//
// What is lost when it does take over: expo-audio has no media session, so there
// are no lockscreen or notification transport buttons. Audio keeps playing when
// the screen locks — you just have to return to the app to change track. That is
// a real downgrade, which is why this is the fallback and not the default.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import type { Track } from '@core/types'
import type { PlaybackEngine } from './player'

let player: AudioPlayer | null = null
let configured = false

async function ensureMode(): Promise<void> {
  if (configured) return
  await setAudioModeAsync({
    playsInSilentMode: true,
    // The whole reason this engine is acceptable at all.
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  })
  configured = true
}

function release(): void {
  if (!player) return
  try {
    player.remove()
  } catch {
    /* already gone */
  }
  player = null
}

export const expoAudioEngine: PlaybackEngine = {
  backgroundCapable: true,

  async load(track: Track) {
    if (!track.streamUrl) throw new Error(`Track ${track.id} has no stream URL`)
    await ensureMode()
    // A fresh player per track: reusing one across sources leaks the previous
    // stream's buffered state and occasionally resumes at the old position.
    release()
    player = createAudioPlayer({ uri: track.streamUrl })
  },

  async play() {
    player?.play()
  },

  async pause() {
    player?.pause()
  },

  async seek(sec: number) {
    await player?.seekTo(Math.max(0, sec))
  },

  async stop() {
    release()
  },
}

/** Current position in seconds, or null when nothing is loaded. */
export function expoAudioPosition(): number | null {
  return player ? player.currentTime : null
}

/** True once the track has run out — the app advances its own queue on this. */
export function expoAudioEnded(): boolean {
  if (!player) return false
  const { duration, currentTime, playing } = player
  return !playing && duration > 0 && currentTime >= duration - 0.35
}
