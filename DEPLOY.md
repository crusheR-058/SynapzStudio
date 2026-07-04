# Deploying Synapz Music to Vercel

The app is now Vercel-ready: a static Vite frontend + **serverless functions** in
`/api` (auth, premium, profile) using **stateless signed-cookie sessions** — no
database, no in-memory state, no filesystem (all of which break on serverless).
`yt-dlp` is local-dev only; in production, YouTube search uses the **Data API**.

## What runs where

| Piece | Local dev (`npm run dev`) | Vercel (production) |
| --- | --- | --- |
| Frontend | Vite dev server `:5173` | static build in `dist/` |
| Auth / premium API | Express `server/index.mjs` `:8787` | functions in `/api/*.mjs` |
| YouTube search | yt-dlp (keyless, unlimited) | YouTube **Data API** (your key) |
| Sessions | signed cookie (`lib/session.mjs`) | signed cookie (same lib) |
| Music (Audius) | direct from browser | direct from browser |

## One-time deploy (run these locally)

The Vercel CLI is already installed. From `c:\SynapzStudio`:

```bash
# 1. Log in (opens your browser — only you can do this)
vercel login

# 2. Link & create the project (accept the Vite defaults it detects).
#    When it asks the project name, use a lowercase name like: synapz-music
#    (the folder name "SynapzStudio" is rejected — names must be lowercase).
vercel link

# 3. Add the three environment variables (to Production + Preview + Development)
#    VITE_* are read at BUILD time by Vite; SESSION_SECRET at runtime.
vercel env add VITE_GOOGLE_CLIENT_ID
#   paste your OAuth client id, e.g. <id>.apps.googleusercontent.com
vercel env add VITE_YOUTUBE_API_KEY
#   paste your YouTube Data API v3 key
vercel env add SESSION_SECRET
#   paste a long random string, e.g. generate one with:
#     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Deploy to production
vercel --prod
```

Vercel prints your URL, e.g. `https://synapz-music.vercel.app`.

## Auto-deploy on save (continuous deploy)

Leave this running in a terminal while you work — it watches `src/`, `api/`,
`lib/`, `public/` + the root config files and runs `vercel --prod` a few seconds
after you stop editing:

```bash
npm run deploy:watch
```

- Debounced (default 8s after your last save) so it deploys once per editing
  burst, not per keystroke. Tune with `DEPLOY_DEBOUNCE_MS` (ms).
- Saves made *during* a deploy are queued, so nothing is missed.
- Each change goes live at https://synapz-music.vercel.app in ~20–40s.
- Stop with Ctrl+C. Heads-up: every burst is a real deploy, and the Hobby plan
  allows 100 deploys/day — so run it while actively working, not 24/7.

## After the first deploy — two Google Console updates

Both use your final Vercel domain (swap in yours):

1. **Google OAuth client** (so Google login works on the live site)
   → APIs & Services → Credentials → *Synapz Music* (OAuth client) →
   **Authorized JavaScript origins** → add `https://YOUR-APP.vercel.app` → Save.

2. **YouTube Data API key** (so search works on the live site)
   → Credentials → *Key_1* → **Application restrictions → Websites** →
   add `https://YOUR-APP.vercel.app/*` → Save.

(Allow ~1–2 min for Google to propagate, then hard-refresh the site.)

## Background playback (locked-screen audio) — two modes

Whether a song keeps playing when the phone is locked depends on **how it's
streamed**, because mobile browsers force-pause embedded YouTube on lock:

| Track | Vercel (current) | Self-hosted Node backend |
| --- | --- | --- |
| Audius / direct-stream | ✅ backgrounds | ✅ backgrounds |
| Bollywood / Hollywood / YouTube | ❌ IFrame → pauses on lock | ✅ streams via `<audio>` → backgrounds |

**Vercel is serverless**, so it can't run `yt-dlp` — YouTube tracks stay on the
IFrame and pause on lock. That's unavoidable there. Everything still works; only
locked-screen playback of YouTube tracks is affected.

**To make ALL songs background-play**, run the Node backend (`server/index.mjs`)
on a persistent host — it exposes `/yt/stream`, a yt-dlp audio proxy, and the
frontend auto-detects it (via `/yt/capabilities`) and routes YouTube tracks
through a normal `<audio>` element. Single-server run:

```bash
npm run build          # emits dist/
node server/index.mjs  # serves dist/ + /api + /yt/stream on ONE port (:8787)
```

### Recommended: one container (Docker) on Render

The repo ships a `Dockerfile` (installs yt-dlp, builds the frontend, runs the
server) and a `render.yaml` Blueprint. The container needs **no API keys** — both
playback *and* search go through the keyless yt-dlp helper.

1. Render dashboard → **New +** → **Blueprint** → pick this repo → **Apply**.
   (`render.yaml` defines the Docker web service and auto-generates
   `SESSION_SECRET`.)
2. When it's **Live**, sanity-check:
   - `/api/health` → `{"ok":true,"runtime":"local"}`
   - `/yt/capabilities` → `{"stream":true}`  ← background streaming is on
3. On your phone: open the URL → **Add to Home Screen** → play a song → lock it.

Same Dockerfile deploys to Railway / Fly.io / any Docker host.

**Optional keys** (all default off, app degrades gracefully): add
`VITE_GOOGLE_CLIENT_ID` (real Google login vs. demo account),
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (cross-device synced likes) as
env vars in the host — they're wired as Docker build args.

### Requirements / caveats

- **yt-dlp**: the Docker image installs it on `PATH`; for a bare
  `node server/index.mjs` run it must exist at `bin/yt-dlp` (Linux) /
  `bin/yt-dlp.exe` (Windows), or point `YTDLP_PATH` at it. Keep it updated
  (`yt-dlp -U`) — YouTube changes break old versions.
- **Datacenter-IP risk**: YouTube may serve a "confirm you're not a bot" wall to
  cloud IPs (Render/Railway/Fly), so some tracks fail extraction there and fall
  back to the IFrame. A **residential IP** (your own always-on machine) is far
  more reliable; expose it over HTTPS with a free Cloudflare Tunnel. Audius
  tracks always background-play regardless.
- Extraction adds ~2–5s to a YouTube track's **first** play; the resolved URL is
  cached ~5h, and bytes are proxied through the server (googlevideo URLs are
  IP-locked, so redirecting won't work — proxying is required).
- If a stream fails, that track silently falls back to the IFrame.
- Install the site as a PWA ("Add to Home Screen") for the most reliable
  Android background behaviour.

## Notes / trade-offs

- **Search quota:** on **Vercel**, search uses the YouTube Data API (~100
  searches/day on the free tier). On a **self-hosted / Docker** deploy, search is
  keyless (yt-dlp `/yt/search`) — no quota. Audius is keyless and always works.
- **Sessions are in the cookie**, signed with `SESSION_SECRET` (HMAC — a user
  can't forge premium). They're per-browser and last 30 days. There's no
  cross-device account store; add Vercel KV/Postgres later if you want that.
- **Google token** is decoded, not signature-verified (fine for personal use).
  To harden, verify with `google-auth-library` inside `api/auth/google.mjs`.
- Re-deploy anytime with `vercel --prod` (or push to a connected Git repo).
