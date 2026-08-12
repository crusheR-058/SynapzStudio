// Bottom sheet for a single track: like, add to a playlist, play next.
//
// Built as a plain Modal rather than pulling in a sheet library — it has one
// layout and no gestures beyond tap-to-dismiss, and the dependency would be
// larger than the component.
//
// The playlist picker is a second step inside the same sheet instead of a new
// route: adding a song to a playlist is a small action, and pushing a screen for
// it loses the context of which track you were on.

import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { Heart, ListMusic, ListPlus, Plus } from 'lucide-react-native'
import type { Track } from '@core/types'
import { cloudAddToPlaylist, cloudFetchPlaylists, type CloudPlaylist } from '@core/cloud'
import { useAuth } from '../lib/auth'
import { useLikes } from '../lib/likes'
import { usePlayer } from '../lib/player'
import { Txt } from './Txt'
import { color, radius, space } from './theme'

export function TrackMenu({
  track,
  onClose,
}: {
  /** null closes the sheet — the caller holds the selected track. */
  track: Track | null
  onClose: () => void
}) {
  const { isLiked, toggle } = useLikes()
  const { user } = useAuth()
  const { playNext } = usePlayer()
  const [picking, setPicking] = useState(false)
  const [playlists, setPlaylists] = useState<CloudPlaylist[] | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  // Reset the sub-step whenever a different track opens the sheet, or the
  // picker stays open from the last one.
  useEffect(() => {
    if (!track) {
      setPicking(false)
      setSaved(null)
    }
  }, [track])

  const openPicker = async () => {
    setPicking(true)
    if (playlists) return
    try {
      setPlaylists(await cloudFetchPlaylists())
    } catch {
      setPlaylists([])
    }
  }

  const addTo = async (playlist: CloudPlaylist) => {
    if (!track) return
    setSaved(playlist.id)
    try {
      await cloudAddToPlaylist(playlist.id, track)
      // Leave the confirmation on screen briefly so the tap registers visually
      // rather than the sheet vanishing instantly.
      setTimeout(onClose, 550)
    } catch {
      setSaved(null)
    }
  }

  const liked = track ? isLiked(track.id) : false

  return (
    <Modal visible={!!track} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {track && (
            <View style={styles.header}>
              <Image source={track.artwork} style={styles.art} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyMed" numberOfLines={1}>
                  {track.title}
                </Txt>
                <Txt variant="caption" tone="dim" numberOfLines={1}>
                  {track.artist}
                </Txt>
              </View>
            </View>
          )}

          {picking ? (
            <View style={styles.picker}>
              <Txt variant="micro" tone="dim">
                ADD TO PLAYLIST
              </Txt>
              {playlists === null ? (
                <ActivityIndicator color={color.accent} style={{ paddingVertical: space.lg }} />
              ) : playlists.length === 0 ? (
                <Txt variant="caption" tone="dim" style={{ paddingVertical: space.md }}>
                  No playlists yet — create one in your Library.
                </Txt>
              ) : (
                <ScrollView style={{ maxHeight: 260 }}>
                  {playlists.map((p) => (
                    <Pressable
                      key={p.id}
                      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                      onPress={() => addTo(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add to ${p.name}`}
                    >
                      <ListMusic size={19} color={color.dim} />
                      <Txt variant="bodyMed" style={{ flex: 1 }} numberOfLines={1}>
                        {p.name}
                      </Txt>
                      {saved === p.id && (
                        <Txt variant="caption" tone="accent">
                          Added
                        </Txt>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                onPress={() => {
                  if (track) toggle(track)
                  onClose()
                }}
                accessibilityRole="button"
              >
                <Heart
                  size={20}
                  color={liked ? color.accent : color.dim}
                  fill={liked ? color.accent : 'transparent'}
                />
                <Txt variant="bodyMed">{liked ? 'Remove from liked' : 'Like'}</Txt>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                onPress={() => {
                  if (track) playNext(track)
                  onClose()
                }}
                accessibilityRole="button"
              >
                <ListPlus size={20} color={color.dim} />
                <Txt variant="bodyMed">Play next</Txt>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.item,
                  pressed && styles.pressed,
                  !user && { opacity: 0.45 },
                ]}
                onPress={openPicker}
                disabled={!user}
                accessibilityRole="button"
              >
                <Plus size={20} color={color.dim} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyMed">Add to playlist</Txt>
                  {!user && (
                    <Txt variant="caption" tone="dimmer">
                      Sign in to use playlists
                    </Txt>
                  )}
                </View>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: color.window,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: space.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairlineLit,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.panelHover,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  art: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: color.panel },
  actions: { paddingTop: space.sm },
  picker: { paddingTop: space.md, paddingHorizontal: space.lg, gap: space.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: color.panel },
})
