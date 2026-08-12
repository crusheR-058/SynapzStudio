# Synapz Mobile

The Android/iOS client. Shares its logic with the web and desktop apps through
`../core` — same types, same Supabase access, same Listen Along wire protocol.

## Run it

```bash
cd mobile
npm install
cp .env.example .env        # add your Supabase URL + anon key
npx expo start
```

Home and Search work immediately against live data. Sign-in needs the `.env`
values; without them the app still plays music, it just can't sync playlists.

**Expo Go will not work.** `react-native-track-player` is a native module, so you
need a development build:

```bash
npx expo run:android        # needs Android Studio + an SDK
```

or build in the cloud with EAS, which needs no local Android toolchain and no Mac
for iOS:

```bash
npx eas build --platform android --profile development
```

## How playback works

Two engines behind one queue, chosen per track:

| Source | Engine | Background | Lockscreen |
|---|---|---|---|
| Audius | track-player, or expo-audio | yes | yes / no |
| YouTube | embed, video visible | **no** | no |

YouTube tracks play only with the video on screen and pause when you leave the
app. That is not a limitation to route around: the embed's terms forbid
background and audio-only playback, and Play review looks for exactly this.
Never port the yt-dlp path from the desktop app to mobile.

`AudioHost` tries `react-native-track-player` first because it is the only
backend with a media session. It is a legacy-architecture module on a
New-Architecture-only SDK, so if setup fails the app falls back to `expo-audio` —
background audio still works, only the lockscreen buttons are lost. Check the
console on first launch to see which one you got.

## Catalogue

12,759 tracks are served as JSON from the web app, not bundled:

```bash
npm run catalog     # from the repo root — writes public/catalog/*.json
```

This runs automatically as part of `npm run build`, locally and on Vercel. Metro
has no dynamic `import()`, so bundling the catalogue would put 1.2 MB of
JavaScript in the APK and charge it on every cold start. Served and cached to
disk, the first launch fetches ~425 KB gzipped and every launch after that reads
from disk — including offline. It also means new music ships without a store
release.

## Sharing code with web and desktop

Import shared modules through `@core/*`, aliased in **both** `metro.config.js`
and `tsconfig.json`. Metro is what resolves at runtime; tsconfig only satisfies
the typechecker. If you add an alias, add it to both or you will get a build that
typechecks and won't bundle.

`core/` never reads `import.meta.env` (Vite-only, a syntax error under Metro) and
never constructs a Supabase client. Both are injected by `src/lib/supabase.ts`,
which is imported for its side effect at the top of `src/app/_layout.tsx`.

## Still to do

- Sign-in flow (Library reads cloud playlists but there is no way to log in yet)
- Listen Along — the protocol is already shared in `core/listen.ts`
- Play Store: privacy policy, Data Safety form, and the closed test that has to
  run before you can apply for production access
