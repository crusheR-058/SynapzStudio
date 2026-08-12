// Search across all three sources at once.
//
// The local catalogue answers first because it is already in memory — results
// appear as you type, with no spinner — then Audius and YouTube are merged in as
// each returns. YouTube goes through the hosted /yt/search proxy, never Google
// directly: the project's Data API key is HTTP-referrer-restricted and a native
// app has no referrer to send, so a direct call would 403 every time.
//
// Ordering is by capability, not by which answered first. Audius tracks play in
// the background with lockscreen controls, so they sit at the top; YouTube
// results play foreground-only with the video on screen, so they sit under a
// header that says so before anyone taps one.

import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Search as SearchIcon, Video } from 'lucide-react-native'
import type { Track } from '@core/types'
import { searchTracks } from '@core/audius'
import { searchYT } from '@core/youtube'
import { searchLoaded } from '../../lib/catalog'
import { usePlayer } from '../../lib/player'
import { TrackMenu } from '../../ui/TrackMenu'
import { TrackRow } from '../../ui/TrackRow'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../../ui/theme'

type Row =
  | { kind: 'header'; label: string; youtube?: boolean; id: string }
  | { kind: 'track'; track: Track; id: string }

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const { playTrack, track: current } = usePlayer()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [menuFor, setMenuFor] = useState<Track | null>(null)

  // Every in-flight response is stamped with the query that asked for it —
  // otherwise a slow early request lands after a fast later one and repaints the
  // list with results for a query the user has moved on from.
  const latest = useRef('')

  useEffect(() => {
    const term = q.trim()
    latest.current = term
    if (!term) {
      setRows([])
      setBusy(false)
      return
    }
    setBusy(true)

    const id = setTimeout(() => {
      const local = searchLoaded(term)
      // Paint the catalogue immediately; the network fills in behind it.
      if (latest.current === term) setRows(build(local, [], []))

      // allSettled, not all: one source failing must not blank the others.
      void Promise.allSettled([searchTracks(term), searchYT(term)]).then(([a, y]) => {
        if (latest.current !== term) return
        setRows(
          build(
            local,
            a.status === 'fulfilled' ? a.value : [],
            y.status === 'fulfilled' ? y.value : [],
          ),
        )
        setBusy(false)
      })
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
          placeholder="Songs, artists, anything"
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
        data={rows}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT + space.xl,
          paddingTop: space.sm,
        }}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View style={styles.header}>
              {item.youtube && <Video size={13} color={color.dimmer} strokeWidth={2.4} />}
              <Txt variant="micro" tone="dimmer">
                {item.label}
              </Txt>
            </View>
          ) : (
            <TrackRow
              track={item.track}
              active={current?.id === item.track.id}
              onPress={() => playTrack(item.track, tracksOf(rows))}
              onMore={() => setMenuFor(item.track)}
            />
          )
        }
        ListEmptyComponent={
          q.trim() && !busy ? (
            <View style={styles.empty}>
              <Txt variant="section">No results</Txt>
              <Txt variant="caption" tone="dim">
                Nothing matched “{q.trim()}”.
              </Txt>
            </View>
          ) : !q.trim() ? (
            <View style={styles.empty}>
              <Txt variant="section">Find something to play</Txt>
              <Txt variant="caption" tone="dim" style={{ textAlign: 'center' }}>
                12,759 tracks in the catalogue, plus everything on Audius and
                YouTube.
              </Txt>
            </View>
          ) : null
        }
      />

      <TrackMenu track={menuFor} onClose={() => setMenuFor(null)} />
    </View>
  )
}

/**
 * Merge the three sources into one sectioned list, de-duplicated by id so a
 * track present in both the catalogue and YouTube's results appears once — and
 * appears in the more capable section, since sections are filled in order.
 */
function build(local: Track[], audius: Track[], yt: Track[]): Row[] {
  const seen = new Set<string>()
  const rows: Row[] = []

  const section = (label: string, tracks: Track[], youtube = false) => {
    const fresh = tracks.filter((t) => !seen.has(t.id))
    if (!fresh.length) return
    rows.push({ kind: 'header', label, youtube, id: `h:${label}` })
    for (const t of fresh) {
      seen.add(t.id)
      rows.push({ kind: 'track', track: t, id: `t:${t.id}` })
    }
  }

  section('PLAYS IN THE BACKGROUND', audius)
  section('IN YOUR LIBRARY', local)
  section('VIDEO · PLAYS IN THE APP', yt, true)
  return rows
}

/** Flatten back to tracks so tapping a row queues the whole result set. */
function tracksOf(rows: Row[]): Track[] {
  return rows
    .filter((r): r is Extract<Row, { kind: 'track' }> => r.kind === 'track')
    .map((r) => r.track)
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  empty: { alignItems: 'center', gap: 5, paddingTop: 90, paddingHorizontal: space.xl },
})
