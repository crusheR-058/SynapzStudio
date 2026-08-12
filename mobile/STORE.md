# Play Store submission

Everything the Play Console asks for, with the answers that match what the app
actually does. Verify current requirements in the Console — Google changes them.

## Start the clock first

New **personal** developer accounts must run a closed test with a minimum number
of testers for a continuous period before you may apply for production access —
around **12 testers for 14 days** when this was last checked. It is the single
most common reason a finished app sits unpublished for a fortnight.

Create the account and open the closed track **before** you finish building, so
the clock runs while you work.

## Build

```bash
cd mobile
npx eas login
npx eas build:configure          # once, links the project

npx eas build --platform android --profile development   # dev build, has RNTP
npx eas build --platform android --profile preview       # shareable APK
npx eas build --platform android --profile production    # .aab for Play
```

`production` emits an `.aab` and auto-increments the version code. `preview`
emits an installable `.apk` — that is the one to hand testers directly.

## Listing

**Title** (30 max)
`Synapz Music`

**Short description** (80 max)
`Bollywood, Hollywood and indie — plus listen along with friends in real time.`

**Full description** (4000 max)

```
Synapz Music is a music player built around one idea: listening is better
together.

A CATALOGUE THAT ACTUALLY HAS YOUR MUSIC
Over 12,000 tracks spanning Bollywood, Punjabi, Tamil, Telugu, Malayalam,
Kannada, Bengali, Marathi, Indian indie, Sufi and ghazal — alongside Hollywood
pop, rock and hip-hop, and a growing podcast library. 185 artists with their
full discographies, organised by scene.

LISTEN ALONG
Start a room, share the link, and everyone hears the same song at the same
moment. Play, pause and skip stay in sync for everyone listening.

BACKGROUND PLAYBACK
Audius tracks keep playing with the screen off, with full lockscreen controls.

YOUR LIBRARY, EVERYWHERE
Sign in and your playlists, liked songs and history follow you between your
phone and the Synapz desktop app.

BUILT TO BE QUIET
No ads. No tracking. No analytics. Nothing collected until you choose to sign
in.

Note: some tracks play through the official YouTube player, with the video on
screen, and pause when you leave the app.
```

## Data safety form

| Question | Answer |
|---|---|
| Does the app collect or share user data? | **Yes** (only when signed in) |
| Is data encrypted in transit? | **Yes** |
| Can users request deletion? | **Yes** — email, per the privacy policy |

Data types to declare:

- **Personal info → Name, Email address** — collected, not shared. Purpose:
  *Account management*. Optional (the app works signed out).
- **App activity → Other user-generated content** (playlists, likes, history) —
  collected, not shared. Purpose: *App functionality*. Optional.

Declare nothing else. The app requests no location, contacts, photos,
microphone, files or advertising ID.

**Privacy policy URL:** `https://synapz-music.vercel.app/privacy`

## Content rating

Answer the questionnaire honestly: no violence, no sexual content, no gambling.
The one thing to flag is **user-generated content / user interaction**, because
Listen Along room names carry a host's display name. Expect *Teen* or *Everyone*.

## Screenshots

Minimum two phone screenshots, 16:9 or 9:16, at least 320px on the short edge.
Capture from a real device:

1. Home with the catalogue chips and rails
2. An artist page with the full track list
3. Now Playing
4. Listen Along with a room code
5. Search with results

Feature graphic: 1024 × 500. Use the icon mark on `#0a0a0c`.

## Before you submit

- [ ] Run on a real device and confirm which audio backend loads (see README)
- [ ] Confirm YouTube tracks show the video and pause on background
- [ ] Sign in, create a playlist, like a song, confirm they survive a restart
- [ ] Test Listen Along with a second account on a second device
- [ ] Check the privacy policy URL resolves
- [ ] `npx expo-doctor` — the track-player New Architecture warning is known
