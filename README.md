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

## Desktop app + Discord Rich Presence

Synapz also runs as a native desktop app (Electron) for **Windows and macOS**.
The desktop build bundles the backend, so the keyless YouTube/Bollywood search
works out of the box, and it adds **Discord Rich Presence** — while a song plays,
your Discord profile shows *"Listening to Synapz Music — &lt;song&gt; by &lt;artist&gt;"*
with album art and a live progress bar.

> Why desktop for this? Discord Rich Presence is delivered over a local IPC
> socket that a browser tab can't reach. The desktop shell talks to the Discord
> client directly — no browser extension or separate helper needed.

### Set up Discord Rich Presence (one time)

1. Create an application at <https://discord.com/developers/applications> and
   **name it exactly `Synapz Music`** (that name appears after "Listening to").
2. Copy its **Application (Client) ID**.
   - For `npm run dev:electron`, put it in `.env` as `DISCORD_CLIENT_ID=…`.
   - For a **packaged** build, either set `DISCORD_CLIENT_ID` in the environment
     before building, or hard-code it in [`electron/main.cjs`](electron/main.cjs)
     (`const DISCORD_CLIENT_ID = '…'`) so it ships inside the app.
3. *(Optional, nicer art)* Under **Rich Presence → Art Assets**, upload
   `synapz_logo` (large-image fallback) and `playing` / `paused` (small badges).
4. The Discord **desktop app must be running**. Toggle presence any time under
   **Account → Discord presence**.

### Run & build locally

```bash
npm run dev:electron    # Vite + Electron (hot reload); loads the dev server
npm run dist:win        # build a Windows installer  -> release/
npm run dist:mac        # build a macOS .dmg (run on macOS or CI)
```

`npm run dist` builds the current platform. Each `dist:*` regenerates the app
icon from `public/icon.svg` (`npm run icons`), bundles the UI, then packages with
electron-builder. Installers land in `release/` (gitignored).

> **macOS note:** the bundled `yt-dlp` under `bin/` is the Windows binary. For a
> Mac build, also place the macOS `yt-dlp` binary at `bin/yt-dlp` before packaging
> (it's copied into the app's resources). Building a `.dmg` requires running on
> macOS (or CI) — electron-builder can't produce mac targets from Windows.

### Publish a downloadable release (the "Get the desktop app" link)

The web app's sidebar has a **Get the desktop app** link (web build only) pointing
at this repo's [latest GitHub Release](https://github.com/crusheR-058/SynapzStudio/releases/latest).
To populate it, push a version tag and let CI build + attach both installers:

```bash
git tag v1.0.2
git push origin v1.0.2
```

[`.github/workflows/release.yml`](.github/workflows/release.yml) builds on
`windows-latest` + `macos-latest` (downloading the correct `yt-dlp` per OS), then
a single `publish` job uploads everything to **one** GitHub Release via
`GITHUB_TOKEN` — no secrets to configure. Three installers are produced:

- **Windows:** `Synapz-Music-Setup-<v>.exe`
- **macOS Apple Silicon:** `Synapz-Music-<v>-arm64.dmg`
- **macOS Intel:** `Synapz-Music-<v>-x64.dmg`

> Publishing from each matrix job in parallel races and splits assets across
> duplicate draft releases — that's why building and publishing are separate jobs.

### Opening the unsigned builds

- **Windows:** SmartScreen → **More info → Run anyway**.
- **macOS:** the `.dmg` app is **ad-hoc signed** (a free local signature) so Apple
  Silicon will run it — **right-click the app → Open → Open**. Ad-hoc signing is
  what stops the *"…is damaged and can't be opened"* error that plain-unsigned
  arm64 apps hit. If macOS still complains, clear the download quarantine:
  ```bash
  xattr -cr "/Applications/Synapz Music.app"
  ```

### Code signing (optional — removes the "unverified app" warnings)

Builds are **unsigned** by default, so first launch shows Windows SmartScreen
("More info → Run anyway") or macOS Gatekeeper ("right-click → Open"). Signing is
already wired into the release workflow — it stays off until you add the matching
repo secrets (Settings → Secrets and variables → Actions), then activates
automatically on the next release:

| Platform | Secrets | How to get them |
| --- | --- | --- |
| Windows | `WIN_CSC_LINK` (base64 of your `.pfx`), `WIN_CSC_KEY_PASSWORD` | An **OV/EV code-signing certificate** from a CA (DigiCert, Sectigo, …). Note: only an EV cert clears SmartScreen instantly; OV needs to build reputation. |
| macOS sign | `MAC_CSC_LINK` (base64 of a **Developer ID Application** `.p12`), `MAC_CSC_KEY_PASSWORD` | An **Apple Developer account** ($99/yr) → export the cert from Keychain. |
| macOS notarize | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Same Apple account; create an app-specific password at appleid.apple.com. |

Base64-encode a cert with `base64 -w0 cert.pfx` (Linux) or
`base64 -i cert.pfx` (macOS), and paste the output as the secret value.

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

## Disclaimer

**Synapz Music is a personal, non-commercial, educational project — not a product
or a service, and not published or distributed to the public.**

- **Not affiliated** with YouTube, Google, Spotify, Audius, Discord, or any music
  label, artist, or rights holder. All trademarks belong to their respective owners.
- **Audius** is used through its public API for legal, full-track streaming.
- The optional **YouTube (`yt-dlp`) helper** extracts audio for **personal, local
  listening only**. Doing so may conflict with YouTube's Terms of Service. You are
  solely responsible for how you use it and for complying with YouTube's ToS,
  `yt-dlp`'s terms, and the copyright laws of your country.
- The baked song lists contain only public **references** (YouTube video IDs,
  titles, artists) — **no audio or copyrighted media files** are stored or
  distributed by this repository.
- Provided **"as is"**, with no warranty and no liability (see [`LICENSE`](LICENSE)).
  Nothing here is legal advice.

## License

Released under the [MIT License](LICENSE). © 2026 crusheR-058.
