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
 * @file Wiring: page elements, capture, level gate, and text (bucket B1).
 * Browser globals arrive through the `Env` type, so the wiring runs in unit tests.
 */

import { Capture } from './audio/capture.js';
import { debugLabel } from './classify/label.js';
import { LevelGate } from './classify/level-gate.js';
import { isDebug, parseConfig } from './config.js';
import { rmsDb, SILENCE_DB } from './dsp/level.js';
import { overlayText, statusText } from './view/text.js';

/** Milliseconds of audio between two refreshes of the debug overlay. */
const OVERLAY_INTERVAL_MS = 100;

/**
 * Look up a page element that must exist.
 *
 * @param {Document} document The page.
 * @param {string} id Element id.
 * @returns {HTMLElement} The element.
 * @throws {Error} When the page has no such element.
 */
function element(document, id) {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`missing element #${id}`);
  }
  return found;
}

/**
 * Wire the page: the start button begins capture, every frame feeds the level
 * gate, and the debug word follows its state.
 *
 * @param {Env} env Browser globals.
 * @returns {Capture} The capture, for inspection.
 */
export function boot(env) {
  const { document, location, navigator } = env;
  const config = parseConfig(location.search);
  const debug = isDebug(location.search);
  const start = element(document, 'start');
  const label = element(document, 'label');
  const overlay = element(document, 'overlay');
  overlay.hidden = !debug;

  const gate = new LevelGate(config);
  let overlayMs = 0;

  const capture = new Capture({
    mediaDevices: navigator.mediaDevices,
    AudioContext: env.AudioContext,
    AudioWorkletNode: env.AudioWorkletNode,
    workletUrl: new URL('./audio/worklet.js', import.meta.url),
    /** Feed one frame to the gate and refresh the text. */
    onFrame(frame, sampleRate) {
      const frameMs = (frame.length / sampleRate) * 1000;
      const state = gate.update(rmsDb(frame), frameMs);
      label.textContent = debugLabel(state);
      overlayMs += frameMs;
      if (debug && overlayMs >= OVERLAY_INTERVAL_MS) {
        overlayMs = 0;
        overlay.textContent = overlayText(gate.levelDb ?? SILENCE_DB, state, config);
      }
    },
    /** Show the start button and status text while not running, the debug word once running. */
    onStatus(status, detail) {
      start.hidden = status === 'starting' || status === 'running';
      label.textContent =
        status === 'running' ? debugLabel(gate.state) : statusText(status, detail);
    },
  });
  start.addEventListener('click', () => capture.start());
  return capture;
}
