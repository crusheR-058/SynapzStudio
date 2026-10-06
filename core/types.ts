export interface Track {
  id: string
  // 'local' is a file on this machine (desktop folder scan, or a browser file
  // picker). It plays through the <audio> element like an Audius track, but is
  // never sent to the cloud — the stream URL only means something on this device.
  source: 'audius' | 'youtube' | 'local'
  title: string
  artist: string
  artistHandle: string
  artwork: string // 480x480
  artworkLarge: string // 1000x1000
  duration: number // seconds
  genre?: string
  mood?: string
  playCount?: number
  favoriteCount?: number
  streamUrl: string
}

export interface Playlist {
  id: string
  name: string
  owner: string
  ownerHandle: string
  artwork: string
  artworkLarge: string
  trackCount: number
  description?: string
  totalPlays?: number
}

export type Repeat = 'off' | 'all' | 'one'

export type View =
  | { type: 'home' }
  | { type: 'search' }
  | { type: 'library' }
  | { type: 'playlist'; id: string }
  | { type: 'myplaylist'; id: string }
  | { type: 'shared'; id: string }
  | { type: 'genre'; genre: string; name: string }
  | { type: 'station'; q: string; name: string }
  | { type: 'hindi' }
  | { type: 'hollywood' }
  | { type: 'artists' }
  | { type: 'artist'; name: string }
  | { type: 'podcasts' }
  | { type: 'radio' }
  | { type: 'account' }
  | { type: 'recap' }
  | { type: 'mix'; id: string }
  | { type: 'friends' }
  | { type: 'local' }
