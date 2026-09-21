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
 * @file The show (SPEC F3 to F6; ACCEPTANCE C22): three punks who walk on,
 * dance to a tier, and are dealt a scene between songs. Chance is scripted, so
 * every rule is checked to the frame.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANIMAL_WINGS_COLS,
  BREAK_LOOPS,
  CAT_COLS,
  DANCE_HOLD_FRAMES,
  DAZED_FRAMES,
  DRIFT_COLS,
  dancesOf,
  REFRESH_MS,
  Show,
  STAGE,
  WINGS,
  WINGS_COLS,
} from '../src/classify/show.js';
import {
  EGGS,
  EXTRAS,
  FRAME_META,
  LOOP_ENERGY,
  LOOPS,
  mirror,
  SPRITES,
} from '../src/sprites/asciipunk.js';
import { mulberry32 } from './helpers/synth.js';

/**
 * Chance that answers from a queue, and with a fallback once it is empty.
 * 0.99 says no to every roll and 0 says yes to every one.
 *
 * @param {number} [fallback] What to answer when nothing is queued.
 * @returns {{queue: number[], fallback: number, calls: number, next: () => number}} The source.
 */
function chance(fallback = 0.99) {
  const source = {
    /** @type {number[]} */
    queue: [],
    fallback,
    calls: 0,
    next: () => {
      source.calls += 1;
      const queued = source.queue.shift();
      return queued === undefined ? source.fallback : queued;
    },
  };
  return source;
}

/**
 * Tick until everybody who is walking on has arrived.
 *
 * @param {Show} show The show.
 * @returns {number} Ticks it took.
 */
function arrive(show) {
  let ticks = 0;
  while (show.punks.some((punk) => punk.state === 'enter')) {
    show.tick();
    ticks += 1;
    assert.ok(ticks < 200, 'somebody never came home');
  }
  return ticks;
}

/**
 * One punk of a show.
 *
 * @param {Show} show The show.
 * @param {string} id Which.
 * @returns {PunkState} The punk.
 */
function punkOf(show, id) {
  const found = show.punks.find((punk) => punk.id === id);
  assert.ok(found, id);
  return found;
}

describe('the show', () => {
  it('C22: the stage is 120 by 21 with the floor at 18 and three homes', () => {
    assert.deepEqual(STAGE, {
      cols: 120,
      rows: 21,
      floor: 18,
      homes: { billy: 24, mo: 60, spike: 96 },
    });
    assert.deepEqual(Object.keys(STAGE.homes), Object.keys(SPRITES));
  });

  it('C22: everybody starts off canvas in walk, facing home', () => {
    const show = new Show({ random: chance().next });
    assert.deepEqual(
      show.punks.map((punk) => [punk.id, punk.state, punk.loop, punk.x, punk.facing]),
      [
        ['billy', 'enter', 'walk', WINGS.billy, 1],
        ['mo', 'enter', 'walk', WINGS.mo, 1],
        ['spike', 'enter', 'walk', WINGS.spike, -1],
      ],
    );
    for (const { sprite, left } of show.placements()) {
      const width = Math.max(...sprite.rows.map((row) => row.length));
      assert.ok(left + width <= 0 || left >= STAGE.cols, `a sprite at ${left} is on the canvas`);
    }
  });

  it('C22: a walker moves 2 columns a tick towards home and stops exactly on it', () => {
    const show = new Show({ random: chance().next });
    show.tick();
    assert.deepEqual(
      show.punks.map((punk) => punk.x),
      [WINGS.billy + 2, WINGS.mo + 2, WINGS.spike - 2],
    );
    // Nobody walks through anybody: the one with furthest to go is in front.
    while (show.punks.some((punk) => punk.state === 'enter')) {
      show.tick();
      const [billy, mo] = show.punks;
      assert.ok(billy.x < mo.x, `billy at ${billy.x} has caught mo at ${mo.x}`);
    }
    for (const punk of show.punks) {
      assert.equal(punk.state, 'stage');
      assert.equal(punk.x, punk.home, punk.id);
    }
  });

  it('C22: whoever arrives between songs takes the scene it was dealt', () => {
    const show = new Show({ random: chance().next });
    const dealt = show.punks.map((punk) => punk.scene);
    const walking = new Set(show.punks);
    while (walking.size > 0) {
      show.tick();
      for (const punk of walking) {
        if (punk.state === 'stage') {
          // It opens on the scene's first frame, the tick it arrives.
          assert.deepEqual([punk.loop, punk.index, punk.held], [punk.scene, 0, 0], punk.id);
          walking.delete(punk);
        }
      }
    }
    assert.deepEqual(
      show.punks.map((punk) => punk.loop),
      dealt,
    );
    assert.equal(new Set(dealt).size, 3, `two share a scene: ${dealt}`);
    for (const punk of show.punks) {
      assert.equal(LOOP_ENERGY[punk.loop], 0, punk.loop);
    }
  });

  it('C22: whoever arrives while music plays takes a dance of the tier', () => {
    const show = new Show({ random: chance().next });
    show.hear(true, 2);
    arrive(show);
    for (const punk of show.punks) {
      assert.ok(dancesOf(2).includes(punk.loop), `${punk.id} does ${punk.loop}`);
    }
  });

  it('C22: a tick advances everyone on stage by one frame, and nobody in the wings', () => {
    const show = new Show({ random: chance().next });
    arrive(show);
    const spike = punkOf(show, 'spike');
    spike.state = 'off';
    spike.x = 150;
    const before = show.punks.map((punk) => ({ ...punk }));
    show.tick();
    for (const [at, punk] of show.punks.entries()) {
      if (punk.id === 'spike') {
        assert.deepEqual(punk, before[at], 'somebody in the wings moved');
      } else {
        assert.equal(punk.index, (before[at].index + 1) % punk.frames.length);
        assert.equal(punk.held, before[at].held + 1);
        assert.equal(punk.x, before[at].x, 'a scene does not drift');
      }
    }
    assert.equal(show.placements().length, 2, 'somebody in the wings is drawn');
  });

  it('C22: the dances of a tier are its loops that open on a dance frame', () => {
    for (const tier of [1, 2, 3]) {
      const dances = dancesOf(tier);
      assert.ok(dances.length >= 3, `tier ${tier} has ${dances}`);
      for (const loop of dances) {
        assert.equal(LOOP_ENERGY[loop], tier);
        assert.equal(FRAME_META[LOOPS[loop][0]].group, 'dance');
      }
    }
    assert.ok(!dancesOf(1).includes('walk'), 'walking is not a dance');
    assert.deepEqual(dancesOf(0), []);
    assert.deepEqual([...BREAK_LOOPS], ['smoke', 'beer', 'n64', 'tv', 'amp', 'hairspray', 'lace']);
  });

  it('C22: a dance is held 16 frames, then swapped for another with chance one half', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    const had = show.punks.map((punk) => punk.loop);
    // Chance says no: the dance goes on however long it is held.
    for (let tick = 0; tick < 3 * DANCE_HOLD_FRAMES; tick += 1) {
      show.tick();
    }
    assert.deepEqual(
      show.punks.map((punk) => punk.loop),
      had,
    );

    show.hear(true, 2);
    const held = show.punks.map((punk) => punk.loop);
    source.fallback = 0.49;
    for (let tick = 1; tick < DANCE_HOLD_FRAMES; tick += 1) {
      show.tick();
      assert.deepEqual(
        show.punks.map((punk) => punk.loop),
        held,
        `swapped after ${tick} frames`,
      );
    }
    show.tick();
    for (const [at, punk] of show.punks.entries()) {
      assert.notEqual(punk.loop, held[at], `${punk.id} was handed the dance it had`);
      assert.ok(dancesOf(2).includes(punk.loop), punk.loop);
      assert.equal(punk.index, 0);
      assert.equal(punk.held, 0);
    }
  });

  it('C22: a new tier re-picks for everyone on stage, and the same tier for nobody', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    show.tick();
    const calls = source.calls;
    const before = show.punks.map((punk) => ({ ...punk }));
    show.hear(true, 1);
    assert.equal(source.calls, calls, 'chance was drawn for news that was not new');
    assert.deepEqual(show.punks, before);

    show.hear(true, 3);
    for (const punk of show.punks) {
      assert.ok(dancesOf(3).includes(punk.loop), punk.loop);
      assert.equal(punk.index, 0);
    }
    // A tier the sheet does not have is the nearest it does.
    show.hear(true, 9);
    assert.equal(show.tier, 3);
    show.hear(true, 0);
    assert.equal(show.tier, 1);
    for (const punk of show.punks) {
      assert.ok(dancesOf(1).includes(punk.loop), punk.loop);
    }
  });

  it('C22: the outer punks face the centre, and the one who stands there picks a side', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    assert.deepEqual(
      show.punks.map((punk) => punk.facing),
      [1, -1, -1],
    );
    source.fallback = 0.49;
    show.hear(true, 1);
    // 0.49 of three dances is the second; none of tier 1 drifts.
    assert.deepEqual(
      show.punks.map((punk) => punk.facing),
      [1, 1, -1],
    );
  });

  it('C22: strut drifts, and turns for home once it is more than 14 columns away', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    const billy = punkOf(show, 'billy');
    // Billy's draws come first: 0 picks the first dance of tier 2, strut, and 0
    // again sends it off to the right.
    source.queue.push(0, 0);
    show.hear(true, 2);
    assert.equal(billy.loop, 'strut');
    assert.equal(billy.facing, 1);

    const seen = [];
    for (let tick = 0; tick < 80; tick += 1) {
      show.tick();
      seen.push(billy.x - billy.home);
    }
    assert.equal(Math.max(...seen), DRIFT_COLS + 2, 'it turns on the first step past 14');
    assert.equal(Math.min(...seen), -DRIFT_COLS - 2);
    assert.equal(billy.loop, 'strut');
  });

  it('C22: a break deals every punk a different scene, and the middle one stays', () => {
    const show = new Show({ random: mulberry32(7) });
    arrive(show);
    const played = new Set();
    for (let song = 0; song < 300; song += 1) {
      show.hear(true, 1 + (song % 3));
      for (let tick = 0; tick < 40; tick += 1) {
        show.tick();
      }
      show.hear(false, 0);
      const mo = punkOf(show, 'mo');
      assert.equal(mo.state, 'stage', `song ${song}: the stage is empty`);
      const scenes = show.punks
        .filter((punk) => punk.state === 'stage' && punk.loop !== 'sleep')
        .map((punk) => punk.loop);
      assert.equal(new Set(scenes).size, scenes.length, `song ${song}: ${scenes}`);
      for (const scene of scenes) {
        assert.equal(LOOP_ENERGY[scene], 0, scene);
        played.add(scene);
      }
      for (let tick = 0; tick < 30; tick += 1) {
        show.tick();
        for (const punk of show.punks) {
          assert.ok(punk.x >= -WINGS_COLS - 2 && punk.x <= STAGE.cols + WINGS_COLS + 2);
        }
      }
    }
    assert.deepEqual([...played].sort(), [...BREAK_LOOPS].sort(), 'a scene nobody ever plays');
  });

  it('C22: with chance forced, one walks off, the others sleep, and a rabbit crosses', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    source.fallback = 0;
    show.hear(false, 0);

    const [billy, mo, spike] = show.punks;
    assert.deepEqual([billy.state, billy.loop, billy.facing], ['exit', 'walk', -1]);
    assert.deepEqual([mo.state, mo.loop, mo.frames], ['stage', 'sleep', EGGS.sleep]);
    assert.deepEqual([spike.state, spike.loop], ['stage', 'sleep']);
    assert.deepEqual(show.animal, {
      kind: 'rabbit',
      frames: EGGS.rabbit,
      index: 0,
      x: -ANIMAL_WINGS_COLS,
    });

    // He walks to the nearer edge, and is gone once 20 columns past it.
    source.fallback = 0.99;
    let ticks = 0;
    while (billy.state === 'exit') {
      const x = billy.x;
      show.tick();
      ticks += 1;
      assert.equal(billy.x, x - 2);
    }
    assert.equal(billy.state, 'off');
    assert.equal(billy.x, -WINGS_COLS - 2);
    assert.equal(ticks, (STAGE.homes.billy + WINGS_COLS + 2) / 2);
    assert.equal(show.placements().length, 3, 'two punks and the rabbit');
    assert.equal(show.caption(), 'billy off, mo sleep, spike sleep, rabbit');

    // The music returns: he comes back from where he went, and the sleepers wake.
    show.hear(true, 2);
    assert.deepEqual([billy.state, billy.loop, billy.facing], ['enter', 'walk', 1]);
    arrive(show);
    assert.equal(billy.x, billy.home);
    for (const punk of show.punks) {
      assert.ok(dancesOf(2).includes(punk.loop), punk.loop);
    }
  });

  it('C22: the punk on the right leaves to the right, and turns round if the music returns', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    // Seven scenes take six draws to deal; then somebody leaves, and it is the
    // second of the two who may.
    source.queue.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.99);
    show.hear(false, 0);
    const spike = punkOf(show, 'spike');
    assert.deepEqual([spike.state, spike.facing], ['exit', 1]);
    for (let tick = 0; tick < 5; tick += 1) {
      show.tick();
    }
    assert.equal(spike.x, spike.home + 10);

    show.hear(true, 1);
    assert.deepEqual([spike.state, spike.facing], ['enter', -1]);
    arrive(show);
    assert.equal(spike.x, spike.home);

    // Left alone, he goes all the way.
    source.queue.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.99);
    show.hear(false, 0);
    while (spike.state === 'exit') {
      show.tick();
    }
    assert.equal(spike.x, STAGE.cols + WINGS_COLS + 2);
  });

  it('C22: the rabbit hops by its frames, at floor level, and is gone past the right edge', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    // Deal, nobody leaves, nobody sleeps and mo picks a side, then: an animal, the rabbit.
    source.queue.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.24);
    show.hear(false, 0);
    assert.equal(show.animal?.kind, 'rabbit');
    assert.equal(source.queue.length, 0, 'the draws are not the ones this test scripts');

    const hops = [];
    let ticks = 0;
    while (show.animal !== null) {
      const { x } = show.animal;
      show.tick();
      ticks += 1;
      assert.ok(ticks < 400, 'the rabbit never leaves');
      if (show.animal !== null) {
        hops.push(show.animal.x - x);
        const placed = show.placements().at(-1);
        assert.ok(placed);
        const frame = EGGS.rabbit[show.animal.index];
        assert.equal(placed.sprite, EXTRAS[frame]);
        assert.equal(placed.left, show.animal.x - FRAME_META[frame].anchor);
        assert.equal(
          placed.top + placed.sprite.rows.length - 1,
          STAGE.floor,
          'its feet leave the floor',
        );
      }
    }
    assert.deepEqual(hops.slice(0, 6), [0, 4, 0, 0, 4, 0]);
  });

  it('C22: the cat ambles through a break, creeps through a song, and is not sent back', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    source.queue.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.54, 0.25);
    show.hear(false, 0);
    const cat = show.animal;
    assert.ok(cat);
    assert.deepEqual([cat.kind, cat.x], ['cat', -ANIMAL_WINGS_COLS]);
    show.tick();
    assert.equal(cat.x, -ANIMAL_WINGS_COLS + CAT_COLS.break);
    assert.equal(show.placements().at(-1)?.top, STAGE.floor - 2);

    show.hear(true, 1);
    show.tick();
    assert.equal(cat.x, -ANIMAL_WINGS_COLS + CAT_COLS.break + CAT_COLS.music);

    // A second break with an animal in the draw leaves the one crossing alone.
    source.fallback = 0;
    show.hear(false, 0);
    assert.equal(show.animal, cat);
    while (show.animal !== null) {
      show.tick();
    }
    assert.ok(cat.x > STAGE.cols + ANIMAL_WINGS_COLS);
  });

  it('C22: a punk in pogo or climax when the tier drops is dazed for 8 frames, then dances', () => {
    for (const loop of ['pogo', 'climax']) {
      const source = chance();
      const show = new Show({ random: source.next });
      arrive(show);
      show.hear(true, 3);
      const billy = punkOf(show, 'billy');
      show.perform(billy, loop, LOOPS[loop]);
      source.queue.push(0.34);
      show.hear(true, 2);
      assert.deepEqual([billy.loop, billy.frames, billy.facing], ['dazed', EGGS.dazed, 1]);
      for (let tick = 1; tick < DAZED_FRAMES; tick += 1) {
        show.tick();
        assert.equal(billy.loop, 'dazed', `he came round after ${tick} frames`);
      }
      show.tick();
      assert.ok(dancesOf(2).includes(billy.loop), billy.loop);
    }
  });

  it('C22: nobody is dazed by luck alone, by another dance, or by the tier going up', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    const billy = punkOf(show, 'billy');

    show.hear(true, 3);
    show.perform(billy, 'pogo', LOOPS.pogo);
    source.queue.push(0.35);
    show.hear(true, 1);
    assert.notEqual(billy.loop, 'dazed', 'chance said no');

    show.hear(true, 3);
    show.perform(billy, 'headbang', LOOPS.headbang);
    source.fallback = 0;
    show.hear(true, 1);
    assert.notEqual(billy.loop, 'dazed', 'headbanging dazes nobody');

    show.hear(true, 2);
    show.perform(billy, 'pogo', LOOPS.pogo);
    show.hear(true, 3);
    assert.notEqual(billy.loop, 'dazed', 'the tier went up');

    // A break wakes whoever is dazed: he has a scene to get to.
    source.fallback = 0.99;
    show.perform(billy, 'pogo', LOOPS.pogo);
    source.queue.push(0);
    show.hear(true, 2);
    assert.equal(billy.loop, 'dazed');
    show.hear(false, 0);
    assert.equal(LOOP_ENERGY[billy.loop], 0);
    for (let tick = 0; tick < 2 * DAZED_FRAMES; tick += 1) {
      show.tick();
    }
    assert.equal(LOOP_ENERGY[billy.loop], 0, 'he started dancing in a break');
  });

  it('C22: the feet stay on their column whatever the frame and whichever way it faces', () => {
    const show = new Show({ random: chance().next });
    for (const [id, frames] of Object.entries(SPRITES)) {
      for (const frame of Object.keys(frames)) {
        const { anchor, width } = FRAME_META[frame];
        const right = show.place(frames, id, frame, 1, 40);
        assert.equal(right.sprite, frames[frame]);
        assert.equal(right.left + anchor, 40, frame);
        assert.equal(right.top, STAGE.floor - 15);

        const left = show.place(frames, id, frame, -1, 40);
        assert.deepEqual(left.sprite, mirror(frames[frame], width), frame);
        assert.equal(left.left + (width - 1 - anchor), 40, `${frame} mirrored`);
        // The column the feet are on holds the same ink, turned round.
        const foot = frames[frame].rows[15][anchor] ?? ' ';
        const turned = left.sprite.rows[15][width - 1 - anchor] ?? ' ';
        assert.equal(turned, mirror({ rows: [foot] }).rows[0] || ' ', frame);
        assert.equal(show.place(frames, id, frame, -1, 40).sprite, left.sprite, 'mirrored twice');
      }
    }
  });

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
      }
      const settled = show.punks.map((punk) => ({ ...punk }));
      show.tick(900);
      assert.ok(ticks <= 3, `a deal of at most 3 s took ${ticks + 1} ticks`);
      assert.equal(show.breakMs, 0, 'the clock was not started again');
      for (const [at, punk] of show.punks.entries()) {
        const was = settled[at];
        if (was.state === 'off') {
          assert.equal(punk.state, 'enter', `${punk.id} stayed in the wings`);
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

  it('C22: a choice at the very top of the range is the last one, not one past it', () => {
    const show = new Show({ random: () => 1 });
    assert.equal(show.pick(['a', 'b', 'c']), 'c');
    assert.equal(new Set(show.punks.map((punk) => punk.scene)).size, 3);
  });
});
