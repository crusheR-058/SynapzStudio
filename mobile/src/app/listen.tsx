// Listen Along — host a room or join one by code.
//
// The share link points at the web app (synapz-music.vercel.app/listen/<code>),
// which is what a friend without the app can open. That page handles the
// download prompt and hand-off, so this screen only has to produce the code.

import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { ChevronDown, Copy, Headphones, LogOut, Share2, Users } from 'lucide-react-native'
import { useAuth } from '../lib/auth'
import { useListenAlong } from '../lib/listenAlong'
import { Txt } from '../ui/Txt'
import { color, radius, space } from '../ui/theme'

export default function ListenScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, signIn } = useAuth()
  const { mode, code, hostName, members, shareUrl, busy, host, join, leave } = useListenAlong()
  const [entry, setEntry] = useState('')
  const [copied, setCopied] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      Alert.alert('Listen Along', String((err as Error)?.message ?? err))
    }
  }

  const copy = async () => {
    if (!shareUrl) return
    await Clipboard.setStringAsync(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={14} accessibilityLabel="Close">
          <ChevronDown size={26} color={color.text} />
        </Pressable>
        <Txt variant="micro" tone="dim">
          LISTEN ALONG
        </Txt>
        <View style={{ width: 26 }} />
      </View>

      {!user ? (
        <View style={styles.center}>
          <View style={styles.badge}>
            <Headphones size={24} color={color.accent} />
          </View>
          <Txt variant="section">Sign in to listen together</Txt>
          <Txt variant="caption" tone="dim" style={styles.copy}>
            Rooms are tied to your account so friends can see who's hosting.
          </Txt>
          <Pressable style={styles.cta} onPress={() => run(signIn)} accessibilityRole="button">
            <Txt variant="label" style={{ color: color.accentFg }}>
              Continue with Google
            </Txt>
          </Pressable>
        </View>
      ) : mode === 'idle' ? (
        <View style={styles.body}>
          <View style={styles.card}>
            <Txt variant="section">Host a room</Txt>
            <Txt variant="caption" tone="dim">
              Everyone who joins hears exactly what you hear, in sync.
            </Txt>
            <Pressable
              style={styles.cta}
              onPress={() => run(host)}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={color.accentFg} />
              ) : (
                <Txt variant="label" style={{ color: color.accentFg }}>
                  Start a room
                </Txt>
              )}
            </Pressable>
          </View>

          <View style={styles.card}>
            <Txt variant="section">Join with a code</Txt>
            <View style={styles.joinRow}>
              <TextInput
                value={entry}
                onChangeText={setEntry}
                placeholder="e.g. k7m2xq4p"
                placeholderTextColor={color.dimmer}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={color.accent}
                accessibilityLabel="Room code"
              />
              <Pressable
                style={[styles.joinBtn, !entry.trim() && { opacity: 0.4 }]}
                disabled={!entry.trim() || busy}
                onPress={() => run(() => join(entry))}
                accessibilityRole="button"
              >
                <Txt variant="label">Join</Txt>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.card}>
            <Txt variant="micro" tone="accent">
              {mode === 'hosting' ? 'YOU ARE HOSTING' : `LISTENING WITH ${(hostName ?? '').toUpperCase()}`}
            </Txt>
            <Txt variant="display" style={styles.code}>
              {code}
            </Txt>

            {mode === 'hosting' && (
              <View style={styles.shareRow}>
                <Pressable style={styles.ghost} onPress={copy} accessibilityRole="button">
                  <Copy size={16} color={color.text} />
                  <Txt variant="label">{copied ? 'Copied' : 'Copy link'}</Txt>
                </Pressable>
                <Pressable
                  style={styles.ghost}
                  onPress={() => shareUrl && Share.share({ message: shareUrl })}
                  accessibilityRole="button"
                >
                  <Share2 size={16} color={color.text} />
                  <Txt variant="label">Share</Txt>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.membersHead}>
              <Users size={16} color={color.dim} />
              <Txt variant="label" tone="dim">
                {members.length} {members.length === 1 ? 'listener' : 'listeners'}
              </Txt>
            </View>
            {members.map((m) => (
              <View key={m.userId} style={styles.member}>
                <Txt variant="bodyMed">{m.name}</Txt>
                {m.isHost && (
                  <Txt variant="caption" tone="accent">
                    host
                  </Txt>
                )}
              </View>
            ))}
          </View>

          <Pressable style={styles.leave} onPress={() => run(leave)} accessibilityRole="button">
            <LogOut size={16} color={color.accent} />
            <Txt variant="label" tone="accent">
              {mode === 'hosting' ? 'End room' : 'Leave room'}
            </Txt>
          </Pressable>
        </View>
      )}
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
  body: { padding: space.lg, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl },
  badge: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accentWash,
    marginBottom: space.xs,
  },
  copy: { textAlign: 'center', lineHeight: 19 },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  code: { letterSpacing: 3, fontVariant: ['tabular-nums'] },
  cta: {
    marginTop: space.xs,
    paddingVertical: 13,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    minWidth: 200,
  },
  joinRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  input: {
    flex: 1,
    height: 46,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.window,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    color: color.text,
    fontFamily: 'Figtree_400Regular',
    fontSize: 15,
    letterSpacing: 1.5,
  },
  joinBtn: {
    paddingHorizontal: 22,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.panelStrong,
  },
  shareRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.panelStrong,
  },
  membersHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.accent,
  },
})
