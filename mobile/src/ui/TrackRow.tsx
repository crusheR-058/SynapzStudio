// One track in a list — the mobile counterpart of the web app's track row.
//
// Two things are deliberate. The source badge appears ONLY on Audius tracks:
// they are the ones that keep playing when the screen locks, so the badge marks
// a real capability difference rather than decorating with a logo. And there is
// no YouTube mark at all — the same call the web app made when those icons came
// off the titles.

import { memo } from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { MoreVertical, Radio } from 'lucide-react-native'
import type { Track } from '@core/types'
import { Txt } from './Txt'
import { color, radius, space } from './theme'

export const TrackRow = memo(function TrackRow({
  track,
  index,
  active = false,
  onPress,
  onMore,
}: {
  track: Track
  index?: number
  active?: boolean
  onPress: () => void
  onMore?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title} by ${track.artist}`}
    >
      {index != null && (
        <Txt variant="caption" tone={active ? 'accent' : 'dimmer'} style={styles.index}>
          {index + 1}
        </Txt>
      )}

      <Image
        source={track.artwork}
        style={styles.art}
        contentFit="cover"
        transition={140}
        recyclingKey={track.id}
      />

      <View style={styles.meta}>
        <Txt
          variant="bodyMed"
          tone={active ? 'accent' : 'text'}
          numberOfLines={1}
        >
          {track.title}
        </Txt>
        <View style={styles.sub}>
          {track.source === 'audius' && (
            <View style={styles.badge}>
              <Radio size={9} color={color.dim} strokeWidth={2.5} />
              <Txt variant="micro" tone="dim">
                OFFLINE OK
              </Txt>
            </View>
          )}
          <Txt variant="caption" tone="dim" numberOfLines={1} style={styles.artist}>
            {track.artist}
          </Txt>
        </View>
      </View>

      <Txt variant="caption" tone="dimmer" style={styles.time}>
        {fmt(track.duration)}
      </Txt>

      {onMore && (
        <Pressable
          onPress={onMore}
          hitSlop={10}
          style={styles.more}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${track.title}`}
        >
          <MoreVertical size={17} color={color.dimmer} />
        </Pressable>
      )}
    </Pressable>
  )
})

function fmt(sec: number): string {
  if (!sec || sec < 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  pressed: { backgroundColor: color.panel },
  index: { width: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  art: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: color.panel },
  meta: { flex: 1, gap: 3 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  artist: { flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: color.panelStrong,
  },
  time: { fontVariant: ['tabular-nums'] },
  more: { padding: 2 },
})
