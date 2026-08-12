// Search across both sources at once.
//
// The local catalogue answers first because it is already in memory — results
// appear as you type, with no spinner — and Audius is merged in when the network
// comes back. Ordering puts Audius first: those tracks play in the background,
// so the more capable result is the one at the top.

import { useEffect, useRef, useState } from 'react'
import { FlatList, TextInput, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Search as SearchIcon } from 'lucide-react-native'
import type { Track } from '@core/types'
import { searchTracks } from '@core/audius'
import { searchLoaded } from '../../lib/catalog'
import { usePlayer } from '../../lib/player'
import { TrackMenu } from '../../ui/TrackMenu'
import { TrackRow } from '../../ui/TrackRow'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../../ui/theme'

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const { playTrack, track: current } = usePlayer()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [busy, setBusy] = useState(false)
  const [menuFor, setMenuFor] = useState<Track | null>(null)

  // Debounced, and every in-flight response is stamped with the query that
  // asked for it — otherwise a slow early request can land after a fast later
  // one and repaint the list with results for a query the user has moved on
  // from.
  const latest = useRef('')
  useEffect(() => {
    const term = q.trim()
    latest.current = term
    if (!term) {
      setResults([])
      setBusy(false)
      return
    }
    setBusy(true)
    const id = setTimeout(async () => {
      // Local catalogue first: it is already in memory, so results appear
      // before the network answers. Audius is merged in when it arrives.
      const local = searchLoaded(term)
      if (latest.current === term && local.length) setResults(local)
      try {
        const found = await searchTracks(term)
        if (latest.current !== term) return
        // Audius first (it streams in the background), then the catalogue,
        // de-duplicated by id.
        const seen = new Set(found.map((t) => t.id))
        setResults([...found, ...local.filter((t) => !seen.has(t.id))])
      } catch {
        if (latest.current === term) setResults(local)
      } finally {
        if (latest.current === term) setBusy(false)
      }
    }, 320)
    return () => clearTimeout(id)
  }, [q])

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.field}>
        <SearchIcon size={17} color={color.dimmer} strokeWidth={2.4} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Songs, artists, playlists"
          placeholderTextColor={color.dimmer}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          selectionColor={color.accent}
          accessibilityLabel="Search"
        />
        {busy && <ActivityIndicator size="small" color={color.dim} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT + space.xl,
          paddingTop: space.sm,
        }}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            active={current?.id === item.id}
            onPress={() => playTrack(item, results)}
            onMore={() => setMenuFor(item)}
          />
        )}
        ListEmptyComponent={
          q.trim() && !busy ? (
            <View style={styles.empty}>
              <Txt variant="section">No results</Txt>
              <Txt variant="caption" tone="dim">
                Nothing matched "{q.trim()}".
              </Txt>
            </View>
          ) : !q.trim() ? (
            <View style={styles.empty}>
              <Txt variant="section">Find something to play</Txt>
              <Txt variant="caption" tone="dim">
                12,759 tracks in the catalogue, plus everything on Audius.
              </Txt>
            </View>
          ) : null
        }
      />

      <TrackMenu track={menuFor} onClose={() => setMenuFor(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  input: { flex: 1, color: color.text, fontFamily: 'Figtree_400Regular', fontSize: 15 },
  empty: { alignItems: 'center', gap: 5, paddingTop: 90, paddingHorizontal: space.xl },
})
