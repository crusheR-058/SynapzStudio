// One cloud playlist. The name arrives as a query param so the header renders
// before the tracks land, instead of showing an empty title for a beat.

import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash2 } from 'lucide-react-native'
import type { Track } from '@core/types'
import { cloudDeletePlaylist, cloudFetchPlaylistTracks } from '@core/cloud'
import { TrackMenu } from '../../ui/TrackMenu'
import { Txt } from '../../ui/Txt'
import { TrackListScreen } from '../../ui/TrackListScreen'
import { color, radius, space } from '../../ui/theme'

export default function PlaylistScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const router = useRouter()
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [menuFor, setMenuFor] = useState<Track | null>(null)

  useEffect(() => {
    if (!id) return
    void cloudFetchPlaylistTracks(id)
      .then(setTracks)
      .catch(() => setTracks([]))
  }, [id])

  const confirmDelete = () => {
    Alert.alert('Delete playlist?', `"${name ?? 'This playlist'}" will be removed from every device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await cloudDeletePlaylist(id)
            router.back()
          } catch {
            Alert.alert("Couldn't delete", 'Check your connection and try again.')
          }
        },
      },
    ])
  }

  return (
    <>
    <TrackListScreen
      title={name ?? 'Playlist'}
      tracks={tracks}
      emptyText="This playlist is empty. Add songs from the ⋮ menu on any track."
      headerRight={
        <Pressable
          onPress={confirmDelete}
          style={styles.delete}
          accessibilityRole="button"
          accessibilityLabel="Delete playlist"
        >
          <Trash2 size={16} color={color.dim} />
          <Txt variant="label" tone="dim">
            Delete
          </Txt>
        </Pressable>
      }
      onTrackMore={setMenuFor}
    />
    <TrackMenu track={menuFor} onClose={() => setMenuFor(null)} />
    </>
  )
}

const styles = StyleSheet.create({
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    marginLeft: 'auto',
  },
})
