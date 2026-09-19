/*
   Copyright (C) 2026 Afri Blanck (@l5yth)

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

/**
 * @file Level-only break/music gate with hysteresis. Bucket B1 placeholder:
 * the tempo-aware classifier replaces it in B4 (SPEC D2, D7). Pure: time
 * advances only through the frame durations it is fed (SPEC invariant 4).
 *
 * The level is the loudest hop of the last `levelWindowMs`, not an average.
 * Music is mostly gaps between hits, and a silent hop reads -120 dBFS, so an
 * average would drag a drum track down towards silence and call it a break. A
 * peak that expires also falls as soon as the window empties, which an
 * exponential average does not: from a loud song to silence it would need
 * several time constants, and the break would land late.
 */

import { SILENCE_DB } from '../dsp/level.js';

/** Most hops the peak window may hold, whatever the frame length. */
const MAX_WINDOW_HOPS = 4096;

/** Level gate: `break` and `music` from the recent peak level alone. */
export class LevelGate {
  /**
   * Create a gate in the `break` state.
   *
   * @param {Config} config Thresholds and timings.
   */
  constructor(config) {
    /**
     * Thresholds and timings.
     * @type {Config}
     */
    this.config = config;
    /**
     * Current state.
     * @type {State}
     */
    this.state = 'break';
    /**
     * Milliseconds the condition for leaving the current state has held.
     * @type {number}
     */
    this.heldMs = 0;
    /**
     * Loudest hop in the window, in dBFS; `null` before the first reading.
     * @type {number | null}
     */
    this.levelDb = null;
    /**
     * Power of each hop in the window, oldest first.
     * @type {number[]}
     */
    this.recent = [];
  }

  /**
   * Feed one level reading that covers `frameMs` of audio.
   *
   * @param {number} levelDb Level of the frame in dBFS.
   * @param {number} frameMs Duration of the audio the reading covers.
   * @returns {State} The state after this reading.
   */
  update(levelDb, frameMs) {
    const { musicDb, breakDb, musicEnterMs, breakHoldMs, levelWindowMs } = this.config;
    const hops = Math.min(MAX_WINDOW_HOPS, Math.max(1, Math.round(levelWindowMs / frameMs)));
    this.recent.push(10 ** (levelDb / 10));
    while (this.recent.length > hops) {
      this.recent.shift();
    }
    this.levelDb = Math.max(SILENCE_DB, 10 * Math.log10(Math.max(...this.recent)));
    if (this.state === 'break') {
      this.heldMs = this.levelDb >= musicDb ? this.heldMs + frameMs : 0;
      if (this.heldMs >= musicEnterMs) {
        this.state = 'music';
        this.heldMs = 0;
      }
    } else {
      this.heldMs = this.levelDb <= breakDb ? this.heldMs + frameMs : 0;
      if (this.heldMs >= breakHoldMs) {
        this.state = 'break';
        this.heldMs = 0;
      }
    }
    return this.state;
  }
}
