// Landing point for a shared room link: synapz://listen/<code>, and the same
// path on the web origin.
//
// Routed by expo-router from the file tree rather than intercepted with a
// Linking listener. That means it works identically whether the app was already
// running or the link cold-started it — the case a manual listener is most
// likely to miss, because the URL arrives before any listener has mounted.

import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Headphones } from 'lucide-react-native'
import type { RoomPreview } from '@core/listen'
import { useAuth } from '../../lib/auth'
import { useListenAlong } from '../../lib/listenAlong'
import { Txt } from '../../ui/Txt'
import { color, radius, space } from '../../ui/theme'

export default function JoinRoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const room = (code ?? '').trim().toLowerCase()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, loading, signIn } = useAuth()
  const { join, peek, busy } = useListenAlong()
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Show who is hosting before asking anyone to sign in — a bare "sign in to
  // continue" on an unexplained screen is what makes shared links get closed.
  useEffect(() => {
    if (!room) return
    void peek(room)
      .then((p) => {
        if (!p) setError('That room has ended or the link is wrong.')
        else setPreview(p)
      })
      .catch(() => setError('Could not reach the room.'))
  }, [room, peek])

  // Join once, automatically, as soon as there is a session. Guarded by a ref
  // because auth state can settle in more than one tick and a second joinRoom
  // would register a duplicate presence.
  const joined = useRef(false)
  useEffect(() => {
    if (!user || !preview || joined.current) return
    joined.current = true
    void join(room)
      .then(() => router.replace('/listen'))
      .catch((e) => {
        joined.current = false
        setError(String((e as Error)?.message ?? e))
      })
  }, [user, preview, room, join, router])

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.badge}>
        <Headphones size={26} color={color.accent} />
      </View>

      {error ? (
        <>
          <Txt variant="section">Can't join</Txt>
          <Txt variant="caption" tone="dim" style={styles.copy}>
            {error}
          </Txt>
          <Pressable style={styles.cta} onPress={() => router.replace('/')}>
            <Txt variant="label" style={{ color: color.accentFg }}>
              Go to Home
            </Txt>
          </Pressable>
        </>
      ) : !preview ? (
        <>
          <ActivityIndicator color={color.accent} />
          <Txt variant="caption" tone="dim">
            Finding room {room}…
          </Txt>
        </>
      ) : !user && !loading ? (
        <>
          <Txt variant="section">{preview.hostName} is listening</Txt>
          <Txt variant="caption" tone="dim" style={styles.copy}>
            Sign in to join and hear it in sync.
          </Txt>
          <Pressable
            style={styles.cta}
            onPress={() => void signIn().catch(() => {})}
            accessibilityRole="button"
          >
            <Txt variant="label" style={{ color: color.accentFg }}>
              Continue with Google
            </Txt>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={color.accent} />
          <Txt variant="caption" tone="dim">
            {busy ? `Joining ${preview.hostName}'s room…` : 'Connecting…'}
          </Txt>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.xl,
    backgroundColor: color.ground,
  },
  badge: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accentWash,
    marginBottom: space.xs,
  },
  copy: { textAlign: 'center', lineHeight: 19 },
  cta: {
    marginTop: space.md,
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    minWidth: 220,
    alignItems: 'center',
  },
})
