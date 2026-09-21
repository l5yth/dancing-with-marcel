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
 * @file Wiring: page elements, capture, the pipeline, the show, and the stage.
 * Browser globals arrive through the `Env` type, so the wiring runs in unit
 * tests.
 *
 * The show runs from the moment the page opens, before the microphone is
 * allowed: it is between songs until there is something to hear.
 */

import { Capture } from './audio/capture.js';
import { debugLabel } from './classify/label.js';
import { Pipeline } from './classify/pipeline.js';
import { SceneDirector } from './classify/scene.js';
import { Show } from './classify/show.js';
import { isDebug, parseConfig } from './config.js';
import { Stage } from './view/stage.js';
import { overlayText, statusText } from './view/text.js';

/** Milliseconds of audio between two refreshes of the debug overlay. */
const OVERLAY_INTERVAL_MS = 100;

/** Frames per beat while dancing: an eighth note each. */
const FRAMES_PER_BEAT = 2;

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
 * pipeline, the show follows what the pipeline decides, and the stage draws it.
 *
 * @param {Env} env Browser globals.
 * @returns {{capture: Capture, director: SceneDirector, show: Show, stage: Stage}}
 *   What was wired, so a test can see the wiring and not merely its effects.
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
  const director = new SceneDirector({ config });
  const show = new Show({ random: env.random });
  /** @type {Pipeline | null} */
  let pipeline = null;
  /** @type {PipelineEvent | null} */
  let last = null;
  let overlayMs = 0;
  let danceBpm = config.defaultBpm;
  // When the next tick is due, in milliseconds since the page started.
  let dueMs = 0;
  // Whether the show has something new to draw before a tick moves it on.
  let fresh = true;

  const fit = () => stage.fit(window.innerWidth, window.innerHeight);
  // Dancing is locked to the beat: a frame per eighth note at the detected
  // tempo. Between songs there is no beat to follow, and the pace is unhurried.
  const tickMs = () => (show.dancing ? 60000 / danceBpm / FRAMES_PER_BEAT : config.breakFrameMs);
  const paint = (/** @type {number} */ elapsedMs) => {
    if (fresh) {
      // Whoever was given something new to do opens on its first frame and
      // holds it a whole tick: ticking first would open every dance on its
      // second frame, and a two-frame scene on the wrong one.
      fresh = false;
      dueMs = elapsedMs + tickMs();
      stage.draw(show.placements());
    } else if (elapsedMs >= dueMs) {
      const step = tickMs();
      // Ticks keep their phase while the page keeps up. After a stall, a tab
      // left in the background, they start again from now and do not race
      // through what was missed.
      dueMs = elapsedMs - dueMs > step ? elapsedMs + step : dueMs + step;
      show.tick();
      stage.draw(show.placements());
    }
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
    /** Feed one frame to the pipeline and let the show hear what it decides. */
    onFrame(frame, sampleRate) {
      pipeline ??= new Pipeline({ config, sampleRate });
      for (const event of pipeline.push(frame)) {
        last = event;
        danceBpm = event.danceBpm;
        fresh = show.hear(event.state === 'music', director.update(event)) || fresh;
        label.textContent = debugLabel(event.state, event.locked ? event.danceBpm : null);
      }
      overlayMs += (frame.length / sampleRate) * 1000;
      if (debug && last !== null && overlayMs >= OVERLAY_INTERVAL_MS) {
        overlayMs = 0;
        overlay.textContent = overlayText(last, config, director.tier, show.caption());
      }
    },
    /**
     * Show the panel until capture runs, then get out of the way. Debug is no
     * exception: the centred label would sit across the punk in the middle,
     * which is where you are looking while tuning a threshold, and the overlay
     * names the state in its first line anyway.
     */
    onStatus(status, detail) {
      const running = status === 'running';
      start.hidden = status === 'starting' || running;
      panel.hidden = running;
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
  // The cell is measured once and kept, since the font does not change. It does
  // change once: the shipped face arrives after the first paint, and a grid
  // sized against the fallback would be the wrong shape for the rest of the
  // night. Measure again when it lands.
  document.fonts?.ready.then(() => {
    stage.cell = null;
    fit();
  });
  window.requestAnimationFrame(paint);
  return { capture, director, show, stage };
}
