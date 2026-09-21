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
 * @file The stage: draws the show on the page, as large as the window allows
 * (SPEC F2, F3).
 *
 * The stage is a fixed grid of characters, so fitting it is a font-size
 * problem, not a layout one. The cell is measured from the page rather than
 * assumed, because a missing Courier falls back to whatever monospace the
 * machine has and those differ in width; the art would then be clipped on a
 * projector nobody can re-run.
 *
 * Colour comes from a sprite's mask, a letter per cell. A run of one letter is
 * an element with that letter for a class, and the stylesheet gives the class
 * its colour; white is plain text. Everything is built as nodes and nothing as
 * markup, since the art is full of `<`, `>` and `&`.
 */

import { STAGE } from '../classify/show.js';
import { compose, runsOf } from './grid.js';

/** Font size the cell is measured at, in pixels. Large enough to measure precisely. */
const PROBE_PX = 100;

/** Rows the probe renders, to average out rounding in the line height. */
const PROBE_ROWS = 10;

/** Draws the show into a page element, sized to the window. */
export class Stage {
  /**
   * Create a stage over an element, with one empty line for every row.
   *
   * @param {{element: HTMLElement, document: Document}} options The element to
   *   draw into, and the page its nodes are made in.
   */
  constructor({ element, document }) {
    /**
     * Element the art is drawn into.
     * @type {HTMLElement}
     */
    this.element = element;
    /**
     * Page the nodes are made in and the probe is measured in.
     * @type {Document}
     */
    this.document = document;
    /**
     * One element for every row of the grid, top to bottom.
     * @type {HTMLElement[]}
     */
    this.lines = Array.from({ length: STAGE.rows }, () => document.createElement('div'));
    /**
     * What each line shows, so a row that has not changed is not built again.
     * @type {string[]}
     */
    this.showing = this.lines.map(() => '');
    /**
     * Size of one character cell at {@link PROBE_PX}, or `null` before it is measured.
     * @type {{width: number, height: number} | null}
     */
    this.cell = null;
    element.replaceChildren(...this.lines);
  }

  /**
   * Measure one character cell of the stage's own font, in pixels at
   * {@link PROBE_PX}. The probe is added to the page, read, and removed.
   *
   * @returns {{width: number, height: number}} Width and height of a cell.
   */
  measureCell() {
    const probe = this.document.createElement('pre');
    probe.textContent = Array.from({ length: PROBE_ROWS }, () => 'M'.repeat(STAGE.cols)).join('\n');
    probe.className = this.element.className;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.fontSize = `${PROBE_PX}px`;
    this.document.body.appendChild(probe);
    const box = probe.getBoundingClientRect();
    probe.remove();
    return { width: box.width / STAGE.cols, height: box.height / PROBE_ROWS };
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
      width / (STAGE.cols * this.cell.width),
      height / (STAGE.rows * this.cell.height),
    );
    const size = Math.max(1, PROBE_PX * scale);
    this.element.style.fontSize = `${size}px`;
    // The rows are right-trimmed, so the box would otherwise be as wide as the
    // longest line showing and the punks would drift as they move. Pinning it
    // to the whole grid keeps column 60 in the middle of the window.
    this.element.style.width = `${(STAGE.cols * this.cell.width * size) / PROBE_PX}px`;
    this.element.style.height = `${(STAGE.rows * this.cell.height * size) / PROBE_PX}px`;
    return size;
  }

  /**
   * The node that draws one run: plain text for white, and an element with the
   * mask letter for a class for an accent.
   *
   * @param {Run} run The run.
   * @returns {Node} The node.
   */
  nodeOf(run) {
    if (run.ink === '') {
      return this.document.createTextNode(run.text);
    }
    const span = this.document.createElement('span');
    span.className = run.ink;
    span.textContent = run.text;
    return span;
  }

  /**
   * Draw the sprites of a moment. Only the rows that changed are rebuilt.
   *
   * @param {Placement[]} placements The sprites, back to front.
   * @returns {number} How many rows were rebuilt.
   */
  draw(placements) {
    const { chars, inks } = compose(placements, STAGE.cols, STAGE.rows);
    let rebuilt = 0;
    for (const [at, line] of this.lines.entries()) {
      const runs = runsOf(chars[at], inks[at]);
      const key = runs.map((run) => `${run.ink}:${run.text}`).join('\n');
      if (key !== this.showing[at]) {
        this.showing[at] = key;
        line.replaceChildren(...runs.map((run) => this.nodeOf(run)));
        rebuilt += 1;
      }
    }
    return rebuilt;
  }
}
