// "Made for you" — the mixes shelf on Home and the view behind each tile.

import { useEffect, useMemo, useState } from 'react'
import { Play, Sparkles } from 'lucide-react'
import { BigPlay, Cover, TrackList, useNav } from '../App'
import { usePlayer } from '../player'
import { usePlayEvents } from './usePlayEvents'
import { buildMixes, type Mix } from '../../lib/mixes'
import { searchYT } from '../../lib/youtube'
import type { Track } from '../../lib/types'

function useMixes(): { mixes: Mix[]; loading: boolean } {
  const { events, loading } = usePlayEvents()
  const { liked } = usePlayer()
  const mixes = useMemo(() => buildMixes(events, liked), [events, liked])
  return { mixes, loading }
}

// Four-up collage of the mix's artwork; falls back to one image, then to the
// placeholder Cover already draws.
function MixArt({ mix, className = '' }: { mix: Mix; className?: string }) {
  if (mix.art.length >= 4) {
    return (
      <div className={`mixart ${className}`}>
        {mix.art.slice(0, 4).map((src, i) => (
          <Cover key={i} src={src} alt="" />
        ))}
      </div>
    )
  }
  return <Cover src={mix.art[0]} alt={mix.name} className={className} />
}

/** The row on Home: the recap tile, then one tile per mix. */
export function MadeForYou() {
  const { mixes } = useMixes()
  const { navigate } = useNav()
  const { playContext } = usePlayer()

  return (
    <section className="section">
      <div className="section__head">
        <h2>Made for you</h2>
      </div>
      <div className="row">
        <div className="card card--recap" onClick={() => navigate({ type: 'recap' })}>
          <div className="card__art">
            <div className="cover recapcard">
              <Sparkles size={34} />
              <span>Recap</span>
            </div>
          </div>
          <div className="card__title">Your Recap</div>
          <div className="card__sub">Your month in music</div>
        </div>
        {mixes.map((m) => (
          <div className="card" key={m.id} onClick={() => navigate({ type: 'mix', id: m.id })}>
            <div className="card__art">
              <MixArt mix={m} />
              <button
                className="card__play"
                onClick={(e) => {
                  e.stopPropagation()
                  playContext(m.tracks, undefined, m.name)
                }}
                aria-label={`Play ${m.name}`}
              >
                <Play size={18} fill="#fff" />
              </button>
            </div>
            <div className="card__title" title={m.name}>
              {m.name}
            </div>
            <div className="card__sub" title={m.blurb}>
              {m.blurb}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MixView({ id }: { id: string }) {
  const { mixes, loading } = useMixes()
  const mix = mixes.find((m) => m.id === id)
  const [extra, setExtra] = useState<Track[]>([])

  // A thin artist mix names a search that would fill it out. Run it only here,
  // when the mix is actually open — never for every tile on Home.
  const fill = mix?.fill
  useEffect(() => {
    setExtra([])
    if (!fill) return
    let live = true
    searchYT(fill)
      .then((found) => live && setExtra(found.slice(0, 25)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [fill, id])

  const tracks = useMemo(() => {
    if (!mix) return []
    const have = new Set(mix.tracks.map((t) => t.id))
    return [...mix.tracks, ...extra.filter((t) => !have.has(t.id))]
  }, [mix, extra])

  if (!mix) {
    return (
      <div className="view">
        <div className="state">
          {loading ? (
            <>
              <div className="spinner" />
              <span>Building your mix…</span>
            </>
          ) : (
            <p>This mix isn’t available right now — it changes as you listen.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <header className="phead">
        <MixArt mix={mix} className="phead__cover" />
        <div className="phead__meta">
          <span className="phead__type">Made for you</span>
          <h1 className="phead__title">{mix.name}</h1>
          <p className="phead__desc">{mix.blurb}</p>
          <p className="phead__sub">
            {tracks.length} songs · refreshed daily
          </p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
          </div>
        </div>
      </header>
      <TrackList tracks={tracks} />
    </div>
  )
}
