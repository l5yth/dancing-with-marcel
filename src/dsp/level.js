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
 * How close to full scale a sample must sit to count as pinned there. Below
 * this an analogue-to-digital converter is still resolving the waveform; at
 * it, it has run out of numbers and the shape is gone. Rounded to the nearest
 * float32, since the samples are: as a float64 no sample could ever equal it
 * and the boundary would be untestable.
 */
const CLIP_CEILING = Math.fround(0.999);

/**
 * Share of a frame's samples pinned at full scale, which is what too much
 * input gain does to a signal. Nothing downstream can undo it: the peaks the
 * onsets are read from are flattened, and the level stops reporting the room.
 * The owner's first song recording was 46% clipped and nothing on the page
 * said so.
 *
 * @param {Float32Array} frame Mono samples, nominally in the range -1 to 1.
 * @returns {number} From 0 for a frame that is nowhere near it to 1 for a
 *   frame that is nothing else.
 */
export function clippedShare(frame) {
  let pinned = 0;
  for (const sample of frame) {
    if (Math.abs(sample) >= CLIP_CEILING) {
      pinned += 1;
    }
  }
  return frame.length === 0 ? 0 : pinned / frame.length;
}

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
