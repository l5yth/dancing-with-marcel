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
 * @file The debug word (SPEC D2). One formatter for the page and the offline
 * eval, so both always read the same. Pure: no browser API (SPEC invariant 4).
 */

/**
 * The debug word for a classifier state: `break`, `music`, or
 * `music (140 bpm)` once a tempo has locked. The number is the rounded
 * `danceBpm` (SPEC D2).
 *
 * @param {State} state Classifier state.
 * @param {number | null} [danceBpm] Dance tempo, or `null` while none has locked.
 * @returns {string} The word.
 */
export function debugLabel(state, danceBpm = null) {
  if (state !== 'music' || danceBpm === null) {
    return state;
  }
  return `music (${Math.round(danceBpm)} bpm)`;
}
