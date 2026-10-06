// Friends — who you've added, what they're playing, and a way into their room.
//
// Also home to ActivityBeacon, the invisible half: it publishes this user's own
// now-playing so that friends have something to see.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Play, Radio, UserMinus, UserPlus, Users } from 'lucide-react'
import { Cover, fmtAgo } from '../App'
import { useAuth } from '../auth'
import { usePlayer } from '../player'
import { useListen } from '../listen'
import { currentUserId } from '../../../core/supabase'
import {
  addFriend,
  clearActivity,
  fetchFriendActivity,
  fetchFriends,
  friendLink,
  parseFriendRef,
  publishActivity,
  removeFriend,
  type Friend,
  type FriendActivity,
  type SocialStatus,
} from '../../../core/social'
import { isDesktopApp, openInDesktopApp } from '../../lib/invite'

const SHARE_KEY = 'synapz:shareActivity'
const POLL_MS = 30_000
const HEARTBEAT_MS = 60_000
/** Past this, a "playing" row is treated as stale — the app probably closed. */
const LIVE_WINDOW_MS = 3 * 60_000

export function sharingActivity(): boolean {
  try {
    return localStorage.getItem(SHARE_KEY) !== '0'
  } catch {
    return true
  }
}

function setSharingActivity(on: boolean) {
  try {
    localStorage.setItem(SHARE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('synapz:share-activity'))
}

/** A ?friend=<id>&n=<name> invite sitting in the address bar, if any. */
export function friendRefFromUrl(): { userId: string; name: string } | null {
  try {
    const q = new URLSearchParams(window.location.search)
    const id = q.get('friend')
    return id ? { userId: id, name: q.get('n') || '' } : null
  } catch {
    return null
  }
}

function clearFriendRefFromUrl() {
  if (friendRefFromUrl()) window.history.replaceState(null, '', '/')
}

/**
 * Publishes what this user is playing, for their friends. Renders nothing.
 *
 * It stays silent until there is someone who could see it: no account, sharing
 * switched off, or no friends added yet all mean no row is written at all.
 */
export function ActivityBeacon() {
  const { user } = useAuth()
  const { currentTrack, isPlaying } = usePlayer()
  const { room } = useListen()
  const [armed, setArmed] = useState(false)
  const [share, setShare] = useState(sharingActivity)
  const deadRef = useRef(false) // tables missing — stop trying for this session

  useEffect(() => {
    const sync = () => setShare(sharingActivity())
    window.addEventListener('synapz:share-activity', sync)
    return () => window.removeEventListener('synapz:share-activity', sync)
  }, [])

  // Arm only once this user has added at least one friend.
  useEffect(() => {
    setArmed(false)
    if (!user) return
    let live = true
    const check = () =>
      fetchFriends().then((r) => {
        if (!live) return
        if (r.status === 'unavailable') deadRef.current = true
        setArmed(r.status === 'ok' && r.friends.some((f) => f.added))
      })
    check()
    window.addEventListener('synapz:friends-changed', check)
    return () => {
      live = false
      window.removeEventListener('synapz:friends-changed', check)
    }
  }, [user?.email])

  const on = armed && share && !!user

  // Turning sharing off removes the row rather than leaving a last-played ghost.
  const wasOn = useRef(false)
  useEffect(() => {
    if (wasOn.current && !on && user) void clearActivity()
    wasOn.current = on
  }, [on, user])

  const trackRef = useRef(currentTrack)
  const playingRef = useRef(isPlaying)
  trackRef.current = currentTrack
  playingRef.current = isPlaying
  const roomCode = room?.isHost ? room.code : null

  useEffect(() => {
    if (!on || !user) return
    const publish = () => {
      if (deadRef.current) return
      const t = trackRef.current
      void publishActivity({
        name: user.name,
        picture: user.picture || '',
        // A local file means nothing to anyone else.
        track: t && t.source !== 'local' ? t : null,
        isPlaying: playingRef.current && !!t && t.source !== 'local',
        roomCode,
      }).then((ok) => {
        if (!ok) deadRef.current = true
      })
    }
    // Debounced: skipping through five songs should be one write, not five.
    const soon = window.setTimeout(publish, 1500)
    // The heartbeat is what lets a friend tell "still playing" from "closed the
    // app an hour ago" — a row that stops refreshing goes stale on their side.
    const beat = isPlaying ? window.setInterval(publish, HEARTBEAT_MS) : undefined
    return () => {
      window.clearTimeout(soon)
      if (beat !== undefined) window.clearInterval(beat)
    }
  }, [on, user?.name, user?.picture, currentTrack?.id, isPlaying, roomCode])

  return null
}

function Avatar({ name, picture }: { name: string; picture?: string }) {
  if (picture) return <img className="friend__ava" src={picture} alt="" />
  return <span className="friend__ava friend__ava--initial">{(name[0] || '?').toUpperCase()}</span>
}

export function FriendsView() {
  const { user, openAuth } = useAuth()
  const { playRadio } = usePlayer()
  const { join, busy } = useListen()

  const [status, setStatus] = useState<SocialStatus | 'loading'>('loading')
  const [friends, setFriends] = useState<Friend[]>([])
  const [activity, setActivity] = useState<Record<string, FriendActivity>>({})
  const [myId, setMyId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [share, setShare] = useState(sharingActivity)
  const [pending, setPending] = useState(friendRefFromUrl)

  const refresh = useCallback(async () => {
    const [f, a] = await Promise.all([fetchFriends(), fetchFriendActivity()])
    setStatus(f.status)
    setFriends(f.friends)
    setActivity(Object.fromEntries(a.map((x) => [x.userId, x])))
  }, [])

  useEffect(() => {
    if (!user) {
      setStatus('signed-out')
      return
    }
    void currentUserId().then(setMyId)
    void refresh()
    const iv = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(iv)
  }, [user?.email, refresh])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(t)
  }, [copied])

  const add = async (ref: { userId: string; name: string }) => {
    if (!user) return openAuth('login')
    if (ref.userId === myId) return setNote('That’s your own link — send it to a friend.')
    const ok = await addFriend(ref.userId, ref.name, user.name)
    setNote(
      ok
        ? `Added${ref.name ? ` ${ref.name}` : ''}. You’ll see each other’s music once they add you back.`
        : 'Could not add that friend. Check the link and try again.',
    )
    if (ok) {
      window.dispatchEvent(new Event('synapz:friends-changed'))
      void refresh()
    }
  }

  const submit = async () => {
    const ref = parseFriendRef(input)
    if (!ref) return setNote('Paste a friend link, or their friend code.')
    setInput('')
    await add(ref)
  }

  const remove = async (f: Friend) => {
    await removeFriend(f.userId)
    window.dispatchEvent(new Event('synapz:friends-changed'))
    void refresh()
  }

  const copyLink = async () => {
    if (!myId || !user) return
    try {
      await navigator.clipboard.writeText(friendLink(myId, user.name))
      setCopied(true)
    } catch {
      setNote(friendLink(myId, user.name))
    }
  }

  const toggleShare = () => {
    const next = !share
    setShare(next)
    setSharingActivity(next)
  }

  const joinRoom = (code: string) => {
    if (isDesktopApp()) void join(code)
    else openInDesktopApp(code)
  }

  const dismissPending = () => {
    setPending(null)
    clearFriendRefFromUrl()
  }

  const mutual = friends.filter((f) => f.mutual)
  const waiting = friends.filter((f) => f.added && !f.mutual)
  const incoming = friends.filter((f) => !f.added)

  return (
    <div className="view friends">
      <header className="friends__head">
        <span className="eyebrow">
          <Users size={13} /> Friends
        </span>
        <h1>Listening together</h1>
        <p>See what your friends are playing, and jump into their Listen Along sessions.</p>
      </header>

      {pending && (
        <div className="friends__invite">
          <UserPlus size={18} />
          <span>
            Add <b>{pending.name || 'this listener'}</b> as a friend?
          </span>
          <button
            className="btn-solid"
            onClick={async () => {
              await add(pending)
              if (user) dismissPending()
            }}
          >
            {user ? 'Add friend' : 'Sign in to add'}
          </button>
          <button className="btn-ghost" onClick={dismissPending}>
            Not now
          </button>
        </div>
      )}

      {status === 'signed-out' ? (
        <div className="state">
          <p>Sign in to add friends and see what they’re listening to.</p>
          <button className="btn-solid" onClick={() => openAuth('login')}>
            Sign in
          </button>
        </div>
      ) : status === 'unavailable' ? (
        <div className="state">
          <p>Friends isn’t switched on yet.</p>
          <p className="state__hint">It needs a one-time database update on the server.</p>
        </div>
      ) : status === 'loading' ? (
        <div className="state">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <section className="friends__add">
            <div className="friends__addrow">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Paste a friend’s link"
                spellCheck={false}
              />
              <button className="btn-solid" onClick={submit}>
                <UserPlus size={15} /> Add
              </button>
              <button className="btn-ghost" onClick={copyLink} disabled={!myId}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy my link'}
              </button>
            </div>
            {note && <p className="friends__note">{note}</p>}
            <label className="friends__share">
              <span className="switch">
                <input type="checkbox" checked={share} onChange={toggleShare} />
                <span className="switch__sl" />
              </span>
              <span>
                Share what I’m listening to
                <i>Only friends you’ve both added can see it.</i>
              </span>
            </label>
          </section>

          {incoming.length > 0 && (
            <section className="section">
              <div className="section__head">
                <h2>Added you</h2>
              </div>
              <div className="friendlist">
                {incoming.map((f) => (
                  <div className="friend" key={f.userId}>
                    <Avatar name={f.name} />
                    <div className="friend__meta">
                      <b>{f.name}</b>
                      <i>Wants to share music with you</i>
                    </div>
                    <button className="btn-solid" onClick={() => add({ userId: f.userId, name: f.name })}>
                      Add back
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section__head">
              <h2>Friends</h2>
              <span className="section__all">{mutual.length}</span>
            </div>
            {mutual.length === 0 ? (
              <div className="state">
                <p>No friends yet.</p>
                <p className="state__hint">
                  Copy your link and send it to someone. When you’ve both added each other, their
                  music shows up here.
                </p>
              </div>
            ) : (
              <div className="friendlist">
                {mutual.map((f) => {
                  const a = activity[f.userId]
                  const live = !!a?.isPlaying && Date.now() - a.updatedAt < LIVE_WINDOW_MS
                  const track = a?.track
                  return (
                    <div className={`friend ${live ? 'is-live' : ''}`} key={f.userId}>
                      <Avatar name={a?.name || f.name} picture={a?.picture} />
                      <div className="friend__meta">
                        <b>{a?.name || f.name}</b>
                        {track ? (
                          <i title={`${track.title} — ${track.artist}`}>
                            {live ? 'Listening to ' : 'Last played '}
                            <span>{track.title}</span> · {track.artist}
                          </i>
                        ) : (
                          <i>Nothing played recently</i>
                        )}
                        {a && !live && track && <em>{fmtAgo(a.updatedAt)}</em>}
                      </div>
                      {track && (
                        <button
                          className="friend__play"
                          onClick={() => playRadio(track)}
                          aria-label={`Play ${track.title}`}
                          title="Play this song"
                        >
                          <Cover src={track.artwork} alt="" className="friend__art" />
                          <span>
                            <Play size={14} fill="#fff" />
                          </span>
                        </button>
                      )}
                      {live && a?.roomCode && (
                        <button
                          className="btn-solid friend__join"
                          disabled={busy}
                          onClick={() => joinRoom(a.roomCode!)}
                        >
                          <Radio size={14} /> Join
                        </button>
                      )}
                      <button
                        className="friend__remove"
                        onClick={() => remove(f)}
                        aria-label={`Remove ${f.name}`}
                        title="Remove friend"
                      >
                        <UserMinus size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {waiting.length > 0 && (
            <section className="section">
              <div className="section__head">
                <h2>Waiting for them to add you back</h2>
              </div>
              <div className="friendlist">
                {waiting.map((f) => (
                  <div className="friend friend--pending" key={f.userId}>
                    <Avatar name={f.name} />
                    <div className="friend__meta">
                      <b>{f.name}</b>
                      <i>Send them your link so they can add you</i>
                    </div>
                    <button
                      className="friend__remove"
                      onClick={() => remove(f)}
                      aria-label={`Remove ${f.name}`}
                      title="Remove"
                    >
                      <UserMinus size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
