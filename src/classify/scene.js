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
 * @file How hard the room is going (SPEC D3, F5). The classifier says break or
 * music; this turns the music into an energy tier, 1 to 3, and the show picks
 * what each punk does with it. Between songs the tier is 0.
 *
 * The start and the end of a song are taken at once. Inside a song the tier
 * follows the room only once the room has asked for the same new tier for
 * `tierSettleMs` without a break: a song that sits on the line between two
 * tiers crosses it again and again, and every crossing would start all three
 * punks on a new dance.
 *
 * Pure: no browser API, no wall clock (SPEC invariant 4). Time is the event's
 * own, counted in samples.
 */

/**
 * Keep a value inside 0 and 1.
 *
 * @param {number} value The value.
 * @returns {number} The value, clamped.
 */
function unit(value) {
  return Math.min(1, Math.max(0, value));
}

/** Turns what the classifier hears into the energy tier the punks dance to. */
export class SceneDirector {
  /**
   * Create a director between songs.
   *
   * @param {SceneOptions} options Tuning.
   */
  constructor({ config }) {
    /**
     * Thresholds and timings.
     * @type {Readonly<Config>}
     */
    this.config = config;
    /**
     * How hard the room is going, from 0 to 1.
     * @type {number}
     */
    this.drive = 0;
    /**
     * Energy tier: 0 between songs, 1 for a verse, 2 for a groove, 3 for a chorus.
     * @type {number}
     */
    this.tier = 0;
    /**
     * Tier the room is asking for, which the punks may not have followed yet.
     * @type {number}
     */
    this.asked = 0;
    /**
     * When the room began asking for it, in seconds of audio.
     * @type {number}
     */
    this.askedAt = 0;
  }

  /**
   * How hard the room is going: mostly how far the music sits over the room,
   * and partly how fast it is.
   *
   * @param {PipelineEvent} event The latest decision.
   * @returns {number} From 0 for barely there to 1 for everything at once.
   */
  driveOf(event) {
    const { musicOverFloorDb, driveRangeDb, bpmMin, bpmMax } = this.config;
    const over = event.levelDb - event.floorDb - musicOverFloorDb;
    const loud = unit(over / driveRangeDb);
    const fast = unit((event.danceBpm - bpmMin) / (bpmMax - bpmMin));
    return 0.6 * loud + 0.4 * fast;
  }

  /**
   * Feed one decision and get the tier to dance at.
   *
   * @param {PipelineEvent} event The latest decision.
   * @returns {number} 0 between songs; 1 to 3 while music plays.
   */
  update(event) {
    const dancing = event.state === 'music';
    this.drive = dancing ? this.driveOf(event) : 0;
    const asked = dancing ? 1 + Math.min(2, Math.floor(this.drive * 3)) : 0;
    if (asked !== this.asked) {
      this.asked = asked;
      this.askedAt = event.time;
    }
    // A song begins and ends at once; inside it, a new tier has to last.
    const settled = (event.time - this.askedAt) * 1000 >= this.config.tierSettleMs;
    if (asked === 0 || this.tier === 0 || settled) {
      this.tier = asked;
    }
    return this.tier;
  }
}
