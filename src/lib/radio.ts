import type { Track } from './types'

/**
 * Live internet radio — always-on, commercial-free stations from SomaFM (stable,
 * CORS-friendly direct MP3 streams). Modeled as Track objects with source
 * 'audius' so they play through the normal <audio> element. duration 0 = live.
 * If a station logo ever 404s, <Cover> falls back to an icon — playback is
 * unaffected (it plays by streamUrl).
 */
function station(id: string, name: string, genre: string): Track {
  return {
    id: `radio:${id}`,
    source: 'audius',
    title: name,
    artist: `SomaFM · ${genre}`,
    artistHandle: '',
    artwork: `https://api.somafm.com/img/${id}120.png`,
    artworkLarge: `https://api.somafm.com/img/${id}120.png`,
    duration: 0,
    streamUrl: `https://ice1.somafm.com/${id}-128-mp3`,
  }
}

export const RADIO_STATIONS: Track[] = [
  station('groovesalad', 'Groove Salad', 'Chill / Downtempo'),
  station('lush', 'Lush', 'Mellow Vocals'),
  station('indiepop', 'Indie Pop Rocks', 'Indie Pop'),
  station('beatblender', 'Beat Blender', 'Deep House'),
  station('fluid', 'Fluid', 'Instrumental Hip-Hop'),
  station('secretagent', 'Secret Agent', 'Spy Lounge'),
  station('dronezone', 'Drone Zone', 'Ambient'),
  station('sonicuniverse', 'Sonic Universe', 'Jazz'),
  station('bootliquor', 'Boot Liquor', 'Americana'),
  station('folkfwd', 'Folk Forward', 'Indie Folk'),
  station('u80s', 'Underground 80s', '80s New Wave'),
  station('defcon', 'DEF CON Radio', 'Hacker Beats'),
  station('thetrip', 'The Trip', 'Prog House'),
  station('seventies', 'Left Coast 70s', '70s Mellow Gold'),
]
