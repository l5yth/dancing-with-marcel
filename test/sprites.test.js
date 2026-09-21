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
 * @file The ASCIIpunk sheet (SPEC F1, F2; ACCEPTANCE C22). The art is the
 * owner's and it is approved: the checks here are that it is whole, that it
 * holds together as a table, and that nobody has redrawn it.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  EGGS,
  EXTRAS,
  FRAME_META,
  LOOP_ENERGY,
  LOOPS,
  mirror,
  PALETTE,
  PUNKS,
  ROWS,
  SPRITES,
} from '../src/sprites/asciipunk.js';

/**
 * Digest of everything the module exports, taken from the design project's
 * own file on 2026-09-21. The repository copy adds a licence header and JSDoc
 * and must draw exactly what that file draws.
 */
const APPROVED = '71d07193e2c07cc328414412a7acfd6d085865db32d539295bea89c8d5622057';

/** Every frame name a punk has. */
const FRAMES = Object.keys(SPRITES.billy);

describe('the sheet', () => {
  it('C22: the art is the approved art, to the character', () => {
    const drawn = createHash('sha256')
      .update(
        JSON.stringify([
          ROWS,
          PALETTE,
          PUNKS,
          SPRITES,
          EXTRAS,
          FRAME_META,
          LOOPS,
          EGGS,
          LOOP_ENERGY,
        ]),
      )
      .digest('hex');
    assert.equal(drawn, APPROVED, 'a frame was redrawn, re-spaced or tidied');
  });

  it('C22: every punk has every frame, 16 rows of art and 16 of mask', () => {
    assert.deepEqual(Object.keys(PUNKS), ['billy', 'mo', 'spike']);
    assert.equal(ROWS, 16);
    for (const [punk, frames] of Object.entries(SPRITES)) {
      assert.deepEqual(Object.keys(frames), FRAMES, `${punk} has other frames than billy`);
      for (const [name, sprite] of Object.entries(frames)) {
        assert.equal(sprite.rows.length, ROWS, `${punk} ${name}`);
        assert.equal(sprite.mask.length, ROWS, `${punk} ${name} mask`);
      }
    }
    for (const [name, sprite] of Object.entries(EXTRAS)) {
      assert.equal(sprite.mask.length, sprite.rows.length, name);
      assert.equal(FRAME_META[name].rows, sprite.rows.length, name);
    }
  });

  it('C22: no row is wider than its box, and the feet are inside it', () => {
    for (const frames of [...Object.values(SPRITES), EXTRAS]) {
      for (const [name, sprite] of Object.entries(frames)) {
        const { width, anchor } = FRAME_META[name];
        for (const row of [...sprite.rows, ...sprite.mask]) {
          assert.ok(row.length <= width, `${name}: a row of ${row.length} in a box of ${width}`);
        }
        assert.ok(anchor >= 0 && anchor < width, `${name}: feet at ${anchor} in a box of ${width}`);
      }
    }
  });

  it('C22: a mask holds only letters of the palette, and the palette only the five accents', () => {
    assert.deepEqual(PALETTE, {
      y: '#ffd21e',
      r: '#ff3b1f',
      a: '#f7a325',
      g: '#5cff6a',
      p: '#ff2e88',
    });
    const seen = new Set();
    for (const frames of [...Object.values(SPRITES), EXTRAS]) {
      for (const [name, sprite] of Object.entries(frames)) {
        for (const letter of sprite.mask.join('').replaceAll(' ', '')) {
          assert.ok(letter in PALETTE, `${name} is coloured ${JSON.stringify(letter)}`);
          seen.add(letter);
        }
      }
    }
    assert.deepEqual([...seen].sort(), Object.keys(PALETTE).sort(), 'an accent nobody wears');
  });

  it('C22: only the hair of one and the lips of another tell the punks apart in colour', () => {
    const colours = (/** @type {string} */ punk) =>
      new Set(SPRITES[punk].idle_a.mask.join('').replaceAll(' ', ''));
    assert.deepEqual([...colours('billy')], ['y']);
    assert.deepEqual([...colours('mo')], ['p']);
    assert.deepEqual([...colours('spike')], []);
  });

  it('C22: every frame a loop or an egg names exists, for every punk or as an animal', () => {
    for (const [loop, names] of Object.entries({ ...LOOPS, ...EGGS })) {
      assert.ok(names.length > 0, loop);
      for (const name of names) {
        assert.ok(name in FRAME_META, `${loop} names ${name}, which the sheet does not describe`);
        const drawn = name in EXTRAS || Object.values(SPRITES).every((frames) => name in frames);
        assert.ok(drawn, `${loop} names ${name}, which nobody draws`);
      }
    }
  });

  it('C22: a loop is as energetic as its strongest frame, and the tiers are all there', () => {
    for (const [loop, names] of Object.entries(LOOPS)) {
      assert.equal(
        LOOP_ENERGY[loop],
        Math.max(...names.map((name) => FRAME_META[name].energy)),
        loop,
      );
    }
    for (const tier of [0, 1, 2, 3]) {
      const dances = Object.keys(LOOPS).filter(
        (loop) => LOOP_ENERGY[loop] === tier && FRAME_META[LOOPS[loop][0]].group !== 'move',
      );
      assert.ok(dances.length >= 3, `only ${dances.length} loops at energy ${tier}`);
    }
  });

  it('C22: a mirror turns a sprite round, and twice turns it back', () => {
    const { width } = FRAME_META.point;
    const right = SPRITES.spike.point;
    const left = mirror(right, width);
    assert.ok(right.rows.some((row) => row.includes('>')));
    assert.ok(left.rows.some((row) => row.includes('<')) && !left.rows.join('').includes('>'));
    assert.deepEqual(mirror(left, width), right);
    // Every directional character has its partner.
    const turned = mirror({ rows: ['/\\()<>[]{}'] });
    assert.deepEqual(turned.rows, ['{}[]<>()/\\']);
    assert.deepEqual(turned.mask, ['']);
  });

  it('C22: the mirrored twist keeps its feet where the twist has them', () => {
    const { width, anchor } = FRAME_META.twist_r;
    assert.equal(FRAME_META.twist_l.anchor, width - 1 - anchor);
    assert.deepEqual(SPRITES.mo.twist_l, mirror(SPRITES.mo.twist_r, width));
  });
});
