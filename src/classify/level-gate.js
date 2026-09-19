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
 */

/** Level gate: `break` and `music` from the smoothed level alone. */
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
     * Smoothed level in dBFS; `null` before the first reading.
     * @type {number | null}
     */
    this.smoothedDb = null;
  }

  /**
   * Feed one level reading that covers `frameMs` of audio.
   *
   * @param {number} levelDb Level of the frame in dBFS.
   * @param {number} frameMs Duration of the audio the reading covers.
   * @returns {State} The state after this reading.
   */
  update(levelDb, frameMs) {
    const { musicDb, breakDb, musicEnterMs, breakHoldMs, smoothMs } = this.config;
    const alpha = 1 - Math.exp(-frameMs / smoothMs);
    this.smoothedDb =
      this.smoothedDb === null ? levelDb : this.smoothedDb + alpha * (levelDb - this.smoothedDb);
    if (this.state === 'break') {
      this.heldMs = this.smoothedDb >= musicDb ? this.heldMs + frameMs : 0;
      if (this.heldMs >= musicEnterMs) {
        this.state = 'music';
        this.heldMs = 0;
      }
    } else {
      this.heldMs = this.smoothedDb <= breakDb ? this.heldMs + frameMs : 0;
      if (this.heldMs >= breakHoldMs) {
        this.state = 'break';
        this.heldMs = 0;
      }
    }
    return this.state;
  }
}
