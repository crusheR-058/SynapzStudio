// One artist's full catalogue.

import { useEffect, useState } from 'react'
import { FlatList, Pressable, View, StyleSheet, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Play, Shuffle } from 'lucide-react-native'
import type { Track } from '@core/types'
import { tracksByArtist } from '../../lib/catalog'
import { usePlayer } from '../../lib/player'
import { TrackRow } from '../../ui/TrackRow'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT } from '../../ui/theme'

export default function ArtistScreen() {
  const { name } = useLocalSearchParams<{ name: string }>()
  const artist = decodeURIComponent(name ?? '')
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { playTrack, track: current } = usePlayer()
  const [tracks, setTracks] = useState<Track[] | null>(null)

  useEffect(() => {
    void tracksByArtist(artist)
      .then(setTracks)
      .catch(() => setTracks([]))
  }, [artist])

  const cover = tracks?.find((t) => t.artwork)?.artwork

  return (
    <View style={styles.screen}>
      <FlatList
        data={tracks ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + space.xxl }}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
              <LinearGradient
                colors={['transparent', 'rgba(10,10,12,0.75)', color.ground]}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.heroInner, { paddingTop: insets.top + space.xxl }]}>
                <Image source={cover} style={styles.avatar} contentFit="cover" transition={200} />
                <Txt variant="display" numberOfLines={2} style={{ textAlign: 'center' }}>
                  {artist}
                </Txt>
                <Txt variant="caption" tone="dim">
                  {tracks ? `${tracks.length} songs` : 'Loading…'}
                </Txt>
              </View>
            </View>

            {!!tracks?.length && (
              <View style={styles.actions}>
                <Pressable
                  style={styles.playAll}
                  onPress={() => playTrack(tracks[0], tracks)}
                  accessibilityRole="button"
                  accessibilityLabel={`Play all songs by ${artist}`}
                >
                  <Play size={17} color={color.accentFg} fill={color.accentFg} />
                  <Txt variant="label" style={{ color: color.accentFg }}>
                    Play
                  </Txt>
                </Pressable>
                <Pressable
                  style={styles.shuffle}
                  onPress={() => {
                    const shuffled = shuffle(tracks)
                    playTrack(shuffled[0], shuffled)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Shuffle songs by ${artist}`}
                >
                  <Shuffle size={17} color={color.text} />
                  <Txt variant="label">Shuffle</Txt>
                </Pressable>
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
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {tracks === null ? (
              <ActivityIndicator color={color.accent} />
            ) : (
              <Txt variant="caption" tone="dim">
                No songs found for this artist.
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

/** Fisher-Yates on a copy — never reorder the caller's array in place. */
function shuffle(list: Track[]): Track[] {
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
  avatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: color.panelStrong,
    marginBottom: space.sm,
  },
  actions: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.lg },
  playAll: {
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
  empty: { alignItems: 'center', paddingTop: space.xl },
})
