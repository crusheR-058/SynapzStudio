// Home — the catalogue slices the web app puts in its sidebar (Bollywood,
// Hollywood, Podcasts) become chips here, with real music underneath.
//
// The rails are Audius-backed on purpose: those are the tracks that keep playing
// when the screen locks, so the first thing a new user hears is the app at its
// best rather than a video that stops the moment they switch apps.

import { useEffect, useState } from 'react'
import { ScrollView, View, RefreshControl, StyleSheet, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Clapperboard, Film, Podcast, Radio } from 'lucide-react-native'
import type { Track } from '@core/types'
import { fetchTrending, fetchUnderground } from '@core/audius'
import { usePlayer } from '../../lib/player'
import { Rail } from '../../ui/Rail'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../../ui/theme'

const SLICES = [
  { key: 'hindi', label: 'Bollywood', Icon: Clapperboard },
  { key: 'hollywood', label: 'Hollywood', Icon: Film },
  { key: 'podcasts', label: 'Podcasts', Icon: Podcast },
  { key: 'radio', label: 'Stations', Icon: Radio },
] as const

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const { playTrack } = usePlayer()
  const [trending, setTrending] = useState<Track[]>([])
  const [underground, setUnderground] = useState<Track[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      const [a, b] = await Promise.all([fetchTrending(), fetchUnderground()])
      setTrending(a)
      setUnderground(b)
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT + space.xl },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={color.dim}
          colors={[color.accent]}
          progressBackgroundColor={color.panel}
          onRefresh={async () => {
            setRefreshing(true)
            await load()
            setRefreshing(false)
          }}
        />
      }
    >
      <View style={styles.header}>
        <Txt variant="micro" tone="accent">
          SYNAPZ
        </Txt>
        <Txt variant="display">{greeting()}</Txt>
      </View>

      <View style={styles.chips}>
        {SLICES.map(({ key, label, Icon }) => (
          <Pressable
            key={key}
            style={({ pressed }) => [styles.chip, pressed && { backgroundColor: color.panelHover }]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Icon size={15} color={color.accent2} strokeWidth={2.2} />
            <Txt variant="label">{label}</Txt>
          </Pressable>
        ))}
      </View>

      {failed && (
        <View style={styles.notice}>
          <Txt variant="label">Couldn't reach Audius</Txt>
          <Txt variant="caption" tone="dim">
            Pull down to try again.
          </Txt>
        </View>
      )}

      <Rail
        title="Trending now"
        subtitle="Plays in the background"
        tracks={trending}
        onPressTrack={playTrack}
      />
      <Rail
        title="Underground"
        subtitle="Fresh from independent artists"
        tracks={underground}
        onPressTrack={playTrack}
      />
    </ScrollView>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Still up?'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { gap: space.xl },
  header: { paddingHorizontal: space.lg, gap: 4 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  notice: {
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    gap: 3,
  },
})
