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
 * @file The stage: draws one frame of the sprite sheet, as large as the window
 * allows (SPEC D10).
 *
 * The sheet is a fixed grid of characters, so fitting it is a font-size
 * problem, not a layout one. The cell is measured from the page rather than
 * assumed, because a missing Courier falls back to whatever monospace the
 * machine has and those differ in width; the art would then be clipped on a
 * projector nobody can re-run.
 *
 * Dancing is locked to the beat: one frame per eighth note at the detected
 * tempo, so the loop speeds up with the music. A between-song scene has no
 * beat to follow and runs at a fixed, unhurried rate.
 */

import { FRAMES, LOOPS, SHEET } from '../sprites/index.js';

/** Frames per beat while dancing: an eighth note each. */
const FRAMES_PER_BEAT = 2;

/** Font size the cell is measured at, in pixels. Large enough to measure precisely. */
const PROBE_PX = 100;

/** Rows the probe renders, to average out rounding in the line height. */
const PROBE_ROWS = 10;

/**
 * The art of one frame as a single block of text.
 *
 * @type {Map<string, string>}
 */
const joined = new Map();

/**
 * One frame's art, joined and cached.
 *
 * @param {string} name Frame name.
 * @returns {string} The rows, newline separated.
 */
export function frameText(name) {
  let text = joined.get(name);
  if (text === undefined) {
    text = FRAMES[name].join('\n');
    joined.set(name, text);
  }
  return text;
}

/**
 * Which frame of a loop is showing at a moment.
 *
 * @param {string} loop Loop name.
 * @param {number} elapsedMs Milliseconds since the page started.
 * @param {number} frameMs How long one frame lasts.
 * @returns {string} The frame name.
 */
export function frameAt(loop, elapsedMs, frameMs) {
  const names = LOOPS[loop];
  const step = Math.floor(Math.max(0, elapsedMs) / frameMs);
  return names[step % names.length];
}

/** Draws the sprite sheet into a page element, sized to the window. */
export class Stage {
  /**
   * Create a stage over an element, with nothing drawn yet.
   *
   * @param {{element: HTMLElement, document: Document}} options The element to
   *   draw into, and the page the probe is measured in.
   */
  constructor({ element, document }) {
    /**
     * Element the art is drawn into.
     * @type {HTMLElement}
     */
    this.element = element;
    /**
     * Page the probe is measured in.
     * @type {Document}
     */
    this.document = document;
    /**
     * Frame currently drawn, so an unchanged frame is not written again.
     * @type {string}
     */
    this.showing = '';
    /**
     * Size of one character cell at {@link PROBE_PX}, or `null` before it is measured.
     * @type {{width: number, height: number} | null}
     */
    this.cell = null;
  }

  /**
   * Measure one character cell of the stage's own font, in pixels at
   * {@link PROBE_PX}. The probe is added to the page, read, and removed.
   *
   * @returns {{width: number, height: number}} Width and height of a cell.
   */
  measureCell() {
    const probe = this.document.createElement('pre');
    probe.textContent = Array.from({ length: PROBE_ROWS }, () => 'M'.repeat(SHEET.cols)).join('\n');
    probe.className = this.element.className;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.fontSize = `${PROBE_PX}px`;
    this.document.body.appendChild(probe);
    const box = probe.getBoundingClientRect();
    probe.remove();
    return { width: box.width / SHEET.cols, height: box.height / PROBE_ROWS };
  }

  /**
   * Size the art so the whole grid fits, however the window is shaped. The
   * measurement is taken once and reused, since the font does not change.
   *
   * @param {number} width Space available, in pixels.
   * @param {number} height Space available, in pixels.
   * @returns {number} The font size applied, in pixels.
   */
  fit(width, height) {
    this.cell ??= this.measureCell();
    const scale = Math.min(
      width / (SHEET.cols * this.cell.width),
      height / (SHEET.rows * this.cell.height),
    );
    const size = Math.max(1, PROBE_PX * scale);
    this.element.style.fontSize = `${size}px`;
    // The rows are right-trimmed, so the box would otherwise be as wide as the
    // longest line of the frame showing and Marcel would drift as he moves.
    // Pinning it to the whole grid keeps him where the design put him.
    this.element.style.width = `${(SHEET.cols * this.cell.width * size) / PROBE_PX}px`;
    this.element.style.height = `${(SHEET.rows * this.cell.height * size) / PROBE_PX}px`;
    return size;
  }

  /**
   * Draw the frame a loop is showing at a moment.
   *
   * @param {object} moment What to draw.
   * @param {string} moment.loop Loop name.
   * @param {number} moment.elapsedMs Milliseconds since the page started.
   * @param {number} moment.danceBpm Tempo to dance at, in beats per minute.
   * @param {boolean} moment.dancing Whether the beat drives the loop.
   * @param {number} moment.breakFrameMs How long a between-song frame lasts.
   * @returns {string} The frame name drawn.
   */
  draw({ loop, elapsedMs, danceBpm, dancing, breakFrameMs }) {
    const frameMs = dancing ? 60000 / danceBpm / FRAMES_PER_BEAT : breakFrameMs;
    const name = frameAt(loop, elapsedMs, frameMs);
    if (name !== this.showing) {
      this.element.textContent = frameText(name);
      this.showing = name;
    }
    return name;
  }
}
