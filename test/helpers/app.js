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
 * @file The app booted on fakes, for the tests that drive it the way a page
 * does: a click on start, frames from the worklet, and keys (SPEC D9: no
 * jsdom). Shared by `test/app.test.js` and `test/slider.test.js`.
 */

import {
  createAudioStack,
  createFakeDocument,
  createFakeTimers,
  createFakeWindow,
} from './fakes.js';

/**
 * Build the app on fakes.
 *
 * @param {object} [options] Options.
 * @param {string} [options.search] Query string.
 * @param {string[]} [options.missing] Element ids to leave out of the page.
 * @param {() => number} [options.random] Where the show's chance comes from;
 *   always 0 unless a test says otherwise.
 * @returns {any} The stack, the page, and the environment.
 */
export function setup({ search = '', missing = [], random = () => 0 } = {}) {
  const stack = createAudioStack();
  const document = createFakeDocument({ missing });
  const window = createFakeWindow();
  const timers = createFakeTimers();
  const env = {
    document,
    location: { search },
    timers,
    navigator: { mediaDevices: stack.mediaDevices },
    AudioContext: stack.AudioContext,
    AudioWorkletNode: stack.AudioWorkletNode,
    window,
    random,
  };
  return { stack, document, window, timers, env };
}

/**
 * Click start and wait for the capture to settle.
 *
 * @param {any} document The fake page.
 * @returns {Promise<void>} Resolves when the click handler is done.
 */
export async function click(document) {
  await document.elements.start.listeners.click();
}

/** Sample rate of the fake audio context. */
export const RATE = 48000;

/**
 * Seconds of drums after which he is dancing, from a cold start: the gate
 * defaults to break and takes its time to be sure (SPEC D7).
 */
export const WARM_S = 22;

/**
 * Post audio to the page in 512-sample frames, like the worklet would.
 *
 * @param {any} stack The fake audio stack.
 * @param {Float32Array} audio The samples.
 */
export function push(stack, audio) {
  const { port } = stack.log.nodes[0];
  for (let offset = 0; offset + 512 <= audio.length; offset += 512) {
    port.onmessage({ data: audio.slice(offset, offset + 512) });
  }
}

/**
 * A key going down, as the app reads one.
 *
 * @param {Partial<KeyPress>} fields What to override; the key is `d` unless said.
 * @returns {KeyPress} The key press.
 */
export function press(fields) {
  return {
    key: 'd',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...fields,
  };
}
