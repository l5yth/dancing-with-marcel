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
 *
 * The debug text is shown by `?debug=1` and shown or hidden at any time by
 * pressing `d`, so the projector can be checked without reloading the page.
 * `r` forgets what has been heard, for a night when the room has moved or a
 * badly mixed song has been taken for it.
 * The keys `0` to `3` force a break or a dance tier for thirty seconds (SPEC
 * T1 to T5); the detector and the director keep running underneath.
 * With the debug text, a slider moves the ceiling of the learned floor,
 * `floorMaxDb`, while the page runs: the lever for a page gone deaf, whose
 * floor has climbed into a song (SPEC S1 to S5).
 */

import { Capture } from './audio/capture.js';
import { debugLabel } from './classify/label.js';
import { Override } from './classify/override.js';
import { Pipeline } from './classify/pipeline.js';
import { SceneDirector } from './classify/scene.js';
import { Show } from './classify/show.js';
import { configWith, isDebug, parseConfig, RANGES } from './config.js';
import { Stage } from './view/stage.js';
import { ceilingText, overlayText, statusText } from './view/text.js';

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
  // The tuning of the URL, with the ceiling the slider has set since.
  let config = parseConfig(location.search);
  let debug = isDebug(location.search);
  const start = element(document, 'start');
  const label = element(document, 'label');
  const panel = element(document, 'panel');
  const overlay = element(document, 'overlay');
  const repo = element(document, 'repo');
  const ceiling = element(document, 'ceiling');
  const slider = /** @type {HTMLInputElement} */ (element(document, 'ceiling-slider'));
  const ceilingDb = element(document, 'ceiling-db');

  const stage = new Stage({ element: element(document, 'stage'), document });
  const director = new SceneDirector({ config });
  const show = new Show({
    random: env.random,
    refreshMinMs: config.breakRefreshMinMs,
    refreshMaxMs: config.breakRefreshMaxMs,
  });
  const override = new Override();
  /** @type {Pipeline | null} */
  let pipeline = null;
  /** @type {PipelineEvent | null} */
  let last = null;
  let overlayMs = 0;
  let danceBpm = config.defaultBpm;
  // Whether the microphone has been allowed, which is also when the panel goes.
  let running = false;
  // The animation clock as of the last frame. It paces the show, and a tier
  // forced from the keyboard runs out on it: keys work before the microphone
  // is allowed, when there is no audio time to count by.
  let frameMs = 0;
  // When the next tick is due, in milliseconds since the page started.
  let dueMs = 0;
  // Whether the show has something new to draw before a tick moves it on.
  let fresh = true;

  /**
   * What the show hears at a moment: a tier forced from the keyboard while
   * one holds, otherwise what the detector and the director say.
   *
   * @param {number} nowMs The moment, on the animation clock.
   * @returns {Heard} Whether music plays, and the tier.
   */
  const heard = (nowMs) =>
    override.hearing(nowMs, { dancing: last?.state === 'music', tier: director.tier });
  /**
   * Let the show hear what applies now. Whoever is given something new to do
   * is drawn before the next tick moves it on.
   *
   * @param {number} nowMs The moment, on the animation clock.
   * @returns {void}
   */
  const apply = (nowMs) => {
    const { dancing, tier } = heard(nowMs);
    fresh = show.hear(dancing, tier) || fresh;
  };
  /**
   * Write the debug overlay from what was last heard. The tier shown is the
   * one the show hears, forced or not, and a forced one says how long it has.
   *
   * @param {PipelineEvent} event What was last heard.
   * @returns {void}
   */
  const overlayNow = (event) => {
    const forced = override.at(frameMs);
    overlay.textContent = overlayText(event, config, heard(frameMs).tier, show.caption(), forced);
  };
  // Show or hide the debug text, with what was last heard if anything was,
  // and the floor ceiling slider with it. The pointer follows it: it is
  // hidden only on a page that is running and has nothing to read, which is
  // the page the projector shows. The body carries no other class, so the
  // name is set and cleared outright.
  const showDebug = () => {
    document.body.className = running && !debug ? 'bare' : '';
    overlay.hidden = !debug;
    repo.hidden = !debug;
    ceiling.hidden = !debug;
    if (debug && last !== null) {
      overlayNow(last);
    }
  };
  /**
   * Forget the room and everything heard in it: the floor, the pulse window,
   * the tempo and the state, by letting the next frame build a pipeline of its
   * own. The microphone is left running and the tuning of the URL is left
   * alone, so this is not a reload; the punks are not sent back to the wings
   * either, though they follow the detector into a break until it hears music
   * again.
   *
   * @returns {void}
   */
  const forget = () => {
    pipeline = null;
    last = null;
    danceBpm = config.defaultBpm;
    overlayMs = 0;
    director.forget();
    apply(frameMs);
    label.textContent = debugLabel('break', null);
    if (debug) {
      overlay.textContent = '';
    }
  };
  /**
   * Move the ceiling of the floor to where the slider says (SPEC S1, S2). The
   * value goes through `configWith`, as the URL's does, and one it does not
   * take changes nothing: `configWith` would put the default in its place,
   * and a slider that jumped back to -25 would undo the very rescue it was
   * moved for. The pipeline takes the new ceiling at once; one built later,
   * after `r`, is built with it (SPEC S5).
   *
   * @returns {void}
   */
  const retune = () => {
    // An empty value is no value, as it is in the URL, and not the 0 that
    // `Number` would make of it.
    const wanted = slider.value.trim() === '' ? Number.NaN : Number(slider.value);
    const next = configWith({ ...config, floorMaxDb: wanted });
    if (next.floorMaxDb !== wanted) {
      return;
    }
    config = next;
    pipeline?.retune(config);
    // The floor went down with the ceiling in the pipeline just now, and so
    // it does in what was last heard: `d` or a forced tier may write the
    // overlay before the next frame, and with the microphone lost that is
    // a while. Without this they would set the old floor beside the new
    // ceiling's `(max)` and `need`.
    if (last !== null) {
      last = { ...last, floorDb: Math.min(last.floorDb, config.floorMaxDb) };
    }
    ceilingDb.textContent = ceilingText(config.floorMaxDb);
  };
  const fit = () => stage.fit(window.innerWidth, window.innerHeight);
  // Dancing is locked to the beat: a frame per eighth note at the detected
  // tempo. Between songs there is no beat to follow, and the pace is unhurried.
  const tickMs = () => (show.dancing ? 60000 / danceBpm / FRAMES_PER_BEAT : config.breakFrameMs);
  const paint = (/** @type {number} */ elapsedMs) => {
    frameMs = elapsedMs;
    // A forced tier runs out on the frame it is due, audio or no audio, and
    // what replaces it is drawn on that same frame.
    apply(elapsedMs);
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
      show.tick(step);
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
        // The director hears every event, forced tier or not, so that when the
        // thirty seconds are up it has an opinion of its own.
        director.update(event);
        apply(frameMs);
        label.textContent = debugLabel(event.state, event.locked ? event.danceBpm : null);
      }
      overlayMs += (frame.length / sampleRate) * 1000;
      if (debug && last !== null && overlayMs >= OVERLAY_INTERVAL_MS) {
        overlayMs = 0;
        overlayNow(last);
      }
    },
    /**
     * Show the panel until capture runs, then get out of the way. Debug is no
     * exception: the centred label would sit across the punk in the middle,
     * which is where you are looking while tuning a threshold, and the overlay
     * names the state in its first line anyway.
     */
    onStatus(status, detail) {
      running = status === 'running';
      start.hidden = status === 'starting' || running;
      panel.hidden = running;
      showDebug();
      // Asked of `status` and not of `running`, so that the type narrows: the
      // message is for every status but that one.
      if (status !== 'running') {
        label.textContent = statusText(status, detail);
      } else if (last === null) {
        label.textContent = 'break';
      }
    },
  });
  // The slider runs over the range the URL may set the ceiling in, a
  // decibel a step, and opens at the ceiling in force. The range is set
  // before the value, which a range input would otherwise clamp to its
  // default of 0 to 100.
  const [lowest, highest] = RANGES.floorMaxDb;
  slider.min = String(lowest);
  slider.max = String(highest);
  slider.step = '1';
  slider.value = String(config.floorMaxDb);
  ceilingDb.textContent = ceilingText(config.floorMaxDb);
  slider.addEventListener('input', retune);
  start.addEventListener('click', () => capture.start());
  window.addEventListener('resize', fit);
  // A plain key only: with a modifier it is the browser's own, a bookmark or
  // a duplicate tab, and a key held down would make the text flicker or keep
  // restarting the thirty seconds.
  window.addEventListener('keydown', (event) => {
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat;
    if (!plain) {
      return;
    }
    if (event.key.toLowerCase() === 'd') {
      debug = !debug;
      showDebug();
    } else if (event.key.toLowerCase() === 'r') {
      forget();
    } else if (override.press(event.key, frameMs)) {
      // At once, ahead of the next event and the next frame, and the overlay
      // says so at once too.
      apply(frameMs);
      if (debug && last !== null) {
        overlayNow(last);
      }
    }
  });
  showDebug();
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
