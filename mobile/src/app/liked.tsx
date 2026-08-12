// Liked songs. Reads straight from the likes store, so a tap on any heart shows
// up here immediately without a refetch.

import { useState } from 'react'
import type { Track } from '@core/types'
import { useLikes } from '../lib/likes'
import { useAuth } from '../lib/auth'
import { TrackListScreen } from '../ui/TrackListScreen'
import { TrackMenu } from '../ui/TrackMenu'
import { color } from '../ui/theme'

export default function LikedScreen() {
  const { likes } = useLikes()
  const { user } = useAuth()
  const [menuFor, setMenuFor] = useState<Track | null>(null)

  return (
    <>
      <TrackListScreen
        title="Liked songs"
        subtitle={
          likes.length
            ? `${likes.length} ${likes.length === 1 ? 'song' : 'songs'} · ${user ? 'synced' : 'on this device'}`
            : undefined
        }
        tracks={likes}
        accent={color.accent}
        emptyText="Tap the heart on any track and it lands here."
        onTrackMore={setMenuFor}
      />
      <TrackMenu track={menuFor} onClose={() => setMenuFor(null)} />
    </>
  )
}
