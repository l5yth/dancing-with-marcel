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
 * @file Wiring: page elements, capture, the pipeline, and the stage. Browser
 * globals arrive through the `Env` type, so the wiring runs in unit tests.
 *
 * Marcel performs from the moment the page opens, before the microphone is
 * allowed: he is between songs until there is something to hear.
 */

import { Capture } from './audio/capture.js';
import { debugLabel } from './classify/label.js';
import { Pipeline } from './classify/pipeline.js';
import { SceneDirector } from './classify/scene.js';
import { isDebug, parseConfig } from './config.js';
import { Stage } from './view/stage.js';
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
 * Wire the page: the start button begins capture, every frame feeds the
 * pipeline, and the stage performs what the pipeline decides.
 *
 * @param {Env} env Browser globals.
 * @returns {{capture: Capture, director: SceneDirector, stage: Stage}} What was
 *   wired, so a test can see the wiring and not merely its effects.
 */
export function boot(env) {
  const { document, location, navigator, window } = env;
  const config = parseConfig(location.search);
  const debug = isDebug(location.search);
  const start = element(document, 'start');
  const label = element(document, 'label');
  const panel = element(document, 'panel');
  const overlay = element(document, 'overlay');
  overlay.hidden = !debug;
  element(document, 'repo').hidden = !debug;

  const stage = new Stage({ element: element(document, 'stage'), document });
  const director = new SceneDirector({ config, random: env.random });
  /** @type {Pipeline | null} */
  let pipeline = null;
  /** @type {PipelineEvent | null} */
  let last = null;
  let overlayMs = 0;

  const fit = () => stage.fit(window.innerWidth, window.innerHeight);
  const paint = (/** @type {number} */ elapsedMs) => {
    stage.draw({
      loop: director.loop,
      elapsedMs,
      danceBpm: last?.danceBpm ?? config.defaultBpm,
      dancing: last?.state === 'music',
      breakFrameMs: config.breakFrameMs,
    });
    window.requestAnimationFrame(paint);
  };

  const capture = new Capture({
    mediaDevices: navigator.mediaDevices,
    AudioContext: env.AudioContext,
    AudioWorkletNode: env.AudioWorkletNode,
    workletUrl: new URL('./audio/worklet.js', import.meta.url),
    timers: env.timers,
    visibility: document,
    wakeLock: navigator.wakeLock,
    /** Feed one frame to the pipeline and let it choose the scene. */
    onFrame(frame, sampleRate) {
      pipeline ??= new Pipeline({ config, sampleRate });
      for (const event of pipeline.push(frame)) {
        last = event;
        director.update(event, pipeline.hopMs);
        label.textContent = debugLabel(event.state, event.locked ? event.danceBpm : null);
      }
      overlayMs += (frame.length / sampleRate) * 1000;
      if (debug && last !== null && overlayMs >= OVERLAY_INTERVAL_MS) {
        overlayMs = 0;
        overlay.textContent = overlayText(last, config, director.loop);
      }
    },
    /** Show the panel until capture runs, then get out of Marcel's way. */
    onStatus(status, detail) {
      const running = status === 'running';
      start.hidden = status === 'starting' || running;
      panel.hidden = running && !debug;
      if (!running) {
        label.textContent = statusText(status, detail);
      } else if (last === null) {
        label.textContent = 'break';
      }
    },
  });
  start.addEventListener('click', () => capture.start());
  window.addEventListener('resize', fit);
  fit();
  window.requestAnimationFrame(paint);
  return { capture, director, stage };
}
