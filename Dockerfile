# Synapz — single container that serves the built SPA + API + the yt-dlp audio
# proxy on ONE port. This is the deploy that lets YouTube/Bollywood/Hollywood
# tracks stream through <audio>, so they keep playing when the phone is locked.
# Works on Render, Railway, Fly.io, or any Docker host.
FROM node:20-slim

# yt-dlp is a self-contained python zipapp — it powers /yt/stream. Grab the
# latest release binary and drop it on PATH. (No ffmpeg needed: we request a
# single bestaudio[m4a] stream, so there's nothing to remux.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates curl \
  && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get purge -y curl && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching). npm ci here includes devDeps
# because NODE_ENV isn't "production" yet — Vite/TypeScript are needed to build.
COPY package*.json ./
RUN npm ci

# Copy the rest and build the frontend into dist/.
COPY . .

# Optional build-time keys — Vite bakes VITE_* vars into the bundle at build
# time. ALL default empty; the app degrades gracefully without them:
#   - search:  works keyless via the yt-dlp /yt/search helper (no key needed)
#   - login:   falls back to a demo account unless VITE_GOOGLE_CLIENT_ID is set
#   - sync:    likes/history stay local unless VITE_SUPABASE_* is set
# To enable any of these on Render, add the matching env var in the dashboard
# (Render exposes service env vars to the Docker build).
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_YOUTUBE_API_KEY=""
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_YOUTUBE_API_KEY=$VITE_YOUTUBE_API_KEY \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

ENV NODE_ENV=production \
    PORT=8787 \
    YTDLP_PATH=/usr/local/bin/yt-dlp
EXPOSE 8787

# The server serves dist/ + /api + /yt/stream. Hosts that inject their own $PORT
# (Render/Railway/Fly) are honored via process.env.PORT.
CMD ["node", "server/index.mjs"]
