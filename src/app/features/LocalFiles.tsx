// Local files — play music from this computer alongside the streams.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, FolderPlus, HardDrive, Search as SearchIcon, X } from 'lucide-react'
import { BigPlay, TrackList } from '../App'
import { canScanLocal, localAddFolder, localRemoveFolder, localScan, type LocalScan } from '../../lib/desktop'
import { browserTracks, loadBrowserFiles, tracksFromScan } from '../../lib/local'
import type { Track } from '../../lib/types'

export function LocalFilesView() {
  const desktop = canScanLocal()
  const [scan, setScan] = useState<LocalScan | null>(null)
  const [webTracks, setWebTracks] = useState<Track[]>(browserTracks)
  const [loading, setLoading] = useState(desktop)
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!desktop) return
    let live = true
    localScan().then((s) => {
      if (!live) return
      setScan(s)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [desktop])

  // `webkitdirectory` isn't in React's input typings; set it on the element.
  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  const all = useMemo(
    () => (desktop ? tracksFromScan(scan?.files ?? []) : webTracks),
    [desktop, scan, webTracks],
  )
  const tracks = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return all
    return all.filter((t) => `${t.title} ${t.artist} ${t.genre || ''}`.toLowerCase().includes(q))
  }, [all, filter])

  const addFolder = async () => {
    if (!desktop) return inputRef.current?.click()
    setLoading(true)
    const next = await localAddFolder()
    if (next) setScan(next) // null = the picker was cancelled; keep what we have
    setLoading(false)
  }

  const removeFolder = async (root: string) => {
    const next = await localRemoveFolder(root)
    if (next) setScan(next)
  }

  const roots = scan?.roots ?? []

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--genre">
          <HardDrive size={64} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">On this device</span>
          <h1 className="phead__title">Local files</h1>
          <p className="phead__sub">
            <strong>{all.length}</strong> song{all.length === 1 ? '' : 's'}
            {desktop && roots.length > 0 && ` · ${roots.length} folder${roots.length === 1 ? '' : 's'}`}
          </p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
            <button className="btn-ghost localfiles__add" onClick={addFolder} disabled={loading}>
              <FolderPlus size={16} /> {all.length ? 'Add a folder' : 'Choose a music folder'}
            </button>
          </div>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="audio/*"
        onChange={(e) => {
          if (e.target.files?.length) setWebTracks(loadBrowserFiles(e.target.files))
          e.target.value = ''
        }}
      />

      {desktop && roots.length > 0 && (
        <div className="localfiles__roots">
          {roots.map((r) => (
            <span className="localfiles__root" key={r} title={r}>
              <FolderOpen size={14} />
              <span>{r}</span>
              <button onClick={() => removeFolder(r)} aria-label={`Remove ${r}`} title="Remove folder">
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {scan?.truncated && (
        <p className="localfiles__hint">
          Showing the first {scan.files.length.toLocaleString()} songs — that folder holds more than
          Synapz lists at once. Add a smaller folder to see the rest.
        </p>
      )}

      {loading ? (
        <div className="state">
          <div className="spinner" />
          <span>Scanning your music…</span>
        </div>
      ) : all.length === 0 ? (
        <div className="state">
          <p>{desktop && roots.length ? 'No audio files found in those folders.' : 'No local music yet.'}</p>
          <p className="state__hint">
            Choose a folder of MP3, FLAC, M4A, OGG or WAV files to play them here.
            {!desktop &&
              ' In the browser the folder is available until you close the tab; the desktop app remembers it.'}
          </p>
        </div>
      ) : (
        <>
          <div className="localfiles__filter">
            <SearchIcon size={15} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by song, artist or folder"
              spellCheck={false}
            />
          </div>
          {tracks.length ? (
            <TrackList tracks={tracks} />
          ) : (
            <div className="state">
              <p>Nothing matches “{filter}”.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
