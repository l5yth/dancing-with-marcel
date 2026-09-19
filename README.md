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

- `?debug=1` shows the live values
- `?musicDb=-38&breakDb=-48` sets the level thresholds in dBFS
- `?musicEnterMs=1000&breakHoldMs=2000` sets the switch delays
- `?levelWindowMs=400` sets how far back the level looks for its loudest moment
- `?bpmMin=95&bpmMax=190` sets the tempo range
- `?tempoMinConfidence=0.3` sets how sure a tempo must be to count
- `?defaultBpm=140&bpmSettleMs=3000` sets the dance tempo before one is
  detected, and how long a new one must hold

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
