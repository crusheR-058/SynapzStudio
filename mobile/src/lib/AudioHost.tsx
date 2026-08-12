// Mounts the audio engine and keeps the UI's position in step with it.
// Renders nothing.
//
// Previously this chose between two backends at runtime, because
// react-native-track-player might not start. It cannot start — it does not
// compile against RN 0.86 — so it is gone, and with it the fallback machinery.
// One engine, no branch, no "which one did I get" question at runtime.

import { useEffect } from 'react'
import { usePlayer } from './player'
import { audioEngine, audioPosition, setOnEnded } from './audioEngine'

export function AudioHost() {
  const { registerEngine, setPosition, needsVideo, isPlaying, next } = usePlayer()

  useEffect(() => {
    registerEngine('audio', audioEngine)
    return () => registerEngine('audio', null)
  }, [registerEngine])

  // End-of-track advances the app's queue. Registered separately from the
  // engine so the callback always points at the current `next`.
  useEffect(() => {
    setOnEnded(next)
    return () => setOnEnded(null)
  }, [next])

  useEffect(() => {
    // Only while this engine owns playback. During a YouTube track the player is
    // released and reports nothing, and the embed reports its own position.
    if (needsVideo || !isPlaying) return
    const id = setInterval(() => {
      const pos = audioPosition()
      if (pos != null) setPosition(pos)
    }, 500)
    return () => clearInterval(id)
  }, [needsVideo, isPlaying, setPosition])

  return null
}
