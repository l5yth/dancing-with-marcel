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
 * @file The browser's timers, wrapped so the capture can be handed fake ones in
 * tests. They are wrapped rather than passed straight through because the
 * originals must be called on the window, not detached from it.
 */

/** The real timers, for the page. */
export const browserTimers = Object.freeze({
  /**
   * Run something after a delay.
   *
   * @param {Deferred} run What to run.
   * @param {number} delayMs How long to wait.
   * @returns {unknown} A handle for `clearTimeout`.
   */
  setTimeout: (run, delayMs) => setTimeout(run, delayMs),
  /**
   * Cancel a pending timer.
   *
   * @param {unknown} handle What `setTimeout` returned.
   * @returns {void}
   */
  clearTimeout: (handle) => clearTimeout(/** @type {number} */ (handle)),
});
