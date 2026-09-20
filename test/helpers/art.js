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
 * @file Loads the sprite generator for the tests that read the art rather than
 * the sheet. One place knows how the generator is obtained, so the checks in
 * `test/art.test.js` say only what the art must be.
 */

import { readFileSync } from 'node:fs';

/** Where the generator lives, relative to this helper. */
export const GENERATOR_URL = new URL('../../design/gen.js', import.meta.url);

/**
 * Load the generator. It is a function body rather than a module, so it is
 * evaluated rather than imported.
 *
 * @returns {*} Its poses, loops, ramp, and `renderPose`.
 */
export function generator() {
  return new Function(readFileSync(GENERATOR_URL, 'utf8'))();
}

/**
 * Where a character sits on the ramp, from 0 for blank to 1 for the densest
 * mark the sheet can draw.
 *
 * @param {string[]} ramp The generator's ramp.
 * @param {string} char One character of a frame.
 * @returns {number} Its position on the ramp.
 */
export function level(ramp, char) {
  return ramp.indexOf(char) / (ramp.length - 1);
}

/**
 * Every marked cell of a frame, as row, column, and level.
 *
 * @param {string[]} ramp The generator's ramp.
 * @param {string[]} rows The frame.
 * @returns {{row: number, col: number, char: string, level: number}[]} The marks.
 */
export function marks(ramp, rows) {
  /** @type {{row: number, col: number, char: string, level: number}[]} */
  const found = [];
  rows.forEach((text, row) => {
    [...text].forEach((char, col) => {
      if (char !== ' ') {
        found.push({ row, col, char, level: level(ramp, char) });
      }
    });
  });
  return found;
}

/**
 * Mean level of a set of marks, or 0 when there are none.
 *
 * @param {{level: number}[]} found The marks.
 * @returns {number} The mean.
 */
export function mean(found) {
  return found.length === 0 ? 0 : found.reduce((sum, mark) => sum + mark.level, 0) / found.length;
}
