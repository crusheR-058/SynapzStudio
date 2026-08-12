// The YouTube player, mounted ONCE at the root of the app.
//
// It used to live inside the Now Playing screen, which made the app behave the
// way it did: 12,759 of the ~12,800 tracks are YouTube ids, so for almost every
// song, tapping it from a list registered no engine at all and played silence
// while the mini player claimed otherwise — and navigating away from the player
// screen unmounted the WebView and killed playback mid-song.
//
// Mounted here it survives navigation, so playback continues while you browse,
// and a tap anywhere in the app starts the music immediately. The frame moves
// and resizes between two slots rather than being remounted, because remounting
// reloads the video and restarts it from zero.
//
// It stays VISIBLE in both slots. That is deliberate, not an oversight: YouTube's
// IFrame Player API terms forbid hiding the player or playing it audio-only, and
// a hidden 1px WebView is exactly the pattern that gets an app pulled from Play.
// Audio still stops when the phone is locked — no embed can do otherwise.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe'
import { usePlayer, type PlaybackEngine } from './player'
import { color, radius, space, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../ui/theme'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface SlotApi {
  /** Where the Now Playing screen wants the video, in window coordinates. */
  rect: Rect | null
  claim: (r: Rect | null) => void
}

const SlotCtx = createContext<SlotApi>({ rect: null, claim: () => {} })

/** Used by the Now Playing screen to pull the video into its layout. */
export function useVideoSlot(): SlotApi {
  return useContext(SlotCtx)
}

export function VideoSlotProvider({ children }: { children: ReactNode }) {
  const [rect, setRect] = useState<Rect | null>(null)
  const claim = useCallback((r: Rect | null) => setRect(r), [])
  const value = useMemo(() => ({ rect, claim }), [rect, claim])
  return <SlotCtx.Provider value={value}>{children}</SlotCtx.Provider>
}

const DOCK_W = 132
const DOCK_H = Math.round((DOCK_W * 9) / 16)

export function VideoHost() {
  const { width, height } = useWindowDimensions()
  const { track, isPlaying, needsVideo, next, setPlaying, setPosition, registerEngine } = usePlayer()
  const { rect } = useVideoSlot()
  const ytRef = useRef<YoutubeIframeRef>(null)

  // Registered once, for the life of the app. Transport runs through the `play`
  // prop rather than imperative calls, so play/pause are deliberately no-ops;
  // seek is the only thing that needs the ref.
  useEffect(() => {
    const engine: PlaybackEngine = {
      backgroundCapable: false,
      async load() {},
      async play() {},
      async pause() {},
      async seek(sec: number) {
        ytRef.current?.seekTo(sec, true)
      },
      async stop() {},
    }
    registerEngine('embed', engine)
    return () => registerEngine('embed', null)
  }, [registerEngine])

  // Position comes from the embed while it owns playback.
  useEffect(() => {
    if (!needsVideo || !isPlaying) return
    const id = setInterval(() => {
      void ytRef.current?.getCurrentTime().then((t) => {
        if (typeof t === 'number') setPosition(t)
      })
    }, 1000)
    return () => clearInterval(id)
  }, [needsVideo, isPlaying, setPosition])

  if (!needsVideo || !track) return null

  const docked = !rect
  const frame = rect ?? {
    // Above the mini player, right-aligned — out of the way of list content but
    // plainly on screen.
    x: width - DOCK_W - space.md,
    y: height - MINI_PLAYER_HEIGHT - TAB_BAR_HEIGHT - DOCK_H - space.md,
    width: DOCK_W,
    height: DOCK_H,
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.frame,
        { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
        docked && styles.dockedFrame,
      ]}
    >
      <YoutubePlayer
        ref={ytRef}
        width={frame.width}
        height={frame.height}
        videoId={track.id}
        play={isPlaying}
        onChangeState={(s: string) => {
          if (s === 'paused') setPlaying(false)
          if (s === 'playing') setPlaying(true)
          if (s === 'ended') next()
        }}
        initialPlayerParams={{ controls: false, modestbranding: true, rel: false }}
        webViewProps={{
          allowsInlineMediaPlayback: true,
          // Without this the embed waits for a tap inside the WebView, so the
          // first track after launch sits silent until you poke the video.
          mediaPlaybackRequiresUserAction: false,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: '#000',
  },
  dockedFrame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineLit,
    // Lifted above the mini player and tab bar.
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
})
