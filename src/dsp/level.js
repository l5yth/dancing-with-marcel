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
 * @file Level measurement: root-mean-square level of an audio frame in dBFS.
 * Pure: no browser API, no wall clock (SPEC invariant 4).
 */

/** Level reported for silence, in dBFS, so results stay finite. */
export const SILENCE_DB = -120;

/**
 * Root-mean-square level of a frame in dBFS (1.0 is full scale, 0 dBFS).
 *
 * @param {Float32Array} frame Mono samples, nominally in the range -1 to 1.
 * @returns {number} Level in dBFS, never below {@link SILENCE_DB}.
 */
export function rmsDb(frame) {
  if (frame.length === 0) {
    return SILENCE_DB;
  }
  let sumSquares = 0;
  for (const sample of frame) {
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / frame.length);
  return Math.max(SILENCE_DB, 20 * Math.log10(rms));
}
