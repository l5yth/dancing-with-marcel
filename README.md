<!--
SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
SPDX-License-Identifier: Apache-2.0
-->

# dancing with marcel

Audio-input guided dancing ASCII punk for Veit's birthday.

Marcel dances while music plays, faster for faster music and harder for louder
music. Between songs he smokes, has a beer, plays the console, or busies
himself backstage.

## Run

1. `python3 -m http.server 8080`
2. Open `http://localhost:8080/`
3. Click start, allow the microphone

The picture fills the window at any size. White on black, nothing else.

He starts dancing 12 to 18 seconds into a song and stops 2 seconds after it
ends, or about 25 seconds after if talking follows with no silence.

## Set the microphone level

Do this once on the machine that listens. Too much gain clips the music and he
never dances.

1. Record the quiet room: `pw-record --channels 1 --rate 44100 room.wav`, stop with Ctrl+C
2. Record a song at party volume the same way into `song.wav`
3. `ffmpeg -i room.wav -af volumedetect -f null - 2>&1 | grep -E "mean|max"`
4. Repeat for `song.wav`
5. Lower the input until the room's `mean_volume` is near -50 dB and the song's
   `max_volume` is below -3 dB: `wpctl set-volume @DEFAULT_AUDIO_SOURCE@ 25%`,
   and set any Mic Boost in `alsamixer` (F4) to 0
6. Check the result: `npm run eval -- room.wav` prints `music=0`, and
   `npm run eval -- song.wav` prints one `music` line within 20 s

## Publish

1. Push to `main`
2. In the repository on GitHub: Settings, Pages, Source: Deploy from a branch
3. Branch: `main`, folder: `/ (root)`, Save
4. Open `https://l5yth.github.io/dancing-with-marcel/`

The microphone needs https or localhost. Without internet at the venue, use
the local server above.

## Tune

Add parameters to the URL:

- `?debug=1` shows the live values and a link to the repository
- `?musicOverFloorDb=12&breakUnderFloorDb=8` sets how far over the room music
  must be to start, and to keep going
- `?musicEnterMs=3000&breakHoldMs=2000` sets the switch delays
- `?pulseEnter=0.15` sets how much pulse starts him dancing; lower it if he misses songs, raise it if he dances to a room
- `?pulseLeave=0.09&pulseLeaveMs=10000` set how little pulse stops him, and after how long
- `?pulseWindow=8` sets how many seconds of pulse are weighed
- `?minLevelSwingDb=0.1` sets how far the level must move; 0 switches it off
- `?levelWindowMs=400&timbreWindowMs=1500` set how far back level and timbre
  are read
- `?floorRiseDbPerSec=0.5` sets how fast the room level is relearned
- `?bpmMin=95&bpmMax=190` sets the tempo range
- `?tempoMinConfidence=0.15` sets how sure a tempo must be to be shown
- `?defaultBpm=140&bpmSettleMs=3000` set the dance tempo before one is
  detected, and how long a new one must hold
- `?driveRangeDb=18&sceneHoldMs=12000` set how loud counts as full energy, and
  how long one dance is held
- `?breakFrameMs=2400` sets how slowly a between-song scene plays

With `?debug=1` each value is shown next to the threshold it must clear.

## Check audio files

Needs `ffmpeg`.

```
npm run eval -- song.mp3 other.mp3 --gap 6
```

- `--gap <seconds>` inserts silence between files
- `--<parameter> <value>` overrides any parameter from Tune
- Output: one line per state change, a `file-summary:` line per file, and a
  final `summary:` line

## Develop

1. `npm ci --ignore-scripts`
2. `npm run check`
3. `npm run check:pages`

## Art

`design/gen.js` draws the sprites. `src/sprites/` is generated from it and is
not edited by hand. After changing the generator:

```
node design/render.mjs
```
