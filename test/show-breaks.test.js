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
 * @file The show between songs (SPEC F6, F8; ACCEPTANCE C22): a break that
 * goes on is dealt again, a deal always changes something, and nobody at home
 * draws on a neighbour.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REFRESH_MS, Show, STAGE } from '../src/classify/show.js';
import { LOOP_ENERGY, SPRITES } from '../src/sprites/asciipunk.js';
import { compose } from '../src/view/grid.js';
import { arrive, chance, punkOf } from './helpers/show.js';
import { mulberry32 } from './helpers/synth.js';

describe('the show between songs', () => {
  it('C22: a break that goes on is dealt again, between one and five minutes in', () => {
    assert.deepEqual(REFRESH_MS, { min: 60000, max: 300000 });
    const source = chance();
    const show = new Show({ random: source.next });
    assert.equal(
      show.refreshMs,
      60000 + 0.99 * 240000,
      'chance decides how long, inside the range',
    );
    // Ticks that say nothing of their length leave the break no older.
    arrive(show);
    assert.equal(show.breakMs, 0);

    // The next deal is drawn at the shortest: sixty seconds of 900 ms ticks.
    // Six draws deal the scenes, one keeps everybody here, four keep them awake
    // and turn Mo, one keeps the animals away, and the last winds the clock.
    show.hear(true, 1);
    source.queue.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0);
    show.hear(false, 0);
    assert.equal(source.queue.length, 0, 'the draws are not the ones this test scripts');
    assert.equal(show.refreshMs, 60000);
    const before = show.punks.map((punk) => punk.loop);
    for (let tick = 1; tick < 67; tick += 1) {
      show.tick(900);
      assert.deepEqual(
        show.punks.map((punk) => punk.loop),
        before,
        `dealt again after ${tick * 0.9} s`,
      );
    }
    show.tick(900);
    const after = show.punks.map((punk) => punk.loop);
    for (const [at, loop] of after.entries()) {
      assert.notEqual(loop, before[at], `${show.punks[at].id} was dealt the scene it was in`);
      assert.equal(LOOP_ENERGY[loop], 0, loop);
    }
    assert.equal(new Set(after).size, 3, `two share a scene: ${after}`);
    for (const punk of show.punks) {
      assert.deepEqual([punk.index, punk.held], [0, 0], `${punk.id} opens on its first frame`);
    }
    // And the clock starts again, with a length of its own.
    assert.equal(show.breakMs, 0);
    assert.equal(show.refreshMs, 60000 + 0.99 * 240000);
  });

  it('C22: a deal always changes something: no scene twice running, sleepers wake, wanderers return', () => {
    const show = new Show({ random: mulberry32(11), refreshMinMs: 1000, refreshMaxMs: 3000 });
    arrive(show);
    let returned = 0;
    let woke = 0;
    for (let deal = 0; deal < 500; deal += 1) {
      const before = show.punks.map((punk) => ({ ...punk }));
      let ticks = 0;
      while (show.breakMs + 900 < show.refreshMs) {
        show.tick(900);
        ticks += 1;
        assert.ok(ticks <= 3, `deal ${deal}: the break is not growing older`);
      }
      const settled = show.punks.map((punk) => ({ ...punk }));
      show.tick(900);
      assert.ok(ticks <= 3, `a deal of at most 3 s took ${ticks + 1} ticks`);
      assert.equal(show.breakMs, 0, 'the clock was not started again');
      for (const [at, punk] of show.punks.entries()) {
        const was = settled[at];
        if (was.state === 'off' || was.state === 'exit') {
          // Called back from the wings, or from half way there.
          assert.ok(
            punk.state === 'enter' || punk.state === 'stage',
            `${punk.id} is ${punk.state}`,
          );
          returned += 1;
        } else if (was.state === 'stage' && punk.state === 'stage') {
          assert.notEqual(punk.loop, was.loop, `deal ${deal}: ${punk.id} is still in ${was.loop}`);
          woke += was.loop === 'sleep' ? 1 : 0;
        }
      }
      const awake = show.punks
        .filter((punk) => punk.state === 'stage' && punk.loop !== 'sleep')
        .map((punk) => punk.loop);
      assert.equal(new Set(awake).size, awake.length, `deal ${deal}: ${awake}`);
      assert.equal(punkOf(show, 'mo').state, 'stage');
      assert.ok(before.length === 3);
    }
    assert.ok(returned > 20, `only ${returned} returns in 500 deals`);
    assert.ok(woke > 20, `only ${woke} sleepers woke in 500 deals`);
  });

  it('C22: between songs nobody at home draws on a neighbour, and one screen is enough', () => {
    const show = new Show({ random: mulberry32(5), refreshMinMs: 60000, refreshMaxMs: 60000 });
    arrive(show);
    let facingEachOther = 0;
    for (let deal = 0; deal < 300; deal += 1) {
      // Into the next deal, and on until whoever is walking has got there.
      let waited = 0;
      do {
        show.tick(900);
        waited += 1;
        assert.ok(waited <= 67, `deal ${deal}: a minute went by and the break was not dealt again`);
      } while (show.breakMs !== 0);
      for (let tick = 0; tick < 50; tick += 1) {
        show.tick(900);
      }
      const scenes = show.punks.map((punk) => punk.scene);
      assert.ok(!(scenes.includes('n64') && scenes.includes('tv')), `deal ${deal}: ${scenes}`);
      const home = show.punks.filter((punk) => punk.state === 'stage');
      /** @type {Set<string>} */
      const inked = new Set();
      for (const punk of home) {
        for (const frame of punk.frames) {
          const placed = show.place(SPRITES[punk.id], punk.id, frame, punk.facing, punk.x);
          const { chars } = compose([placed], STAGE.cols, STAGE.rows);
          for (const [row, line] of chars.entries()) {
            for (const [col, char] of line.entries()) {
              if (char !== ' ') {
                inked.add(`${punk.id} ${row}:${col}`);
              }
            }
          }
        }
      }
      const cells = [...inked].map((cell) => cell.split(' ')[1]);
      assert.equal(new Set(cells).size, cells.length, `deal ${deal}: ${scenes} share a cell`);
      const [billy, mo] = show.punks;
      const both = home.includes(billy) && home.includes(mo);
      facingEachOther += both && billy.facing === 1 && mo.facing === -1 ? 1 : 0;
    }
    assert.ok(facingEachOther > 50, `neighbours faced each other in only ${facingEachOther} deals`);
  });

  it('C22: a deal that falls while one is leaving calls it back, so both are never gone', () => {
    // Only a quick refresh can do this: leaving takes 21 s at the usual pace.
    const source = chance();
    const show = new Show({ random: source.next, refreshMinMs: 4500, refreshMaxMs: 4500 });
    arrive(show);
    show.hear(true, 1);
    // Six draws deal the scenes, then somebody leaves, and it is Billy.
    source.queue.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0);
    show.hear(false, 0);
    const [billy, , spike] = show.punks;
    assert.equal(billy.state, 'exit');
    for (let tick = 0; tick < 4; tick += 1) {
      show.tick(900);
    }
    assert.deepEqual([billy.state, billy.x], ['exit', billy.home - 8]);
    // The next deal would send Spike after him.
    source.queue.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0);
    show.tick(900);
    assert.equal(show.breakMs, 0, 'the break was not dealt again');
    assert.deepEqual([billy.state, billy.facing], ['enter', 1], 'Billy was not called back');
    assert.equal(spike.state, 'exit');
    arrive(show);
    assert.equal(billy.x, billy.home);
    assert.ok(show.punks.filter((punk) => punk.state === 'stage').length >= 2);
  });

  it('C22: music stops the clock of a break, and the next break starts it from nothing', () => {
    const source = chance();
    const show = new Show({ random: source.next, refreshMinMs: 5000, refreshMaxMs: 5000 });
    arrive(show);
    show.tick(900);
    show.tick(900);
    assert.equal(show.breakMs, 1800);
    show.hear(true, 2);
    const dancing = show.punks.map((punk) => punk.loop);
    for (let tick = 0; tick < 12; tick += 1) {
      show.tick(900);
    }
    assert.equal(show.breakMs, 1800, 'the break grew older while they danced');
    assert.deepEqual(
      show.punks.map((punk) => punk.loop),
      dancing,
      'a deal in the middle of a song',
    );
    show.hear(false, 0);
    assert.equal(show.breakMs, 0);
  });

  it('C22: a longest that is under the shortest is the shortest', () => {
    const show = new Show({ random: () => 0.5, refreshMinMs: 5000, refreshMaxMs: 1000 });
    assert.deepEqual(show.refresh, { min: 5000, max: 5000 });
    assert.equal(show.refreshMs, 5000);
  });
});
