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
 * @file What Marcel does (SPEC D3, D10). The classifier says break or music;
 * this picks which of the sprite sheet's fifteen loops he performs.
 *
 * A break picks one of the four between-song scenes at random and keeps it
 * until the music returns, so he finishes his cigarette instead of flickering
 * between props. Music picks a loop whose energy matches how hard the room is
 * going, and holds it for `sceneHoldMs` so a dance reads as a dance. The
 * energy of a loop is the design project's own number, the strongest frame in
 * it, so adding a loop upstream needs no rule here.
 *
 * Pure: no browser API, no wall clock (SPEC invariant 4).
 */

import { FRAME_META, LOOPS } from '../sprites/index.js';

/**
 * How energetic each loop is: 0 for the between-song scenes, 1 to 3 for the
 * dance, taken from the strongest frame in the loop.
 *
 * @type {Record<string, number>}
 */
export const LOOP_ENERGY = Object.freeze(
  Object.fromEntries(
    Object.entries(LOOPS).map(([loop, frames]) => [
      loop,
      Math.max(...frames.map((frame) => FRAME_META[frame].energy)),
    ]),
  ),
);

/**
 * The loop names of one energy, in the sprite sheet's order.
 *
 * @param {number} energy Energy to select.
 * @returns {string[]} The loops.
 */
function loopsOfEnergy(energy) {
  return Object.keys(LOOPS).filter((loop) => LOOP_ENERGY[loop] === energy);
}

/**
 * The between-song scenes: smoking, a beer, the console, and backstage business.
 *
 * @type {LoopList}
 */
export const BREAK_LOOPS = Object.freeze(loopsOfEnergy(0));

/**
 * The dance loops, from the quietest verse to the hardest chorus.
 *
 * @type {LoopTiers}
 */
export const DANCE_LOOPS = Object.freeze([
  Object.freeze(loopsOfEnergy(1)),
  Object.freeze(loopsOfEnergy(2)),
  Object.freeze(loopsOfEnergy(3)),
]);

/**
 * Keep a value inside 0 and 1.
 *
 * @param {number} value The value.
 * @returns {number} The value, clamped.
 */
function unit(value) {
  return Math.min(1, Math.max(0, value));
}

/** Picks the loop Marcel performs, and holds it long enough to read as a scene. */
export class SceneDirector {
  /**
   * Create a director showing the first between-song scene.
   *
   * @param {SceneOptions} options Tuning, and where chance comes from.
   */
  constructor({ config, random = Math.random }) {
    /**
     * Thresholds and timings.
     * @type {Readonly<Config>}
     */
    this.config = config;
    /**
     * Where chance comes from.
     * @type {RandomSource}
     */
    this.random = random;
    /**
     * Loop being performed.
     * @type {string}
     */
    this.loop = BREAK_LOOPS[0];
    /**
     * State the loop was picked for.
     * @type {State}
     */
    this.state = 'break';
    /**
     * Energy the loop was picked for; 0 during a break.
     * @type {number}
     */
    this.energy = 0;
    /**
     * How hard the room is going, from 0 to 1.
     * @type {number}
     */
    this.drive = 0;
    /**
     * How long the loop has been held, in milliseconds.
     * @type {number}
     */
    this.heldMs = 0;
    /**
     * Whether a break has been started yet, so the first one still draws a scene.
     * @type {boolean}
     */
    this.started = false;
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
   * Choose one of a list at random.
   *
   * @param {LoopList} choices What to choose from.
   * @returns {string} The choice.
   */
  pick(choices) {
    return choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
  }

  /**
   * Feed one decision and get the scene to perform.
   *
   * @param {PipelineEvent} event The latest decision.
   * @param {number} frameMs Milliseconds of audio the decision covers.
   * @returns {string} The loop name.
   */
  update(event, frameMs) {
    this.heldMs += frameMs;
    this.drive = event.state === 'music' ? this.driveOf(event) : 0;
    const energy = event.state === 'music' ? 1 + Math.min(2, Math.floor(this.drive * 3)) : 0;
    const changed = event.state !== this.state || energy !== this.energy;
    if (changed || !this.started || this.heldMs >= this.config.sceneHoldMs) {
      // A break holds its scene until the music returns; a dance may be
      // swapped for another of the same energy once it has been held.
      if (changed || event.state === 'music' || !this.started) {
        this.loop = this.pick(energy === 0 ? BREAK_LOOPS : DANCE_LOOPS[energy - 1]);
      }
      this.state = event.state;
      this.energy = energy;
      this.heldMs = 0;
      this.started = true;
    }
    return this.loop;
  }
}
