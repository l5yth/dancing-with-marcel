<!--
SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
SPDX-License-Identifier: Apache-2.0
-->

# dancing with marcel

Audio-input guided dancing ASCII punk for Veit's birthday.

## Run

1. `python3 -m http.server 8080`
2. Open `http://localhost:8080/`
3. Click start, allow the microphone

## Tune

Add parameters to the URL:

- `?debug=1` shows the live values and a link to the repository
- `?musicOverFloorDb=12&breakUnderFloorDb=8` sets how far over the room music
  must be to start, and to keep going
- `?musicEnterMs=1000&breakHoldMs=2000` sets the switch delays
- `?maxFlatness=0.6` sets how noise-like the sound may be
- `?minBass=0.15&minOnsets=4&minFlux=0.1` set what counts as a pulse
- `?levelWindowMs=400&timbreWindowMs=1500` set how far back level and timbre
  are read
- `?floorRiseDbPerSec=3` sets how fast the room level is relearned
- `?bpmMin=95&bpmMax=190` sets the tempo range
- `?tempoMinConfidence=0.3` sets how sure a tempo must be to be shown
- `?defaultBpm=140&bpmSettleMs=3000` sets the dance tempo before one is
  detected, and how long a new one must hold

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
