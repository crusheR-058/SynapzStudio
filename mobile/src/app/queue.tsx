// The queue. Reachable from the player, and the only place that shows what is
// actually coming next — which matters more here than on desktop, because
// "Play next" from the track menu is otherwise invisible.

import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronDown } from 'lucide-react-native'
import { usePlayer } from '../lib/player'
import { TrackRow } from '../ui/TrackRow'
import { Txt } from '../ui/Txt'
import { color, space } from '../ui/theme'

export default function QueueScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { queue, index, jumpTo, track } = usePlayer()

  const upcoming = index >= 0 ? queue.slice(index + 1) : queue

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={14} accessibilityLabel="Close queue">
          <ChevronDown size={26} color={color.text} />
        </Pressable>
        <Txt variant="micro" tone="dim">
          QUEUE
        </Txt>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={(t, i) => `${t.id}:${i}`}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListHeaderComponent={
          track ? (
            <View style={styles.section}>
              <Txt variant="micro" tone="dim">
                NOW PLAYING
              </Txt>
              <TrackRow track={track} active onPress={() => router.back()} />
              {upcoming.length > 0 && (
                <Txt variant="micro" tone="dim" style={styles.next}>
                  NEXT UP · {upcoming.length}
                </Txt>
              )}
            </View>
          ) : null
        }
        renderItem={({ item, index: rowIndex }) => (
          <TrackRow
            track={item}
            // Offset back into the real queue: this list starts after the cursor.
            // Using the row's own index rather than indexOf, which would pick the
            // first copy when a track appears twice.
            onPress={() => jumpTo(index + 1 + rowIndex)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Txt variant="caption" tone="dim">
              Nothing queued. Use “Play next” from any track's ⋮ menu.
            </Txt>
          </View>
        }
      />
    </View>
  )
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
  section: { gap: space.xs },
  next: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: space.xl },
})
