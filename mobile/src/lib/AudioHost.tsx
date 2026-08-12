// Mounts the Audius engine and keeps the UI's position in step with the native
// player. Renders nothing — it exists so setup happens once, inside the React
// tree, without a screen having to own it.

import { useEffect } from 'react'
import { useProgress } from 'react-native-track-player'
import { usePlayer } from './player'
import { audioEngine, ensurePlayer } from './audioEngine'

export function AudioHost() {
  const { registerEngine, setPosition, needsVideo } = usePlayer()

  useEffect(() => {
    // Warm the native player up front so the first tap doesn't pay for setup.
    // A failure here is not fatal: the engine calls ensurePlayer() again, and
    // the app still works for YouTube tracks either way.
    void ensurePlayer().catch(() => {})
    registerEngine('audio', audioEngine)
    return () => registerEngine('audio', null)
  }, [registerEngine])

  const { position } = useProgress(500)

  useEffect(() => {
    // Only while the audio engine owns playback. During a YouTube track the
    // native player is reset and reports 0, which would otherwise yank the
    // progress bar back to the start every half second.
    if (!needsVideo) setPosition(position)
  }, [position, needsVideo, setPosition])

  return null
}
