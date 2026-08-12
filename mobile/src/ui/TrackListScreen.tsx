// Shared shape for every "a list of tracks with a header" screen — liked songs,
// a playlist, an artist. They differ only in where the tracks come from and what
// the header says, so they share one component rather than three near-copies
// drifting apart.

import type { ReactNode } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Play, Shuffle } from 'lucide-react-native'
import type { Track } from '@core/types'
import { usePlayer } from '../lib/player'
import { TrackRow } from './TrackRow'
import { Txt } from './Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT } from './theme'

export function TrackListScreen({
  title,
  subtitle,
  tracks,
  artworkUrl,
  accent,
  headerRight,
  emptyText = 'Nothing here yet.',
  onTrackMore,
}: {
  title: string
  subtitle?: string
  /** null means still loading — an empty array means genuinely empty. */
  tracks: Track[] | null
  artworkUrl?: string
  /** Fallback tile colour when there is no artwork. */
  accent?: string
  headerRight?: ReactNode
  emptyText?: string
  onTrackMore?: (track: Track) => void
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { playTrack, track: current } = usePlayer()
  const cover = artworkUrl || tracks?.find((t) => t.artwork)?.artwork

  return (
    <View style={styles.screen}>
      <FlatList
        data={tracks ?? []}
        keyExtractor={(t, i) => `${t.id}:${i}`}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + space.xxl }}
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              {cover ? (
                <Image
                  source={cover}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={30}
                />
              ) : (
                <View
                  style={[StyleSheet.absoluteFill, { backgroundColor: accent ?? color.panelStrong }]}
                />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(10,10,12,0.7)', color.ground]}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.heroInner, { paddingTop: insets.top + space.xxl }]}>
                <Image
                  source={cover}
                  style={[styles.art, !cover && { backgroundColor: accent ?? color.panelStrong }]}
                  contentFit="cover"
                  transition={200}
                />
                <Txt variant="display" numberOfLines={2} style={styles.center}>
                  {title}
                </Txt>
                <Txt variant="caption" tone="dim">
                  {tracks === null ? 'Loading…' : (subtitle ?? countLabel(tracks.length))}
                </Txt>
              </View>
            </View>

            {!!tracks?.length && (
              <View style={styles.actions}>
                <Pressable
                  style={styles.play}
                  onPress={() => playTrack(tracks[0], tracks)}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${title}`}
                >
                  <Play size={17} color={color.accentFg} fill={color.accentFg} />
                  <Txt variant="label" style={{ color: color.accentFg }}>
                    Play
                  </Txt>
                </Pressable>
                <Pressable
                  style={styles.shuffle}
                  onPress={() => {
                    const s = shuffle(tracks)
                    playTrack(s[0], s)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Shuffle ${title}`}
                >
                  <Shuffle size={17} color={color.text} />
                  <Txt variant="label">Shuffle</Txt>
                </Pressable>
                {headerRight}
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            active={current?.id === item.id}
            onPress={() => playTrack(item, tracks ?? [item])}
            onMore={onTrackMore ? () => onTrackMore(item) : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {tracks === null ? (
              <ActivityIndicator color={color.accent} />
            ) : (
              <Txt variant="caption" tone="dim" style={styles.center}>
                {emptyText}
              </Txt>
            )}
          </View>
        }
      />

      <Pressable
        onPress={() => router.back()}
        style={[styles.back, { top: insets.top + space.sm }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <ChevronLeft size={24} color={color.text} />
      </Pressable>
    </View>
  )
}

function countLabel(n: number): string {
  return `${n} ${n === 1 ? 'song' : 'songs'}`
}

/** Fisher-Yates on a copy — never reorder the caller's array in place. */
export function shuffle<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  hero: { height: 300, justifyContent: 'flex-end', backgroundColor: color.panel },
  heroInner: { alignItems: 'center', gap: 6, paddingBottom: space.lg, paddingHorizontal: space.xl },
  art: {
    width: 150,
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: color.panelStrong,
    marginBottom: space.sm,
  },
  center: { textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  shuffle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  back: {
    position: 'absolute',
    left: space.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,12,0.55)',
  },
  empty: { alignItems: 'center', paddingTop: space.xl, paddingHorizontal: space.xl },
})
