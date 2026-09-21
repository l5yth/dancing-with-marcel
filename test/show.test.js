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
  ANCHOR_PUNK,
  ANIMAL_CHANCE,
  ANIMAL_WINGS_COLS,
  BREAK_LOOPS,
  CAT_COLS,
  CENTRE_COLS,
  DANCE_HOLD_FRAMES,
  DAZED_CHANCE,
  DAZED_FRAMES,
  DRIFT_COLS,
  dancesOf,
  RABBIT_CHANCE,
  REFRESH_MS,
  Show,
  SLEEP_CHANCE,
  STAGE,
  SWAP_CHANCE,
  WANDER_CHANCE,
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
import { arrive, chance, DEAL, punkOf, tickUntil } from './helpers/show.js';
import { mulberry32 } from './helpers/synth.js';

describe('the show', () => {
  it('C22: every number of the show is the one SPEC F3 to F8 gives', () => {
    // The tests below are written with these names, so a changed number would
    // change the tests with it. Here they are held to what was decided.
    assert.deepEqual(
      {
        ANCHOR_PUNK,
        CENTRE_COLS,
        DANCE_HOLD_FRAMES,
        SWAP_CHANCE,
        DRIFT_COLS,
        WINGS_COLS,
        ANIMAL_WINGS_COLS,
        CAT_COLS: { ...CAT_COLS },
        DAZED_FRAMES,
        DAZED_CHANCE,
        SLEEP_CHANCE,
        WANDER_CHANCE,
        ANIMAL_CHANCE,
        RABBIT_CHANCE,
        REFRESH_MS: { ...REFRESH_MS },
        WINGS: { ...WINGS },
      },
      {
        ANCHOR_PUNK: 'mo',
        CENTRE_COLS: 6,
        DANCE_HOLD_FRAMES: 16,
        SWAP_CHANCE: 0.5,
        DRIFT_COLS: 14,
        WINGS_COLS: 20,
        ANIMAL_WINGS_COLS: 14,
        CAT_COLS: { break: 5, music: 1 },
        DAZED_FRAMES: 8,
        DAZED_CHANCE: 0.35,
        SLEEP_CHANCE: 0.15,
        WANDER_CHANCE: 0.45,
        ANIMAL_CHANCE: 0.55,
        RABBIT_CHANCE: 0.25,
        REFRESH_MS: { min: 60000, max: 300000 },
        WINGS: { billy: -28, mo: -10, spike: 130 },
      },
    );
  });

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
    tickUntil(
      show,
      () => show.punks.every((punk) => punk.state !== 'enter'),
      () => {
        const [billy, mo] = show.punks;
        assert.ok(billy.x < mo.x, `billy at ${billy.x} has caught mo at ${mo.x}`);
      },
    );
    for (const punk of show.punks) {
      assert.equal(punk.state, 'stage');
      assert.equal(punk.x, punk.home, punk.id);
    }
  });

  it('C22: whoever arrives between songs takes the scene it was dealt', () => {
    const show = new Show({ random: chance().next });
    const dealt = show.punks.map((punk) => punk.scene);
    const walking = new Set(show.punks);
    tickUntil(
      show,
      () => walking.size === 0,
      () => {
        for (const punk of walking) {
          if (punk.state === 'stage') {
            // It opens on the scene's first frame, the tick it arrives.
            assert.deepEqual([punk.loop, punk.index, punk.held], [punk.scene, 0, 0], punk.id);
            walking.delete(punk);
          }
        }
      },
    );
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

  it('C22: a new dance is never the one it had, wherever chance points', () => {
    for (const tier of [1, 2, 3]) {
      for (const had of dancesOf(tier)) {
        for (const draw of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99]) {
          const source = chance();
          const show = new Show({ random: source.next });
          arrive(show);
          show.hear(true, tier);
          const billy = punkOf(show, 'billy');
          show.perform(billy, had, LOOPS[had]);
          source.queue.push(draw);
          show.dance(billy);
          assert.notEqual(billy.loop, had, `tier ${tier}, draw ${draw}: handed ${had} again`);
          assert.ok(dancesOf(tier).includes(billy.loop), billy.loop);
        }
      }
    }
  });

  it('C22: a draw equal to the chance says no, and one just under it says yes', () => {
    // The swap: held long enough, and chance at one half exactly.
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    const had = show.punks.map((punk) => punk.loop);
    source.fallback = SWAP_CHANCE;
    for (let tick = 0; tick < 2 * DANCE_HOLD_FRAMES; tick += 1) {
      show.tick();
    }
    assert.deepEqual(
      show.punks.map((punk) => punk.loop),
      had,
    );

    // Walking off, sleeping, and the animal, each on its own line of the deal.
    const breakWith = (/** @type {number[]} */ draws) => {
      const fresh = chance();
      const made = new Show({ random: fresh.next });
      arrive(made);
      made.hear(true, 1);
      fresh.queue.push(...DEAL, ...draws);
      made.hear(false, 0);
      return made;
    };
    const stayed = breakWith([WANDER_CHANCE]);
    assert.ok(stayed.punks.every((punk) => punk.state === 'stage'));
    const left = breakWith([WANDER_CHANCE - 0.01, 0.99]);
    assert.deepEqual(
      left.punks.map((punk) => punk.state),
      ['stage', 'stage', 'exit'],
    );
    const awake = breakWith([0.99, SLEEP_CHANCE]);
    assert.notEqual(punkOf(awake, 'billy').loop, 'sleep');
    const asleep = breakWith([0.99, SLEEP_CHANCE - 0.01]);
    assert.equal(punkOf(asleep, 'billy').loop, 'sleep');
    // Nobody leaves, nobody sleeps, Mo picks a side: five draws, then the animal.
    const quiet = [0.99, 0.99, 0.99, 0.99, 0.99];
    assert.equal(breakWith([...quiet, ANIMAL_CHANCE]).animal, null);
    assert.equal(breakWith([...quiet, ANIMAL_CHANCE - 0.01, RABBIT_CHANCE]).animal?.kind, 'cat');
    assert.equal(
      breakWith([...quiet, ANIMAL_CHANCE - 0.01, RABBIT_CHANCE - 0.01]).animal?.kind,
      'rabbit',
    );
    // Dazed: the same line, from both sides.
    for (const [draw, loop] of /** @type {[number, boolean][]} */ ([
      [DAZED_CHANCE, false],
      [DAZED_CHANCE - 0.01, true],
    ])) {
      const fresh = chance();
      const made = new Show({ random: fresh.next });
      arrive(made);
      made.hear(true, 3);
      const billy = punkOf(made, 'billy');
      made.perform(billy, 'pogo', LOOPS.pogo);
      fresh.queue.push(draw);
      made.hear(true, 2);
      assert.equal(billy.loop === 'dazed', loop, `a draw of ${draw}`);
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

  it('C22: only a punk within 6 columns of the centre has to pick a side', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    const mo = punkOf(show, 'mo');
    const centre = STAGE.cols / 2;
    for (const [x, draw, facing] of [
      [centre + 6, 0.49, 1],
      [centre + 6, 0.5, -1],
      [centre - 6, 0.5, -1],
      [centre, 0.49, 1],
    ]) {
      mo.x = x;
      source.queue.push(draw);
      show.faceCentre(mo);
      assert.equal(mo.facing, facing, `at ${x} with a draw of ${draw}`);
      assert.equal(source.queue.length, 0, `at ${x} no side was picked`);
    }
    // One column further out there is a centre to face, and chance is not asked.
    for (const [x, facing] of [
      [centre + 7, -1],
      [centre - 7, 1],
    ]) {
      const calls = source.calls;
      mo.x = x;
      show.faceCentre(mo);
      assert.equal(mo.facing, facing, `at ${x}`);
      assert.equal(source.calls, calls, `at ${x} chance was asked`);
    }
  });

  it('C22: strut picks its facing at random, either way', () => {
    for (const [draw, facing] of [
      [0.49, 1],
      [0.5, -1],
    ]) {
      const source = chance();
      const show = new Show({ random: source.next });
      arrive(show);
      // Billy's draws come first: 0 is strut, and the next is the way it goes.
      source.queue.push(0, draw);
      show.hear(true, 2);
      const billy = punkOf(show, 'billy');
      assert.deepEqual([billy.loop, billy.facing], ['strut', facing], `a draw of ${draw}`);
      show.tick();
      assert.equal(billy.x, billy.home + 2 * facing);
    }
  });

  it('C22: a punk who has strutted walks home before it does anything else', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    const billy = punkOf(show, 'billy');
    source.queue.push(0, 0);
    show.hear(true, 2);
    for (let tick = 0; tick < 5; tick += 1) {
      show.tick();
    }
    assert.deepEqual([billy.loop, billy.x], ['strut', billy.home + 10]);

    // A new tier: the dance waits until he is back where he stands.
    show.hear(true, 3);
    assert.deepEqual([billy.state, billy.loop, billy.facing], ['enter', 'walk', -1]);
    for (let tick = 1; tick <= 5; tick += 1) {
      show.tick();
      assert.equal(billy.x, billy.home + 10 - 2 * tick);
    }
    assert.equal(billy.state, 'stage');
    assert.ok(dancesOf(3).includes(billy.loop), billy.loop);

    // The same before a scene: nobody sits down in a neighbour's lap.
    show.hear(true, 2);
    show.perform(billy, 'strut', LOOPS.strut);
    billy.facing = 1;
    for (let tick = 0; tick < 4; tick += 1) {
      show.tick();
    }
    show.hear(false, 0);
    assert.deepEqual([billy.state, billy.loop, billy.x], ['enter', 'walk', billy.home + 8]);
    arrive(show);
    assert.deepEqual([billy.x, billy.loop], [billy.home, billy.scene]);
  });

  it('C22: whoever is not drifting or walking stands on its home, all night', () => {
    const show = new Show({ random: mulberry32(42) });
    arrive(show);
    for (let song = 0; song < 200; song += 1) {
      show.hear(true, 2);
      for (let tick = 0; tick < 60; tick += 1) {
        show.tick(214);
        if (tick % 20 === 10) {
          show.hear(true, 1 + ((song + tick) % 3));
        }
        for (const punk of show.punks) {
          const moving = FRAME_META[punk.frames[0]].dx > 0;
          assert.ok(
            moving || punk.x === punk.home,
            `song ${song}: ${punk.id} does ${punk.loop} at ${punk.x}`,
          );
        }
      }
      show.hear(false, 0);
      for (let tick = 0; tick < 40; tick += 1) {
        show.tick(900);
        for (const punk of show.punks) {
          const moving = punk.loop === 'walk';
          assert.ok(
            moving || punk.x === punk.home,
            `break ${song}: ${punk.id} does ${punk.loop} at ${punk.x}`,
          );
        }
      }
    }
  });

  it('C22: a stride that would carry a walker past its home stops on it', () => {
    const show = new Show({ random: chance().next });
    const billy = punkOf(show, 'billy');
    billy.x = billy.home - 3;
    show.tick();
    assert.deepEqual([billy.state, billy.x], ['enter', billy.home - 1]);
    show.tick();
    assert.deepEqual([billy.state, billy.x], ['stage', billy.home]);
  });

  it('C22: a punk sent off and called back before its first step has not moved', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    source.queue.push(...DEAL, 0, 0);
    show.hear(false, 0);
    const billy = punkOf(show, 'billy');
    assert.equal(billy.state, 'exit');
    show.hear(true, 1);
    assert.deepEqual([billy.state, billy.x], ['stage', billy.home]);
    assert.ok(dancesOf(1).includes(billy.loop), billy.loop);
  });

  it('C22: a scene is kept until the break is dealt again, and chance is not asked meanwhile', () => {
    const source = chance();
    const show = new Show({ random: source.next });
    arrive(show);
    show.hear(true, 1);
    show.hear(false, 0);
    const scenes = show.punks.map((punk) => punk.loop);
    const calls = source.calls;
    // Every draw would say yes, if anything asked.
    source.fallback = 0;
    for (let tick = 0; tick < 3 * DANCE_HOLD_FRAMES; tick += 1) {
      show.tick(900);
      assert.deepEqual(
        show.punks.map((punk) => punk.loop),
        scenes,
        `a scene changed after ${tick + 1} frames`,
      );
    }
    assert.equal(source.calls, calls, 'chance was drawn inside a break');
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
      // Mo may be a few steps from home after a strut, but never in the wings.
      const mo = punkOf(show, 'mo');
      assert.ok(mo.state === 'stage' || mo.state === 'enter', `song ${song}: mo is ${mo.state}`);
      assert.ok(Math.abs(mo.x - mo.home) <= DRIFT_COLS + 2, `song ${song}: mo is at ${mo.x}`);
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
      assert.ok(ticks < 1000, 'he never reaches the wings');
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
    tickUntil(show, () => spike.state !== 'exit');
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
    tickUntil(show, () => show.animal === null);
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

  it('C22: a choice at the very top of the range is the last one, not one past it', () => {
    const show = new Show({ random: () => 1 });
    assert.equal(show.pick(['a', 'b', 'c']), 'c');
    const dealt = show.punks.map((punk) => punk.scene);
    assert.equal(new Set(dealt).size, 3);
    for (const scene of dealt) {
      assert.ok(BREAK_LOOPS.includes(scene), `dealt ${scene}`);
    }
  });
});
