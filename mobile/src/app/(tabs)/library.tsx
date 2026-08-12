// Library — the web app's Playlists section. Reads the same cloud playlists
// through core/cloud.ts, so anything saved on desktop shows up here.

import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, View, StyleSheet, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ListMusic, Heart } from 'lucide-react-native'
import { cloudFetchPlaylists, type CloudPlaylist } from '@core/cloud'
import { supabaseEnabled } from '../../lib/supabase'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../../ui/theme'

export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const [playlists, setPlaylists] = useState<CloudPlaylist[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!supabaseEnabled) return
    try {
      setPlaylists(await cloudFetchPlaylists())
    } catch {
      setPlaylists([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Txt variant="display">Library</Txt>
      </View>

      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{
          paddingBottom: MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT + space.xl,
        }}
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
        ListHeaderComponent={
          <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={[styles.icon, { backgroundColor: color.accentWash }]}>
              <Heart size={19} color={color.accent} fill={color.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyMed">Liked songs</Txt>
              <Txt variant="caption" tone="dim">
                Synced with your account
              </Txt>
            </View>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.icon}>
              <ListMusic size={19} color={color.dim} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyMed" numberOfLines={1}>
                {item.name}
              </Txt>
              <Txt variant="caption" tone="dim">
                Playlist
              </Txt>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Txt variant="section">
              {supabaseEnabled ? 'No playlists yet' : 'Sign in to sync'}
            </Txt>
            <Txt variant="caption" tone="dim" style={{ textAlign: 'center' }}>
              {supabaseEnabled
                ? 'Playlists you save on any device show up here.'
                : 'Add your Supabase keys to .env to enable cloud sync.'}
            </Txt>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  head: { paddingHorizontal: space.lg, paddingBottom: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  pressed: { backgroundColor: color.panel },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.panel,
  },
  empty: { alignItems: 'center', gap: 5, paddingTop: 70, paddingHorizontal: space.xl },
})
