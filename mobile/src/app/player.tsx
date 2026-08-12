// Now Playing. Presented as a modal so it slides over whatever tab you were on
// and dismisses back to it — the phone equivalent of the web app's expanded
// player.
//
// This screen is where the two-engine design stops being an implementation
// detail: a YouTube track shows its video, because the embed's terms require it
// stay visible and Play review looks for exactly that. Rather than apologise for
// it, the screen states the trade plainly under the video.

import { useEffect, useRef, useState } from 'react'
import { Pressable, View, StyleSheet, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe'
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Headphones, Heart, ListMusic } from 'lucide-react-native'
import { usePlayer, type PlaybackEngine } from '../lib/player'
import { useLikes } from '../lib/likes'
import { SeekBar } from '../ui/SeekBar'
import { Txt } from '../ui/Txt'
import { color, radius, space } from '../ui/theme'

export default function PlayerScreen() {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { track, isPlaying, positionSec, toggle, next, prev, seek, needsVideo, setPlaying, setPosition, registerEngine } =
    usePlayer()
  const { isLiked, toggle: toggleLike } = useLikes()
  const ytRef = useRef<YoutubeIframeRef>(null)

  // The embed engine exists only while this screen is mounted — the video has to
  // stay on screen to play at all. Transport is driven by the `play` prop rather
  // than imperative calls, so play/pause here are deliberately no-ops; seek is
  // the only thing the ref has to do.
  useEffect(() => {
    if (!needsVideo) return
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
    return () => {
      registerEngine('embed', null)
      // Closing this screen genuinely stops a video track, so say so. Leaving
      // isPlaying true would show the mini player mid-song with nothing playing.
      setPlaying(false)
    }
  }, [needsVideo, registerEngine, setPlaying])

  // Position comes from the embed while it owns playback; the native player is
  // reset during a video track and has nothing to report.
  useEffect(() => {
    if (!needsVideo || !isPlaying) return
    const id = setInterval(() => {
      void ytRef.current?.getCurrentTime().then((t) => {
        if (typeof t === 'number') setPosition(t)
      })
    }, 1000)
    return () => clearInterval(id)
  }, [needsVideo, isPlaying, setPosition])

  if (!track) {
    router.back()
    return null
  }

  const liked = isLiked(track.id)
  const artSize = Math.min(width - space.xl * 2, 380)
  const pct = track.duration > 0 ? Math.min(1, positionSec / track.duration) : 0

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Close player"
        >
          <ChevronDown size={26} color={color.text} />
        </Pressable>
        <Txt variant="micro" tone="dim">
          {needsVideo ? 'PLAYING VIDEO' : 'NOW PLAYING'}
        </Txt>
        <Pressable
          onPress={() => router.push('/queue')}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Show queue"
        >
          <ListMusic size={22} color={color.dim} />
        </Pressable>
      </View>

      <View style={styles.stage}>
        {needsVideo ? (
          <View style={[styles.video, { width: artSize, height: (artSize * 9) / 16 }]}>
            <YoutubePlayer
              ref={ytRef}
              height={(artSize * 9) / 16}
              width={artSize}
              videoId={track.id}
              play={isPlaying}
              onChangeState={(s: string) => {
                if (s === 'paused') setPlaying(false)
                if (s === 'playing') setPlaying(true)
                if (s === 'ended') next()
              }}
              initialPlayerParams={{ controls: false, modestbranding: true, rel: false }}
              webViewProps={{ allowsInlineMediaPlayback: true }}
            />
          </View>
        ) : (
          <Image
            source={track.artworkLarge || track.artwork}
            placeholder={track.artwork}
            style={[styles.art, { width: artSize, height: artSize }]}
            contentFit="cover"
            transition={220}
          />
        )}
      </View>

      <View style={styles.meta}>
        <Txt variant="title" numberOfLines={2}>
          {track.title}
        </Txt>
        <Txt variant="body" tone="dim" numberOfLines={1}>
          {track.artist}
        </Txt>
      </View>

      {needsVideo && (
        <View style={styles.note}>
          <Txt variant="caption" tone="dim">
            YouTube tracks play with the video on screen and pause when you leave
            the app. Audius tracks keep playing in the background.
          </Txt>
        </View>
      )}

      <View style={styles.scrub}>
        <SeekBar positionSec={positionSec} durationSec={track.duration} onSeek={seek} />
        <View style={styles.times}>
          <Txt variant="caption" tone="dimmer">
            {fmt(positionSec)}
          </Txt>
          <Txt variant="caption" tone="dimmer">
            {fmt(track.duration)}
          </Txt>
        </View>
      </View>

      <View style={styles.transport}>
        <Pressable
          onPress={() => toggleLike(track)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Remove from liked songs' : 'Like this song'}
        >
          <Heart
            size={22}
            color={liked ? color.accent : color.dimmer}
            fill={liked ? color.accent : 'transparent'}
          />
        </Pressable>

        <Pressable onPress={prev} hitSlop={12} accessibilityLabel="Previous track">
          <SkipBack size={30} color={color.text} fill={color.text} />
        </Pressable>

        <Pressable onPress={toggle} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
          <LinearGradient
            colors={[...color.playGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playBtn}
          >
            {isPlaying ? (
              <Pause size={28} color={color.accentFg} fill={color.accentFg} />
            ) : (
              <Play size={28} color={color.accentFg} fill={color.accentFg} style={{ marginLeft: 3 }} />
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={next} hitSlop={12} accessibilityLabel="Next track">
          <SkipForward size={30} color={color.text} fill={color.text} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/listen')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Listen along"
        >
          <Headphones size={22} color={color.dimmer} />
        </Pressable>
      </View>
    </View>
  )
}

function fmt(sec: number): string {
  if (!sec || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground, paddingHorizontal: space.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.lg,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  art: { borderRadius: radius.xl, backgroundColor: color.panel },
  video: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  meta: { gap: 5, paddingBottom: space.md },
  note: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    marginBottom: space.md,
  },
  scrub: { gap: 6, paddingBottom: space.lg },
  scrubTrack: { height: 4, borderRadius: 2, backgroundColor: color.panelStrong, justifyContent: 'center' },
  scrubFill: { height: 4, borderRadius: 2, backgroundColor: color.accent },
  scrubKnob: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: color.accent,
    marginLeft: -5,
    shadowColor: color.accent,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.xxl,
  },
  playBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
})
