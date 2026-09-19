<!--
SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
SPDX-License-Identifier: Apache-2.0
-->

# dancing with marcel

## Run

1. `python3 -m http.server 8080`
2. Open `http://localhost:8080/`
3. Click start, allow the microphone

## Tune

- `?debug=1` shows the live level
- `?musicDb=-38&breakDb=-48` sets the level thresholds in dBFS
- `?musicEnterMs=1000&breakHoldMs=2000` sets the switch delays

## Develop

1. `npm ci --ignore-scripts`
2. `npm run check`
3. `npm run check:pages`
