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
 * @file The picture of a moment (SPEC F2, F3; ACCEPTANCE C22): sprites blitted
 * into a grid, and its rows cut into runs of one colour.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Show, STAGE } from '../src/classify/show.js';
import { FRAME_META, SPRITES } from '../src/sprites/asciipunk.js';
import { compose, runsOf } from '../src/view/grid.js';

/**
 * The rows of a composed grid as strings.
 *
 * @param {string[][]} cells Characters or mask letters, row by row.
 * @returns {string[]} One string a row.
 */
function lines(cells) {
  return cells.map((row) => row.join(''));
}

describe('the grid', () => {
  it('C22: with nothing on it, it is 120 by 21 of blank', () => {
    const { chars, inks } = compose([], STAGE.cols, STAGE.rows);
    assert.equal(chars.length, 21);
    assert.equal(inks.length, 21);
    for (const row of [...chars, ...inks]) {
      assert.equal(row.join(''), ' '.repeat(120));
    }
  });

  it('C22: a sprite lands where it is placed, with its mask beside it', () => {
    const sprite = { rows: ['/\\', '<>'], mask: ['y ', ' r'] };
    const { chars, inks } = compose([{ sprite, left: 2, top: 1 }], 6, 4);
    assert.deepEqual(lines(chars), ['      ', '  /\\  ', '  <>  ', '      ']);
    assert.deepEqual(lines(inks), ['      ', '  y   ', '   r  ', '      ']);
  });

  it('C22: a later sprite covers an earlier one where it has ink, and nowhere else', () => {
    const back = { rows: ['#####', '#####'], mask: ['ggggg', 'ggggg'] };
    const front = { rows: ['o o', ' o'], mask: ['', ' p'] };
    const { chars, inks } = compose(
      [
        { sprite: back, left: 0, top: 0 },
        { sprite: front, left: 1, top: 0 },
      ],
      5,
      2,
    );
    assert.deepEqual(lines(chars), ['#o#o#', '##o##']);
    // White ink over a coloured cell is white: the mask is the front sprite's
    // there, and it has none.
    assert.deepEqual(lines(inks), ['g g g', 'ggpgg']);
  });

  it('C22: what falls outside the grid is clipped, on every side', () => {
    const sprite = { rows: ['abc', 'def', 'ghi'], mask: ['yyy', 'yyy', 'yyy'] };
    const at = (/** @type {number} */ left, /** @type {number} */ top) =>
      lines(compose([{ sprite, left, top }], 4, 3).chars);
    assert.deepEqual(at(-2, 0), ['c   ', 'f   ', 'i   ']);
    assert.deepEqual(at(3, 0), ['   a', '   d', '   g']);
    assert.deepEqual(at(0, -2), ['ghi ', '    ', '    ']);
    assert.deepEqual(at(0, 2), ['    ', '    ', 'abc ']);
    assert.deepEqual(at(-9, 0), ['    ', '    ', '    ']);
    assert.deepEqual(at(9, 9), ['    ', '    ', '    ']);
  });

  it('C22: a punk standing on a column has its feet on it, facing either way', () => {
    const show = new Show({ random: () => 0.99 });
    for (const frame of ['idle_a', 'kick', 'sleep_a', 'tv_a', 'walk_1']) {
      const { anchor, width } = FRAME_META[frame];
      for (const facing of [1, -1]) {
        const placed = show.place(SPRITES.spike, 'spike', frame, facing, 70);
        const { chars } = compose([placed], STAGE.cols, STAGE.rows);
        const drawn = chars[STAGE.floor].join('');
        const feet = placed.sprite.rows[15];
        const column = facing > 0 ? anchor : width - 1 - anchor;
        assert.equal(drawn[70], feet[column] ?? ' ', `${frame} facing ${facing}`);
        assert.equal(drawn.trim(), feet.trim(), `${frame} facing ${facing}: not on the floor row`);
      }
    }
  });
});

describe('runs', () => {
  /**
   * The runs of a row given as two strings.
   *
   * @param {string} chars The characters.
   * @param {string} inks The mask letters, a space for white.
   * @returns {Run[]} The runs.
   */
  const runs = (chars, inks) => runsOf([...chars], [...inks.padEnd(chars.length)]);

  it('C22: a white row is one run, and carries no ink', () => {
    assert.deepEqual(runs('  /o\\  |  ', ''), [{ text: '  /o\\  |', ink: '' }]);
  });

  it('C22: a change of colour starts a run, and a space never does', () => {
    assert.deepEqual(runs(' ww yy y w r', '    yy y   r'), [
      { text: ' ww ', ink: '' },
      { text: 'yy y ', ink: 'y' },
      { text: 'w ', ink: '' },
      { text: 'r', ink: 'r' },
    ]);
  });

  it('C22: the spaces that open a row join the first ink after them', () => {
    assert.deepEqual(runs('   ~~', '   aa'), [{ text: '   ~~', ink: 'a' }]);
  });

  it('C22: a row is right-trimmed, and a blank one still holds one space', () => {
    assert.deepEqual(runs('ab      ', 'g       '), [
      { text: 'a', ink: 'g' },
      { text: 'b', ink: '' },
    ]);
    assert.deepEqual(runs('        ', ''), [{ text: ' ', ink: '' }]);
    assert.deepEqual(runs('', ''), [{ text: ' ', ink: '' }]);
    // Ink under a space is no ink at all.
    assert.deepEqual(runs('    ', 'yyyy'), [{ text: ' ', ink: '' }]);
  });

  it('C22: the characters of markup come through as they are', () => {
    assert.deepEqual(runs('<b>&amp;</b>', '   ppppp'), [
      { text: '<b>', ink: '' },
      { text: '&amp;', ink: 'p' },
      { text: '</b>', ink: '' },
    ]);
  });
});
