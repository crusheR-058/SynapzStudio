// Chooses an audio backend at runtime and keeps the UI's position in step with
// it. Renders nothing.
//
// react-native-track-player is tried first: it is the only one of the two with a
// media session, so it gets lockscreen and notification transport. It is also a
// legacy-architecture module on a New-Architecture-only SDK, so it may not start
// at all. Rather than ship an app that is silently broken on some devices, a
// failed setup falls back to expo-audio — background audio still works, only the
// lockscreen buttons are lost.
//
// The two progress readers live in separate child components because their hooks
// cannot be called conditionally, and calling TrackPlayer's when the native
// module never initialised throws.

import { useEffect, useState } from 'react'
import { useProgress } from 'react-native-track-player'
import { usePlayer } from './player'
import { audioEngine, ensurePlayer } from './audioEngine'
import { expoAudioEngine, expoAudioEnded, expoAudioPosition } from './expoAudioEngine'

type Backend = 'trackplayer' | 'expo-audio'

export function AudioHost() {
  const { registerEngine } = usePlayer()
  const [backend, setBackend] = useState<Backend | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await ensurePlayer()
        if (cancelled) return
        registerEngine('audio', audioEngine)
        setBackend('trackplayer')
      } catch (err) {
        if (cancelled) return
        console.warn(
          '[synapz] track-player unavailable, falling back to expo-audio ' +
            '(background audio keeps working; lockscreen controls are lost):',
          err,
        )
        registerEngine('audio', expoAudioEngine)
        setBackend('expo-audio')
      }
    })()
    return () => {
      cancelled = true
      registerEngine('audio', null)
    }
  }, [registerEngine])

  if (backend === 'trackplayer') return <TrackPlayerProgress />
  if (backend === 'expo-audio') return <ExpoAudioProgress />
  return null
}

function TrackPlayerProgress() {
  const { setPosition, needsVideo } = usePlayer()
  const { position } = useProgress(500)

  useEffect(() => {
    // Only while this engine owns playback. During a YouTube track the native
    // player is reset and reports 0, which would yank the bar back to the start
    // twice a second.
    if (!needsVideo) setPosition(position)
  }, [position, needsVideo, setPosition])

  return null
}

function ExpoAudioProgress() {
  const { setPosition, needsVideo, isPlaying, next } = usePlayer()

  useEffect(() => {
    if (needsVideo || !isPlaying) return
    const id = setInterval(() => {
      const pos = expoAudioPosition()
      if (pos != null) setPosition(pos)
      // expo-audio has no queue and no end-of-track event, so the app has to
      // notice for itself and advance.
      if (expoAudioEnded()) next()
    }, 500)
    return () => clearInterval(id)
  }, [needsVideo, isPlaying, setPosition, next])

  return null
}
