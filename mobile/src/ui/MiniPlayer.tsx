// The persistent player above the tab bar — mobile's answer to the web app's
// bottom player bar. Tapping it opens the full Now Playing screen.
//
// It carries a hairline progress line rather than a scrubber: at this height a
// draggable track is a mis-tap waiting to happen, and the full screen is one tap
// away for anyone who wants to seek.

import { Pressable, View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Play, Pause, SkipForward, Smartphone } from 'lucide-react-native'
import { usePlayer } from '../lib/player'
import { Txt } from './Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT } from './theme'

export function MiniPlayer() {
  const { track, isPlaying, positionSec, toggle, next, needsVideo } = usePlayer()
  const router = useRouter()

  if (!track) return null

  const pct = track.duration > 0 ? Math.min(1, positionSec / track.duration) : 0

  return (
    <View style={styles.wrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/player')}
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${track.title}. Open player.`}
      >
        <Image source={track.artwork} style={styles.art} contentFit="cover" transition={140} />

        <View style={styles.meta}>
          <Txt variant="label" numberOfLines={1}>
            {track.title}
          </Txt>
          <View style={styles.sub}>
            {/* Says out loud that this one stops when the screen locks, rather
                than letting the user discover it by locking the phone. */}
            {needsVideo && <Smartphone size={10} color={color.dimmer} strokeWidth={2.5} />}
            <Txt variant="caption" tone="dim" numberOfLines={1} style={styles.artist}>
              {needsVideo ? 'Video · plays in app' : track.artist}
            </Txt>
          </View>
        </View>

        <Pressable
          onPress={toggle}
          hitSlop={12}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={19} color={color.text} fill={color.text} />
          ) : (
            <Play size={19} color={color.text} fill={color.text} />
          )}
        </Pressable>

        <Pressable
          onPress={next}
          hitSlop={12}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel="Next track"
        >
          <SkipForward size={18} color={color.dim} fill={color.dim} />
        </Pressable>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: color.window,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairlineLit,
  },
  progressTrack: { height: 2, backgroundColor: color.panelStrong },
  progressFill: { height: 2, backgroundColor: color.accent },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
  },
  art: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: color.panel },
  meta: { flex: 1, gap: 2 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  artist: { flex: 1 },
  btn: { padding: 6 },
})
