// Horizontal rail of artwork cards — the mobile shape of the web app's grid
// sections. A rail rather than a wrapped grid because a phone fits two cards
// across, and a two-up grid of six rows buries everything below it.

import { FlatList, Pressable, View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import type { Track } from '@core/types'
import { Txt } from './Txt'
import { color, radius, space } from './theme'

const CARD = 138

export function Rail({
  title,
  subtitle,
  tracks,
  onPressTrack,
}: {
  title: string
  subtitle?: string
  tracks: Track[]
  onPressTrack: (t: Track, list: Track[]) => void
}) {
  if (!tracks.length) return null

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Txt variant="section">{title}</Txt>
        {subtitle && (
          <Txt variant="caption" tone="dim">
            {subtitle}
          </Txt>
        )}
      </View>

      <FlatList
        horizontal
        data={tracks}
        keyExtractor={(t) => t.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railPad}
        ItemSeparatorComponent={() => <View style={{ width: space.md }} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => onPressTrack(item, tracks)}
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.title} by ${item.artist}`}
          >
            <Image
              source={item.artwork}
              style={styles.art}
              contentFit="cover"
              transition={160}
              recyclingKey={item.id}
            />
            <Txt variant="label" numberOfLines={1}>
              {item.title}
            </Txt>
            <Txt variant="caption" tone="dim" numberOfLines={1}>
              {item.artist}
            </Txt>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  head: { paddingHorizontal: space.lg, gap: 2 },
  railPad: { paddingHorizontal: space.lg },
  card: { width: CARD, gap: 5 },
  art: {
    width: CARD,
    height: CARD,
    borderRadius: radius.lg,
    backgroundColor: color.panel,
    marginBottom: 3,
  },
})
