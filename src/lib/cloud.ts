import { supabase } from './supabase'
import type { Track } from './types'

/**
 * Cloud data layer (Supabase). Every call is best-effort and guarded: if
 * Supabase isn't configured or the user isn't signed in, it no-ops/returns
 * empty so the app falls back to local behaviour and playback never breaks.
 *
 * All writes set user_id = the signed-in user; Row-Level Security enforces that
 * a user can only touch their own rows.
 */

async function uid(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

/* --------------------------------------------------------------- likes --- */

export async function cloudFetchLikes(): Promise<Track[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('liked_tracks')
      .select('track')
      .order('added_at', { ascending: false })
    if (error || !data) return []
    return data.map((r: { track: Track }) => r.track).filter(Boolean)
  } catch {
    return []
  }
}

export async function cloudAddLike(track: Track): Promise<void> {
  const id = await uid()
  if (!supabase || !id) return
  try {
    await supabase
      .from('liked_tracks')
      .upsert({ user_id: id, track_id: track.id, track }, { onConflict: 'user_id,track_id' })
  } catch {
    /* best-effort */
  }
}

export async function cloudRemoveLike(trackId: string): Promise<void> {
  const id = await uid()
  if (!supabase || !id) return
  try {
    await supabase.from('liked_tracks').delete().eq('user_id', id).eq('track_id', trackId)
  } catch {
    /* best-effort */
  }
}

/** Push any local likes that aren't in the cloud yet (one-time import on sign-in). */
export async function cloudImportLikes(localLikes: Track[]): Promise<void> {
  const id = await uid()
  if (!supabase || !id || !localLikes.length) return
  try {
    const rows = localLikes.map((t) => ({ user_id: id, track_id: t.id, track: t }))
    await supabase.from('liked_tracks').upsert(rows, { onConflict: 'user_id,track_id' })
  } catch {
    /* best-effort */
  }
}

/* ------------------------------------------------------------- history --- */

/** Recent unique tracks from cloud play history (most-recent first). */
export async function cloudFetchHistory(limit = 40): Promise<Track[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('play_history')
      .select('track, played_at')
      .order('played_at', { ascending: false })
      .limit(250)
    if (error || !data) return []
    const seen = new Set<string>()
    const out: Track[] = []
    for (const r of data as { track: Track }[]) {
      const t = r.track
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id)
        out.push(t)
      }
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}

export async function cloudRecordPlay(track: Track): Promise<void> {
  const id = await uid()
  if (!supabase || !id) return
  try {
    await supabase.from('play_history').insert({ user_id: id, track_id: track.id, track })
  } catch {
    /* best-effort */
  }
}

/* ----------------------------------------------------------- playlists --- */

export interface CloudPlaylist {
  id: string
  name: string
  description: string | null
  updated_at: string
  is_public?: boolean
  is_collaborative?: boolean
}

export async function cloudFetchPlaylists(): Promise<CloudPlaylist[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('playlists')
      .select('id,name,description,updated_at,is_public,is_collaborative')
      .order('updated_at', { ascending: false })
    if (error || !data) return []
    return data as CloudPlaylist[]
  } catch {
    return []
  }
}

/** Toggle a playlist's share flags (owner only — enforced by RLS). */
export async function cloudSetPlaylistShare(
  playlistId: string,
  patch: { is_public?: boolean; is_collaborative?: boolean },
): Promise<void> {
  if (!supabase) return
  try {
    await supabase
      .from('playlists')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', playlistId)
  } catch {
    /* best-effort */
  }
}

/**
 * Fetch a playlist by id WITHOUT the owner filter — works for anyone (even
 * signed out) when the playlist is shared (RLS only returns it if is_public /
 * is_collaborative, or you own it). Returns null if not shared / not found.
 */
export async function cloudFetchPublicPlaylist(
  playlistId: string,
): Promise<{ playlist: CloudPlaylist & { user_id?: string }; tracks: Track[] } | null> {
  if (!supabase) return null
  try {
    const { data: p, error } = await supabase
      .from('playlists')
      .select('id,name,description,updated_at,is_public,is_collaborative,user_id')
      .eq('id', playlistId)
      .maybeSingle()
    if (error || !p) return null
    const { data: rows } = await supabase
      .from('playlist_tracks')
      .select('track,position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true })
    const tracks = (rows ?? []).map((r: { track: Track }) => r.track).filter(Boolean)
    return { playlist: p as CloudPlaylist & { user_id?: string }, tracks }
  } catch {
    return null
  }
}

export async function cloudCreatePlaylist(name: string): Promise<CloudPlaylist | null> {
  const id = await uid()
  if (!supabase || !id) return null
  try {
    const { data, error } = await supabase
      .from('playlists')
      .insert({ user_id: id, name: name.trim().slice(0, 80) || 'New playlist' })
      .select('id,name,description,updated_at')
      .single()
    if (error || !data) return null
    return data as CloudPlaylist
  } catch {
    return null
  }
}

export async function cloudDeletePlaylist(playlistId: string): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('playlists').delete().eq('id', playlistId)
  } catch {
    /* best-effort */
  }
}

export async function cloudRenamePlaylist(playlistId: string, name: string): Promise<void> {
  if (!supabase) return
  try {
    await supabase
      .from('playlists')
      .update({ name: name.trim().slice(0, 80) || 'Playlist', updated_at: new Date().toISOString() })
      .eq('id', playlistId)
  } catch {
    /* best-effort */
  }
}

export async function cloudFetchPlaylistTracks(playlistId: string): Promise<Track[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('playlist_tracks')
      .select('track,position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true })
    if (error || !data) return []
    return data.map((r: { track: Track }) => r.track).filter(Boolean)
  } catch {
    return []
  }
}

export async function cloudAddToPlaylist(playlistId: string, track: Track): Promise<void> {
  const id = await uid()
  if (!supabase || !id) return
  try {
    // Append at the end using max(position)+1, NOT the row count: after any
    // removal the count is < the highest position, so a count-based position
    // would collide with an existing row and scramble the order.
    const { data: top } = await supabase
      .from('playlist_tracks')
      .select('position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const position = typeof top?.position === 'number' ? top.position + 1 : 0
    await supabase.from('playlist_tracks').insert({
      playlist_id: playlistId,
      user_id: id,
      track_id: track.id,
      track,
      position,
    })
    await supabase.from('playlists').update({ updated_at: new Date().toISOString() }).eq('id', playlistId)
  } catch {
    /* best-effort */
  }
}

export async function cloudRemoveFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  if (!supabase) return
  try {
    await supabase
      .from('playlist_tracks')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('track_id', trackId)
  } catch {
    /* best-effort */
  }
}
