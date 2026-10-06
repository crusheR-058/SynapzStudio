// Listening recap — "Wrapped", any time of year.

import { useMemo, useState } from 'react'
import { Download, Flame, Headphones, Music2, Play, Share2, Sparkles, Users } from 'lucide-react'
import { Cover, fmtDuration, useNav } from '../App'
import { useAuth } from '../auth'
import { usePlayer } from '../player'
import { usePlayEvents } from './usePlayEvents'
import {
  PERIODS,
  buildRecap,
  canvasToBlob,
  drawRecapCard,
  fmtHour,
  periodStart,
  periodTitle,
  type RecapPeriod,
} from '../../lib/recap'

export function RecapView() {
  const { user } = useAuth()
  const { playContext } = usePlayer()
  const { navigate, setQuery } = useNav()
  const { events, loading } = usePlayEvents()
  const [period, setPeriod] = useState<RecapPeriod>('month')
  const [shareNote, setShareNote] = useState<string | null>(null)

  const recap = useMemo(() => {
    const since = periodStart(period)
    return buildRecap(since ? events.filter((e) => e.at >= since) : events)
  }, [events, period])

  const title = periodTitle(period)
  const hourMax = Math.max(1, ...recap.byHour)
  const topTracks = recap.topTracks.map((x) => x.track)

  const makeCard = async () => {
    // The card is drawn with the app's webfont; wait for it or the first export
    // of a session renders in the fallback face.
    try {
      await document.fonts?.ready
    } catch {
      /* draw with whatever is loaded */
    }
    return canvasToBlob(drawRecapCard(recap, title, user?.name || ''))
  }

  const download = async () => {
    const blob = await makeCard()
    if (!blob) return setShareNote('Could not create the image.')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `synapz-recap-${title.toLowerCase().replace(/\s+/g, '-')}.png`
    a.click()
    URL.revokeObjectURL(url)
    setShareNote('Saved to your downloads.')
  }

  const share = async () => {
    const blob = await makeCard()
    if (!blob) return setShareNote('Could not create the image.')
    const file = new File([blob], 'synapz-recap.png', { type: 'image/png' })
    const data = { files: [file], title: `My Synapz recap — ${title}` }
    try {
      if (navigator.canShare?.(data)) {
        await navigator.share(data)
        return
      }
    } catch {
      return // the share sheet was dismissed
    }
    // No share sheet here (most desktop browsers): the clipboard is the next
    // most useful place for an image someone is about to paste into a chat.
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setShareNote('Image copied — paste it anywhere.')
    } catch {
      await download()
    }
  }

  const goArtist = (artist: string) => {
    setQuery(artist)
    navigate({ type: 'search' }, 'browse')
  }

  return (
    <div className="view recap">
      <header className="recap__head">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> Your recap
          </span>
          <h1 className="recap__title">{title}</h1>
        </div>
        <div className="chips recap__periods">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`exchip ${period === p.key ? 'on' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="state">
          <div className="spinner" />
          <span>Adding up your listening…</span>
        </div>
      ) : recap.plays === 0 ? (
        <div className="state">
          <p>Nothing played in this period yet.</p>
          <p className="state__hint">
            Play a few songs and your recap fills in.
            {!user && ' Sign in to count listening from all your devices.'}
          </p>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat stat--accent">
              <span className="stat__icon">
                <Headphones size={18} />
              </span>
              <span className="stat__value">{fmtDuration(recap.minutes * 60)}</span>
              <span className="stat__label">Listening time (about)</span>
            </div>
            <div className="stat">
              <span className="stat__icon">
                <Play size={16} fill="currentColor" />
              </span>
              <span className="stat__value">{recap.plays.toLocaleString()}</span>
              <span className="stat__label">Songs played</span>
            </div>
            <div className="stat">
              <span className="stat__icon">
                <Users size={18} />
              </span>
              <span className="stat__value">{recap.uniqueArtists.toLocaleString()}</span>
              <span className="stat__label">Different artists</span>
            </div>
            <div className="stat">
              <span className="stat__icon">
                <Flame size={18} />
              </span>
              <span className="stat__value">{recap.longestStreak}</span>
              <span className="stat__label">
                Longest streak (days)
                {recap.currentStreak > 1 ? ` · ${recap.currentStreak} now` : ''}
              </span>
            </div>
          </div>

          <section className="recap__persona">
            <span className="recap__persona-label">Your listening style</span>
            <h2>{recap.persona.title}</h2>
            <p>{recap.persona.blurb}</p>
            <div className="recap__share">
              <button className="btn-solid" onClick={share}>
                <Share2 size={15} /> Share recap
              </button>
              <button className="btn-ghost" onClick={download}>
                <Download size={15} /> Save image
              </button>
              {shareNote && <span className="recap__note">{shareNote}</span>}
            </div>
          </section>

          <div className="recap__cols">
            <section className="section">
              <div className="section__head">
                <h2>Top songs</h2>
                <button className="section__all" onClick={() => playContext(topTracks)}>
                  Play all
                </button>
              </div>
              <ol className="rank">
                {recap.topTracks.map((x, i) => (
                  <li key={x.track.id}>
                    <button className="rank__row" onClick={() => playContext(topTracks, x.track.id)}>
                      <span className="rank__n">{i + 1}</span>
                      <Cover src={x.track.artwork} alt={x.track.title} className="rank__art" />
                      <span className="rank__meta">
                        <b title={x.track.title}>{x.track.title}</b>
                        <i title={x.track.artist}>{x.track.artist}</i>
                      </span>
                      <span className="rank__count">{x.count}×</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="section">
              <div className="section__head">
                <h2>Top artists</h2>
              </div>
              <ol className="rank">
                {recap.topArtists.map((a, i) => (
                  <li key={a.artist}>
                    <button className="rank__row" onClick={() => goArtist(a.artist)}>
                      <span className="rank__n">{i + 1}</span>
                      <Cover src={a.artwork} alt={a.artist} className="rank__art rank__art--round" />
                      <span className="rank__meta">
                        <b title={a.artist}>{a.artist}</b>
                      </span>
                      <span className="rank__count">{a.count} plays</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section className="section">
            <div className="section__head">
              <h2>When you listen</h2>
              <span className="section__all">
                <Music2 size={13} /> Peak around {fmtHour(recap.peakHour)}
              </span>
            </div>
            <div className="hours" role="img" aria-label="Plays by hour of day">
              {recap.byHour.map((n, h) => (
                <div
                  className={`hours__bar ${h === recap.peakHour ? 'is-peak' : ''}`}
                  key={h}
                  title={`${fmtHour(h)} — ${n} play${n === 1 ? '' : 's'}`}
                >
                  <div className="hours__track">
                    <div className="hours__fill" style={{ height: `${Math.round((n / hourMax) * 100)}%` }} />
                  </div>
                  {h % 6 === 0 && <span className="hours__label">{fmtHour(h)}</span>}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
