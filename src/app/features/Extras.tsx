// Smaller pieces: Last.fm scrobbling, desktop preferences, and the web install
// button. Each settings block renders nothing where it doesn't apply.

import { useEffect, useRef, useState } from 'react'
import { Download, PictureInPicture2 } from 'lucide-react'
import { usePlayer } from '../player'
import { isDesktop } from '../../lib/discord'
import {
  GLOBAL_SHORTCUTS,
  applyDesktopPrefs,
  desktopPrefs,
  toggleMiniPlayer,
  type DesktopPrefs,
} from '../../lib/desktop'
import {
  lastfmBeginAuth,
  lastfmBuiltIn,
  lastfmConnected,
  lastfmDisconnect,
  lastfmFinishAuth,
  lastfmHasCreds,
  lastfmNowPlaying,
  lastfmScrobble,
  lastfmUser,
  setLastfmCreds,
} from '../../lib/lastfm'
import { useInstallPrompt } from '../../lib/pwa'

/* ----------------------------------------------------------- scrobbling */

/**
 * Watches the player and scrobbles to Last.fm. Renders nothing.
 *
 * Follows Last.fm's own rule for what counts as a listen: the track is longer
 * than 30 seconds, and has been PLAYED (not merely loaded) for half its length
 * or four minutes, whichever comes first. Played time is counted in wall-clock
 * seconds while audio is running, so pausing or scrubbing can't fake a listen.
 */
export function Scrobbler() {
  const { currentTrack, isPlaying, duration } = usePlayer()
  const session = useRef({ id: '', startedAt: 0, played: 0, done: false })
  const durRef = useRef(0)
  durRef.current = duration || currentTrack?.duration || 0
  const trackRef = useRef(currentTrack)
  trackRef.current = currentTrack

  useEffect(() => {
    session.current = { id: currentTrack?.id || '', startedAt: Date.now(), played: 0, done: false }
    if (currentTrack && lastfmConnected()) void lastfmNowPlaying(currentTrack)
  }, [currentTrack?.id])

  useEffect(() => {
    if (!isPlaying) return
    const iv = window.setInterval(() => {
      const s = session.current
      const t = trackRef.current
      if (!t || s.done || s.id !== t.id) return
      s.played += 1
      const len = durRef.current
      if (len <= 30) return
      if (s.played >= Math.min(len / 2, 240)) {
        s.done = true
        if (lastfmConnected()) void lastfmScrobble(t, s.startedAt)
      }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [isPlaying])

  return null
}

export function LastfmSettings() {
  const [connected, setConnected] = useState(lastfmConnected)
  const [user, setUser] = useState(lastfmUser)
  const [hasCreds, setHasCreds] = useState(lastfmHasCreds)
  const [key, setKey] = useState('')
  const [secret, setSecret] = useState('')
  // Set while the listener is over on last.fm approving the app.
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const begin = async () => {
    setNote(null)
    setBusy(true)
    try {
      if (!lastfmBuiltIn()) {
        if (!key.trim() || !secret.trim()) {
          setNote('Enter both the API key and the shared secret.')
          return
        }
        setLastfmCreds(key, secret)
        setHasCreds(true)
      }
      const auth = await lastfmBeginAuth()
      setToken(auth.token)
      window.open(auth.url, '_blank', 'noopener')
    } catch (e: any) {
      setNote(e?.message || 'Could not reach Last.fm.')
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    if (!token) return
    setBusy(true)
    setNote(null)
    try {
      const name = await lastfmFinishAuth(token)
      setUser(name)
      setConnected(true)
      setToken(null)
    } catch {
      setNote('Not approved yet — click “Yes, allow access” on the Last.fm page, then try again.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = () => {
    lastfmDisconnect()
    setConnected(false)
    setUser('')
    setToken(null)
  }

  return (
    <section className="section">
      <div className="section__head">
        <h2>Last.fm scrobbling</h2>
      </div>
      {connected ? (
        <div className="setrow">
          <span className="setrow__dot setrow__dot--on" />
          <span className="setrow__text">
            Scrobbling as <b>{user || 'your Last.fm account'}</b>
          </span>
          <button className="btn-ghost" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      ) : token ? (
        <div className="setrow">
          <span className="setrow__dot" />
          <span className="setrow__text">Approve Synapz on the Last.fm page that just opened.</span>
          <button className="btn-solid" onClick={finish} disabled={busy}>
            {busy ? 'Checking…' : 'I’ve approved it'}
          </button>
          <button className="btn-ghost" onClick={() => setToken(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          {!lastfmBuiltIn() && (
            <div className="lastfm__keys">
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={hasCreds ? 'API key (saved — enter to replace)' : 'Last.fm API key'}
                spellCheck={false}
                autoComplete="off"
              />
              <input
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Shared secret"
                type="password"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )}
          <button className="btn-solid" onClick={begin} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Last.fm'}
          </button>
        </>
      )}
      {note && <p className="setnote setnote--warn">{note}</p>}
      <p className="setnote">
        Sends each song you finish to your Last.fm profile.
        {!lastfmBuiltIn() && !connected && (
          <>
            {' '}
            You need a free API key and secret from{' '}
            <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">
              last.fm/api
            </a>
            ; they stay on this device.
          </>
        )}
      </p>
    </section>
  )
}

/* ------------------------------------------------------ desktop settings */

/** Hands the shell its saved preferences once, at startup. Renders nothing. */
export function DesktopPrefsSync() {
  useEffect(() => {
    if (isDesktop()) applyDesktopPrefs()
  }, [])
  return null
}

export function DesktopSettings() {
  const [prefs, setPrefs] = useState<DesktopPrefs>(desktopPrefs)
  if (!isDesktop()) return null

  const set = (patch: Partial<DesktopPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    applyDesktopPrefs(next)
  }

  return (
    <section className="section">
      <div className="section__head">
        <h2>Desktop app</h2>
      </div>
      <label className="setrow">
        <span className="setrow__text">
          Keep playing in the tray when I close the window
          <i>Quit from the tray icon’s menu.</i>
        </span>
        <span className="switch">
          <input
            type="checkbox"
            checked={prefs.closeToTray}
            onChange={(e) => set({ closeToTray: e.target.checked })}
          />
          <span className="switch__sl" />
        </span>
      </label>
      <label className="setrow">
        <span className="setrow__text">
          Global keyboard shortcuts
          <i>Control playback while Synapz is in the background.</i>
        </span>
        <span className="switch">
          <input
            type="checkbox"
            checked={prefs.globalShortcuts}
            onChange={(e) => set({ globalShortcuts: e.target.checked })}
          />
          <span className="switch__sl" />
        </span>
      </label>
      {prefs.globalShortcuts && (
        <dl className="shortcuts">
          {GLOBAL_SHORTCUTS.map((s) => (
            <div key={s.keys}>
              <dt>{s.keys}</dt>
              <dd>{s.action}</dd>
            </div>
          ))}
        </dl>
      )}
      <button className="btn-ghost" style={{ marginTop: 12 }} onClick={toggleMiniPlayer}>
        <PictureInPicture2 size={15} /> Open mini player
      </button>
    </section>
  )
}

/**
 * "Mini player" row for the playback-settings popover. Desktop only. It lives
 * there rather than as its own button because the player bar has no width to
 * spare once a track is loaded.
 */
export function MiniPlayerRow({ onOpen }: { onOpen: () => void }) {
  if (!isDesktop()) return null
  return (
    <div className="exmenu__sec">
      <div className="exmenu__title">
        <span>
          <PictureInPicture2 size={14} /> Mini player
        </span>
        <button
          className="link"
          onClick={() => {
            toggleMiniPlayer()
            onOpen()
          }}
        >
          Open
        </button>
      </div>
      <div className="exmenu__note">A small always-on-top window with the controls.</div>
    </div>
  )
}

/* ------------------------------------------------------------- install */

/** Sidebar "Install app" button — appears only when the browser offers it. */
export function InstallButton() {
  const { canInstall, install } = useInstallPrompt()
  if (!canInstall) return null
  return (
    <button className="sb-getapp sb-getapp--install" onClick={() => void install()}>
      <Download size={16} />
      <span>Install Synapz</span>
    </button>
  )
}
