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
 * @file A tier forced from the keyboard (SPEC T1 to T3). The keys `0` to `3`
 * set what the show hears for thirty seconds from the last press: `0` a
 * break, `1` to `3` a dance tier. When the thirty seconds are up, what the
 * detector and the director say applies again, and they have been running
 * underneath the whole time.
 *
 * It has no clock of its own: the caller says what time it is, on whatever
 * clock paces the show. Pure (SPEC invariant 4).
 */

/** Milliseconds a forced tier lasts, from the last press. */
export const OVERRIDE_MS = 30000;

/**
 * The tier each key forces.
 *
 * @type {ReadonlyMap<string, number>}
 */
const TIERS = new Map([
  ['0', 0],
  ['1', 1],
  ['2', 2],
  ['3', 3],
]);

/** A tier forced from the keyboard, until its thirty seconds are up. */
export class Override {
  /** Create one with nothing forced. */
  constructor() {
    /**
     * The tier last pressed, or `null` before any press.
     * @type {number | null}
     */
    this.tier = null;
    /**
     * When it runs out, in milliseconds on the caller's clock.
     * @type {number}
     */
    this.untilMs = 0;
  }

  /**
   * Take a key. One of the four forces its tier from now for {@link OVERRIDE_MS},
   * replacing whatever was forced and restarting the clock; any other key is
   * not a press and changes nothing.
   *
   * @param {string} key The key, as the keyboard names it.
   * @param {number} nowMs The time of the press.
   * @returns {boolean} Whether the key was one of the four.
   */
  press(key, nowMs) {
    const tier = TIERS.get(key);
    if (tier === undefined) {
      return false;
    }
    this.tier = tier;
    this.untilMs = nowMs + OVERRIDE_MS;
    return true;
  }

  /**
   * What is forced at a moment, if anything still is.
   *
   * @param {number} nowMs The moment.
   * @returns {Forced | null} The tier and how long it has left, or `null` once
   *   the thirty seconds are up or before any press.
   */
  at(nowMs) {
    if (this.tier === null || nowMs >= this.untilMs) {
      return null;
    }
    return { tier: this.tier, leftMs: this.untilMs - nowMs };
  }

  /**
   * What the show should hear at a moment: the forced tier while one holds,
   * otherwise what the detector and the director say.
   *
   * @param {number} nowMs The moment.
   * @param {Heard} auto What the detector and the director say.
   * @returns {Heard} What the show hears.
   */
  hearing(nowMs, auto) {
    const forced = this.at(nowMs);
    if (forced === null) {
      return auto;
    }
    return { dancing: forced.tier > 0, tier: forced.tier };
  }
}
