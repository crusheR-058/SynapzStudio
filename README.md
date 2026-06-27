<p align="left">
  <img src="public/logo.svg" alt="Synapz Studio Music" height="64" />
</p>

# Synapz Music

A Spotify-style music streaming web app built with **React + TypeScript + Vite**.
Unlike a mockup, it plays **real, full-length songs** — it streams from the
[Audius](https://audius.org) network, a free and legal decentralized music
platform. No API key, no login, no backend.

Two sources power playback:

- **Audius** (default, no setup) — a free, legal decentralized network with
  full-track playback. Skews indie / electronic / hip-hop / lo-fi.
- **YouTube via yt-dlp** (keyless) — unlocks essentially everything, including
  the full **Hindi / Bollywood** catalog, old and new, as full-length audio.
  No API key, no Google account.

## Why two sources (and not Spotify's catalog)

Spotify / Apple Music / YouTube Music *catalogs* are licensed and DRM-protected —
no third-party app can legally redistribute them. Audius is a real streaming
network with a public API and full-track playback. For mainstream music that
isn't on Audius (e.g. most Bollywood), the app uses a small local helper that
shells out to [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) to search YouTube and
resolve a direct audio stream, which the normal `<audio>` element plays.

## Hindi / Bollywood & the full catalog (keyless)

Open the **Bollywood** tab — the lanes (New Hits, Old Classics, 90s, Arijit
Singh, Romantic, Punjabi, Lo-Fi Hindi, Party) stream full songs from YouTube.
Regular search also shows a "From YouTube" section. **No setup or key required**,
as long as the dev server is running.

How it works: `vite.config.ts` adds two dev-server routes that call `yt-dlp`:

- `GET /yt/search?q=…` → YouTube search results (id, title, channel, duration).
- `GET /yt/stream?id=…` → 302-redirect to a fresh direct audio URL (cached).

### Requirements

- **`yt-dlp`** must exist at `bin/yt-dlp.exe` (Windows) or `bin/yt-dlp`
  (macOS/Linux). Download it from the
  [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases/latest).
  Update occasionally (`yt-dlp -U`) since YouTube changes break old versions.
- The helper is **dev-only** (it lives in the Vite dev server). A static
  production build won't have it.

> Note: extracting YouTube audio this way is a gray area under YouTube's Terms.
> It's intended here for **personal, local listening**. An optional, fully
> ToS-compliant path also exists via the YouTube Data API — set
> `VITE_YOUTUBE_API_KEY` in `.env` (see `.env.example`) and it's used as a
> fallback when the local helper isn't available.

## Run it

```bash
npm install
npm run dev      # starts BOTH the web app (5173) and the backend (8787)
```

`npm run dev` uses `concurrently` to run two processes:

- **web** — Vite dev server on http://localhost:5173 (proxies `/api` and `/yt`
  to the backend).
- **api** — the Express backend (`server/index.mjs`) on http://localhost:8787:
  accounts (Google + demo login), premium membership, and keyless YouTube search
  (via `yt-dlp`).

(Run them separately with `npm run dev:web` / `npm run dev:api` if you prefer.)

Build the frontend for production:

```bash
npm run build
```

## Accounts, login & Premium

- On first load you'll see a **login screen**. Click **Continue as guest** to jump
  straight in, or **Continue with Google**.
- **Google Sign-In**: real Google login activates automatically once you set
  `VITE_GOOGLE_CLIENT_ID` (see `.env.example`). Until then the Google button signs
  you in with a demo account. Sessions are cookie-based; users persist to
  `server/data.json`.
- **Premium** (sidebar → *Premium*): pick a plan and "upgrade". This is a **demo
  checkout — no real payment** is taken; it just flips your account to Premium so
  you can see the gold badge and the Premium experience. Real billing would need
  Stripe + keys + a backend webhook.

## Features

- **Real streaming** — full songs via the Audius stream API (`<audio>` element).
- **Home** — featured hero, "Good morning/afternoon" quick grid, trending tracks,
  popular playlists, and genre tiles, all pulled live.
- **Search** — debounced live search across tracks & playlists, with a "Top
  result" card and browse-all genre grid.
- **Playlists & genres** — open any playlist or genre into a full track list with
  a big Play button.
- **Player engine** — play/pause, next/prev, shuffle, repeat (off → all → one),
  seek/scrub, volume + mute, and a real progress bar driven by audio events.
- **Library** — Liked Songs and Recently Played, both persisted to
  `localStorage`.
- **Extras** — OS media-key support (Media Session API), space-bar play/pause,
  buffering spinner, now-playing equalizer animation, and graceful loading /
  error / empty states.

## Project structure

```
src/
  main.tsx            entry
  app/
    App.tsx           all UI: layout, sidebar, top nav, views, now-playing bar
    player.tsx        PlayerProvider — audio engine, queue, persistence
  lib/
    audius.ts         Audius API client (host discovery, search, trending, stream)
    types.ts          shared types
  styles/
    fonts.css         Figtree (Circular stand-in)
    theme.css         Spotify-dark color tokens
    app.css           component styles
```

## Notes

- Audius discovery nodes can occasionally be slow or rate-limited; the client
  bootstraps a healthy host and falls back if one is unreachable. If a section
  fails to load, just retry.
- Some tracks on Audius are gated/premium and won't stream for free; those are
  filtered out where possible.
