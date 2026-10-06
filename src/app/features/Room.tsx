// The Listen Along room panel: chat, reactions and song requests.
//
// Opened from the live-session bar above the player. All of its state lives in
// ListenProvider — this file is only the surface.

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronUp, ListPlus, MessageCircle, Search as SearchIcon, Send, X } from 'lucide-react'
import { Cover } from '../App'
import { REACTIONS, useListen } from '../listen'
import { searchTracks } from '../../lib/audius'
import { searchYT } from '../../lib/youtube'
import type { Track } from '../../lib/types'

/** The button in the session bar; carries the unread count. */
export function RoomPanelButton() {
  const { room, panelOpen, setPanelOpen, unread, requests } = useListen()
  if (!room) return null
  return (
    <button
      className={`listenbar__link ${panelOpen ? 'on' : ''}`}
      onClick={() => setPanelOpen(!panelOpen)}
      title="Chat, reactions and song requests"
    >
      <MessageCircle size={14} />
      Room
      {unread > 0 && <span className="listenbar__badge">{unread > 99 ? '99+' : unread}</span>}
      {unread === 0 && room.isHost && requests.length > 0 && (
        <span className="listenbar__badge listenbar__badge--quiet">{requests.length}</span>
      )}
    </button>
  )
}

/** Emoji that float up over the player when anyone in the room reacts. */
export function ReactionOverlay() {
  const { room, reactions } = useListen()
  if (!room || !reactions.length) return null
  return (
    <div className="reactions" aria-hidden>
      {reactions.map((r) => (
        <span
          className="reactions__item"
          key={r.key}
          // Spread across the width by key so a burst doesn't stack in one column.
          style={{ left: `${12 + ((r.key * 37) % 76)}%` }}
        >
          <span className="reactions__emoji">{r.emoji}</span>
          <span className="reactions__name">{r.name}</span>
        </span>
      ))}
    </div>
  )
}

function Chat() {
  const { messages, sendChat, sendReaction, myId } = useListen()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const submit = () => {
    if (!text.trim()) return
    sendChat(text)
    setText('')
  }

  return (
    <>
      <div className="room__log">
        {messages.length === 0 && (
          <div className="room__empty">Say hi — everyone in the session sees the chat.</div>
        )}
        {messages.map((m) => (
          <div className={`room__msg ${m.userId === myId ? 'is-mine' : ''}`} key={m.id}>
            {m.userId !== myId && <b>{m.name}</b>}
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="room__react">
        {REACTIONS.map((e) => (
          <button key={e} onClick={() => sendReaction(e)} aria-label={`React ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="room__input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Keep the player's single-key shortcuts from firing while typing.
            e.stopPropagation()
            if (e.key === 'Enter') submit()
          }}
          placeholder="Message the room"
          maxLength={300}
        />
        <button onClick={submit} disabled={!text.trim()} aria-label="Send">
          <Send size={15} />
        </button>
      </div>
    </>
  )
}

function Requests() {
  const { room, requests, requestSong, voteRequest, acceptRequest, dismissRequest, myId } = useListen()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const isHost = !!room?.isHost

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      return
    }
    let live = true
    setSearching(true)
    const t = window.setTimeout(async () => {
      // Both catalogs, best-effort each: one being down shouldn't empty the list.
      const [yt, au] = await Promise.all([
        searchYT(query).catch(() => [] as Track[]),
        searchTracks(query).catch(() => [] as Track[]),
      ])
      if (!live) return
      setResults([...yt.slice(0, 6), ...au.slice(0, 4)])
      setSearching(false)
    }, 350)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [q])

  const ask = (t: Track) => {
    requestSong(t)
    setSent((s) => new Set(s).add(t.id))
  }

  return (
    <>
      <div className="room__search">
        <SearchIcon size={14} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={isHost ? 'Search to add to the queue' : 'Search for a song to request'}
          spellCheck={false}
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear search">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="room__log">
        {q.trim().length >= 2 ? (
          <>
            {searching && !results.length && <div className="room__empty">Searching…</div>}
            {!searching && !results.length && <div className="room__empty">No songs found.</div>}
            {results.map((t) => (
              <div className="room__req" key={t.id}>
                <Cover src={t.artwork} alt="" className="room__art" />
                <span className="room__reqmeta">
                  <b title={t.title}>{t.title}</b>
                  <i title={t.artist}>{t.artist}</i>
                </span>
                <button
                  className="room__reqbtn"
                  onClick={() => ask(t)}
                  disabled={sent.has(t.id)}
                  title={isHost ? 'Add to queue' : 'Request this song'}
                >
                  {sent.has(t.id) ? <Check size={14} /> : <ListPlus size={14} />}
                  {sent.has(t.id) ? (isHost ? 'Queued' : 'Sent') : isHost ? 'Queue' : 'Request'}
                </button>
              </div>
            ))}
          </>
        ) : requests.length === 0 ? (
          <div className="room__empty">
            {isHost
              ? 'Guests’ song requests show up here. The most-voted rise to the top.'
              : 'Search above to ask the host for a song. Vote on other requests to push them up.'}
          </div>
        ) : (
          requests.map((r) => {
            const voted = !!myId && r.votes.includes(myId)
            return (
              <div className="room__req" key={r.id}>
                <Cover src={r.track.artwork} alt="" className="room__art" />
                <span className="room__reqmeta">
                  <b title={r.track.title}>{r.track.title}</b>
                  <i>
                    {r.track.artist} · asked by {r.name}
                  </i>
                </span>
                {isHost ? (
                  <>
                    <span className="room__votes">
                      <ChevronUp size={13} />
                      {r.votes.length}
                    </span>
                    <button className="room__reqbtn" onClick={() => acceptRequest(r.id)} title="Add to queue">
                      <ListPlus size={14} /> Queue
                    </button>
                    <button
                      className="room__reqbtn room__reqbtn--x"
                      onClick={() => dismissRequest(r.id)}
                      aria-label="Dismiss request"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    className={`room__reqbtn ${voted ? 'on' : ''}`}
                    onClick={() => voteRequest(r.id)}
                    title={voted ? 'Remove your vote' : 'Vote for this song'}
                  >
                    <ChevronUp size={14} />
                    {r.votes.length}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

export function RoomPanel() {
  const { room, members, panelOpen, setPanelOpen, requests } = useListen()
  const [tab, setTab] = useState<'chat' | 'requests'>('chat')

  if (!room || !panelOpen) return null
  return (
    <aside className="room" aria-label="Listen Along room">
      <header className="room__head">
        <div>
          <b>{room.isHost ? 'Your session' : `${room.hostName}’s session`}</b>
          <i>
            {members.length} {members.length === 1 ? 'person' : 'people'} here
          </i>
        </div>
        <button onClick={() => setPanelOpen(false)} aria-label="Close room panel">
          <X size={16} />
        </button>
      </header>
      <div className="room__tabs">
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
          Chat
        </button>
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
          Requests{requests.length ? ` · ${requests.length}` : ''}
        </button>
      </div>
      {tab === 'chat' ? <Chat /> : <Requests />}
    </aside>
  )
}
