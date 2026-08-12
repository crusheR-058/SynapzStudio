// Landing point for a shared track link: synapz://play/<source>/<id>?t=&a=&d=,
// which is what the Discord "Play on Synapz" button opens.
//
// The query string carries title, artist and duration so a YouTube track can be
// reconstructed and played without a round-trip — resolveTrackRef only hits the
// network for Audius, whose audio lives behind a resolved stream URL.

import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { parseTrackRef, resolveTrackRef } from '@core/tracklink'
import { usePlayer } from '../../../lib/player'
import { Txt } from '../../../ui/Txt'
import { color, radius, space } from '../../../ui/theme'

export default function PlayLinkScreen() {
  const params = useLocalSearchParams<{ source: string; id: string; t?: string; a?: string; d?: string }>()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { playTrack } = usePlayer()
  const [failed, setFailed] = useState(false)

  // playTrack changes identity whenever the queue does, and this must run once —
  // a second run would restart the track from zero.
  const playRef = useRef(playTrack)
  playRef.current = playTrack
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    // Rebuilt into the shape parseTrackRef expects, so the link format lives in
    // exactly one place and stays identical to the web app's.
    const search = new URLSearchParams()
    if (params.t) search.set('t', params.t)
    if (params.a) search.set('a', params.a)
    if (params.d) search.set('d', params.d)

    const ref = parseTrackRef(
      `/play/${params.source}/${params.id}`,
      search.toString() ? `?${search}` : '',
    )
    if (!ref) {
      setFailed(true)
      return
    }

    void resolveTrackRef(ref)
      .then((track) => {
        if (!track) {
          setFailed(true)
          return
        }
        playRef.current(track, [track])
        // replace, not push: backing out of a link should land on Home, not on
        // a loading screen that immediately replays the track.
        router.replace('/player')
      })
      .catch(() => setFailed(true))
  }, [params.source, params.id, params.t, params.a, params.d, router])

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {failed ? (
        <>
          <Txt variant="section">Couldn't open that track</Txt>
          <Txt variant="caption" tone="dim" style={styles.copy}>
            The link may be old or incomplete.
          </Txt>
          <Pressable style={styles.cta} onPress={() => router.replace('/')}>
            <Txt variant="label" style={{ color: color.accentFg }}>
              Go to Home
            </Txt>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={color.accent} />
          <Txt variant="caption" tone="dim">
            {params.t ? `Opening “${params.t}”…` : 'Opening track…'}
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
  copy: { textAlign: 'center' },
  cta: {
    marginTop: space.md,
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
})
