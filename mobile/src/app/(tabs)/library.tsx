// Library — sign-in, liked songs, and cloud playlists.
//
// Liked songs is listed whether or not you are signed in, because liking works
// locally. Playlists need an account, so the sign-in prompt sits with them
// rather than gating the whole tab.

import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Heart, ListMusic, LogOut, Plus } from 'lucide-react-native'
import { cloudCreatePlaylist, cloudFetchPlaylists, type CloudPlaylist } from '@core/cloud'
import { useAuth } from '../../lib/auth'
import { useLikes } from '../../lib/likes'
import { supabaseEnabled } from '../../lib/supabase'
import { Prompt } from '../../ui/Prompt'
import { Txt } from '../../ui/Txt'
import { color, radius, space, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../../ui/theme'

export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, loading, signIn, signOut } = useAuth()
  const { likes } = useLikes()
  const [playlists, setPlaylists] = useState<CloudPlaylist[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [naming, setNaming] = useState(false)

  const load = useCallback(async () => {
    if (!user) {
      setPlaylists([])
      return
    }
    try {
      setPlaylists(await cloudFetchPlaylists())
    } catch {
      setPlaylists([])
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  // A playlist created or deleted on another screen should be reflected on
  // return, not only after a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const onSignIn = async () => {
    setBusy(true)
    try {
      await signIn()
    } catch (err) {
      Alert.alert('Sign-in failed', String((err as Error)?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  const onCreate = async (name: string) => {
    setNaming(false)
    try {
      await cloudCreatePlaylist(name)
      await load()
    } catch {
      Alert.alert("Couldn't create playlist", 'Check your connection and try again.')
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Txt variant="display">Library</Txt>
        {user ? (
          <Pressable onPress={signOut} hitSlop={10} accessibilityLabel="Sign out">
            <LogOut size={19} color={color.dimmer} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT + space.xl }}
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
          <View>
            {user && (
              <View style={styles.account}>
                {user.avatar ? (
                  <Image source={user.avatar} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Txt variant="label">{user.name.slice(0, 1).toUpperCase()}</Txt>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyMed" numberOfLines={1}>
                    {user.name}
                  </Txt>
                  <Txt variant="caption" tone="dim" numberOfLines={1}>
                    {user.email}
                  </Txt>
                </View>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push('/liked')}
              accessibilityRole="button"
              accessibilityLabel={`Liked songs, ${likes.length} tracks`}
            >
              <View style={[styles.icon, { backgroundColor: color.accentWash }]}>
                <Heart size={19} color={color.accent} fill={color.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyMed">Liked songs</Txt>
                <Txt variant="caption" tone="dim">
                  {likes.length === 0
                    ? 'Tap the heart on any track'
                    : `${likes.length} ${likes.length === 1 ? 'song' : 'songs'}${user ? ' · synced' : ' · on this device'}`}
                </Txt>
              </View>
            </Pressable>

            {user && (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => setNaming(true)}
                accessibilityRole="button"
                accessibilityLabel="New playlist"
              >
                <View style={styles.icon}>
                  <Plus size={19} color={color.dim} />
                </View>
                <Txt variant="bodyMed" tone="dim">
                  New playlist
                </Txt>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(`/playlist/${item.id}?name=${encodeURIComponent(item.name)}`)}
            accessibilityRole="button"
            accessibilityLabel={`Playlist ${item.name}`}
          >
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
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={color.accent} />
            </View>
          ) : user ? (
            <View style={styles.empty}>
              <Txt variant="caption" tone="dim">
                No playlists yet. Anything you save on desktop appears here.
              </Txt>
            </View>
          ) : (
            <View style={styles.signin}>
              <Txt variant="section">Sign in to sync</Txt>
              <Txt variant="caption" tone="dim" style={styles.copy}>
                {supabaseEnabled
                  ? 'Your playlists, likes and history follow you between phone and desktop.'
                  : 'Cloud sync is not configured in this build — add your Supabase keys to .env.'}
              </Txt>
              {supabaseEnabled && (
                <Pressable
                  style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
                  onPress={onSignIn}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={color.accentFg} />
                  ) : (
                    <Txt variant="label" style={{ color: color.accentFg }}>
                      Continue with Google
                    </Txt>
                  )}
                </Pressable>
              )}
            </View>
          )
        }
      />

      <Prompt
        visible={naming}
        title="New playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onCancel={() => setNaming(false)}
        onSubmit={onCreate}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.panelStrong },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
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
  empty: { alignItems: 'center', paddingTop: space.xl, paddingHorizontal: space.xl },
  signin: { alignItems: 'center', gap: space.sm, paddingTop: 50, paddingHorizontal: space.xl },
  copy: { textAlign: 'center', lineHeight: 19 },
  cta: {
    marginTop: space.sm,
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    minWidth: 220,
    alignItems: 'center',
  },
})
