// Browse one catalogue — Bollywood, Hollywood, Podcasts or Stations. These are
// slices of the same library, so they share a screen rather than each getting a
// near-identical one.

import { useEffect, useState } from 'react'
import { FlatList, Pressable, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Shuffle } from 'lucide-react-native'
import type { Track } from '@core/types'
import { loadTracks, type CatalogName } from '../../lib/catalog'
import { usePlayer } from '../../lib/player'
import { TrackMenu } from '../../ui/TrackMenu'
import { TrackRow } from '../../ui/TrackRow'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT } from '../../ui/theme'

const TITLES: Record<string, string> = {
  bollywood: 'Bollywood',
  hollywood: 'Hollywood',
  podcasts: 'Podcasts',
  stations: 'Stations',
  indian: 'Indian',
}

export default function BrowseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const name = (slug ?? 'bollywood') as CatalogName
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { playTrack, track: current } = usePlayer()
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [menuFor, setMenuFor] = useState<Track | null>(null)

  useEffect(() => {
    setTracks(null)
    void loadTracks(name)
      .then(setTracks)
      .catch(() => setTracks([]))
  }, [name])

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back">
          <ChevronLeft size={24} color={color.text} />
        </Pressable>
        <Txt variant="section">{TITLES[name] ?? 'Browse'}</Txt>
        <View style={{ width: 24 }} />
      </View>

      {tracks === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={color.accent} />
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          // These lists run to several thousand rows; without a fixed row height
          // FlatList has to measure every one it mounts, and the scroll stutters.
          getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
          initialNumToRender={12}
          windowSize={9}
          removeClippedSubviews
          contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + space.xxl }}
          ListHeaderComponent={
            tracks.length ? (
              <View style={styles.actions}>
                <Txt variant="caption" tone="dim">
                  {tracks.length.toLocaleString()} tracks
                </Txt>
                <Pressable
                  style={styles.shuffle}
                  onPress={() => {
                    const s = shuffle(tracks)
                    playTrack(s[0], s)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Shuffle all"
                >
                  <Shuffle size={15} color={color.text} />
                  <Txt variant="label">Shuffle</Txt>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              index={index}
              active={current?.id === item.id}
              onPress={() => playTrack(item, tracks)}
              onMore={() => setMenuFor(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Txt variant="caption" tone="dim">
                Nothing here yet.
              </Txt>
            </View>
          }
        />
      )}

      <TrackMenu track={menuFor} onClose={() => setMenuFor(null)} />
    </View>
  )
}

const ROW = 62

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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: space.xxl },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  shuffle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
})
