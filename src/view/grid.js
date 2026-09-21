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
 * @file The picture of one moment (SPEC F2, F3): sprites blitted into a grid
 * of characters and a parallel grid of mask letters, and each row of it cut
 * into runs of one colour. No page is touched here, so what is drawn can be
 * checked to the cell.
 */

/** A cell with nothing drawn on it, and a mask cell that leaves its ink white. */
const BLANK = ' ';

/**
 * Blit sprites into an empty grid, in order: a later sprite covers an earlier
 * one where it has ink, and lets it show through where it has spaces. What
 * falls outside the grid is clipped, so a punk can walk in from the wings.
 *
 * @param {Placement[]} placements The sprites, back to front.
 * @param {number} cols Width of the grid.
 * @param {number} rows Height of the grid.
 * @returns {Grid} The characters, and the mask letter of each.
 */
export function compose(placements, cols, rows) {
  const chars = Array.from({ length: rows }, () => new Array(cols).fill(BLANK));
  const inks = Array.from({ length: rows }, () => new Array(cols).fill(BLANK));
  for (const { sprite, left, top } of placements) {
    for (const [at, row] of sprite.rows.entries()) {
      const line = chars[top + at];
      if (line === undefined) {
        continue;
      }
      const first = Math.max(0, -left);
      const last = Math.min(row.length, cols - left);
      for (let cell = first; cell < last; cell += 1) {
        if (row[cell] !== BLANK) {
          line[left + cell] = row[cell];
          // A mask row is right-trimmed like the art, and may be shorter.
          inks[top + at][left + cell] = sprite.mask[at]?.[cell] ?? BLANK;
        }
      }
    }
  }
  return { chars, inks };
}

/**
 * Cut a row into runs of one colour. A space has no colour, so it joins the
 * run it falls in, and the spaces that open a row join the first ink after
 * them: a row of one colour is one run however it is spaced. The row is
 * right-trimmed, and a blank one is a single space, which keeps its line from
 * collapsing on the page.
 *
 * @param {string[]} chars The characters of the row.
 * @param {string[]} inks The mask letter of each, a space for white.
 * @returns {Run[]} The runs, left to right.
 */
export function runsOf(chars, inks) {
  let end = chars.length;
  while (end > 0 && chars[end - 1] === BLANK) {
    end -= 1;
  }
  /** @type {Run[]} */
  const runs = [];
  let text = '';
  /** @type {string | null} */
  let ink = null;
  for (let cell = 0; cell < end; cell += 1) {
    const here = chars[cell] === BLANK ? null : inks[cell];
    if (here !== null && ink !== null && here !== ink) {
      runs.push({ text, ink: ink.trim() });
      text = '';
      ink = null;
    }
    text += chars[cell];
    ink ??= here;
  }
  runs.push({ text: text === '' ? BLANK : text, ink: (ink ?? '').trim() });
  return runs;
}
