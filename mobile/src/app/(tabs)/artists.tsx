// Artists — the web app's flagship view: 185 artists across 11 scenes, grouped
// by scene, each opening a full track list.

import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { loadIndianArtists, loadScenes, loadTracks, type IndianArtist } from '../../lib/catalog'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../../ui/theme'

export default function ArtistsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [artists, setArtists] = useState<IndianArtist[]>([])
  const [scenes, setScenes] = useState<string[]>([])
  const [scene, setScene] = useState<string | null>(null)
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [a, s, tracks] = await Promise.all([loadIndianArtists(), loadScenes(), loadTracks('indian')])
        setArtists(a)
        setScenes(s)
        setScene(s[0] ?? null)
        // One pass to pick a cover per artist. The web app learned this the hard
        // way: a .find() per card over 7,336 tracks re-ran on every keystroke.
        const first = new Map<string, string>()
        for (const t of tracks) {
          const key = t.artist.trim().toLowerCase()
          if (!first.has(key) && t.artwork) first.set(key, t.artwork)
        }
        setCovers(first)
      } catch {
        setError(true)
      }
    })()
  }, [])

  const shown = useMemo(
    () => (scene ? artists.filter((a) => a.scene === scene) : artists),
    [artists, scene],
  )

  if (error) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Txt variant="section">Couldn't load the catalogue</Txt>
        <Txt variant="caption" tone="dim">
          Check your connection and reopen this tab.
        </Txt>
      </View>
    )
  }

  if (!artists.length) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={color.accent} />
        <Txt variant="caption" tone="dim">
          Loading 7,336 tracks…
        </Txt>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Txt variant="display">Artists</Txt>
        <Txt variant="caption" tone="dim">
          {artists.length} artists · {scenes.length} scenes
        </Txt>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scenes}
        style={styles.scenesRow}
      >
        {scenes.map((s) => {
          const on = s === scene
          return (
            <Pressable
              key={s}
              onPress={() => setScene(s)}
              style={[styles.scene, on && styles.sceneOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Txt variant="label" tone={on ? 'text' : 'dim'}>
                {s}
              </Txt>
            </Pressable>
          )
        })}
      </ScrollView>

      <FlatList
        data={shown}
        keyExtractor={(a) => a.name}
        numColumns={2}
        columnWrapperStyle={styles.col}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT + space.xl,
          gap: space.lg,
        }}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(`/artist/${encodeURIComponent(item.name)}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.count} songs`}
          >
            <Image
              source={covers.get(item.name.trim().toLowerCase())}
              style={styles.avatar}
              contentFit="cover"
              transition={160}
            />
            <Txt variant="label" numberOfLines={1}>
              {item.name}
            </Txt>
            <Txt variant="caption" tone="dim">
              {item.count} songs
            </Txt>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.sm },
  head: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: 2 },
  scenesRow: { flexGrow: 0, marginBottom: space.lg },
  scenes: { paddingHorizontal: space.lg, gap: space.sm },
  scene: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  sceneOn: { backgroundColor: color.accentWash, borderColor: color.accent },
  col: { gap: space.lg },
  card: { flex: 1, gap: 4 },
  avatar: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: color.panel,
    marginBottom: 4,
  },
})
