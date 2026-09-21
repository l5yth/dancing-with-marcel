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
 * @file Helpers for the tests of the show: chance that answers from a script,
 * and ticking that fails rather than hangs.
 */

import assert from 'node:assert/strict';

/** @typedef {import('../../src/classify/show.js').Show} Show */

/**
 * Chance that answers from a queue, and with a fallback once it is empty.
 * 0.99 says no to every roll and 0 says yes to every one.
 *
 * @param {number} [fallback] What to answer when nothing is queued.
 * @returns {{queue: number[], fallback: number, calls: number, next: () => number}} The source.
 */
export function chance(fallback = 0.99) {
  const source = {
    /** @type {number[]} */
    queue: [],
    fallback,
    calls: 0,
    next: () => {
      source.calls += 1;
      const queued = source.queue.shift();
      return queued === undefined ? source.fallback : queued;
    },
  };
  return source;
}

/**
 * Tick until everybody who is walking on has arrived.
 *
 * @param {Show} show The show.
 * @returns {number} Ticks it took.
 */
export function arrive(show) {
  let ticks = 0;
  while (show.punks.some((punk) => punk.state === 'enter')) {
    show.tick();
    ticks += 1;
    assert.ok(ticks < 200, 'somebody never came home');
  }
  return ticks;
}

/**
 * Tick a show until something is so, and fail rather than hang if it never is:
 * a rule gone wrong should be a red test, not a suite that does not end.
 *
 * @param {Show} show The show.
 * @param {() => boolean} done Whether it is so.
 * @param {(ticks: number) => void} [each] What to check after every tick.
 * @returns {number} Ticks it took.
 */
export function tickUntil(show, done, each = () => {}) {
  let ticks = 0;
  while (!done()) {
    show.tick();
    ticks += 1;
    assert.ok(ticks < 1000, 'a thousand ticks went by and it never happened');
    each(ticks);
  }
  return ticks;
}

/**
 * One punk of a show.
 *
 * @param {Show} show The show.
 * @param {string} id Which.
 * @returns {PunkState} The punk.
 */
export function punkOf(show, id) {
  const found = show.punks.find((punk) => punk.id === id);
  assert.ok(found, id);
  return found;
}

/** Draws that deal a break without moving a card: six of them. */
export const DEAL = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
