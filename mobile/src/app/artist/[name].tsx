// One artist's full catalogue.

import { useEffect, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import type { Track } from '@core/types'
import { tracksByArtist } from '../../lib/catalog'
import { TrackListScreen } from '../../ui/TrackListScreen'
import { TrackMenu } from '../../ui/TrackMenu'

export default function ArtistScreen() {
  const { name } = useLocalSearchParams<{ name: string }>()
  const artist = decodeURIComponent(name ?? '')
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [menuFor, setMenuFor] = useState<Track | null>(null)

  useEffect(() => {
    setTracks(null)
    void tracksByArtist(artist)
      .then(setTracks)
      .catch(() => setTracks([]))
  }, [artist])

  return (
    <>
      <TrackListScreen
        title={artist}
        tracks={tracks}
        emptyText="No songs found for this artist."
        onTrackMore={setMenuFor}
      />
      <TrackMenu track={menuFor} onClose={() => setMenuFor(null)} />
    </>
  )
}
