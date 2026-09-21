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
 * @file The scene director (SPEC D3, F5; ACCEPTANCE C8): how hard the room is
 * going, as a tier the punks dance to. Which loop each of them does with it is
 * the show's business, and C22's.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SceneDirector } from '../src/classify/scene.js';
import { dancesOf } from '../src/classify/show.js';
import { DEFAULTS } from '../src/config.js';

/**
 * A pipeline event, with the fields the director reads.
 *
 * @param {Partial<PipelineEvent>} fields What to override.
 * @returns {PipelineEvent} The event.
 */
function event(fields) {
  return {
    time: 0,
    levelDb: -20,
    floorDb: -60,
    flatness: 0.3,
    bass: 0.5,
    swing: 1,
    pulse: 0.3,
    state: 'music',
    bpm: 140,
    confidence: 0.5,
    danceBpm: 140,
    locked: true,
    ...fields,
  };
}

/**
 * A director that has just heard a song begin.
 *
 * @param {Partial<PipelineEvent>} fields How the song begins.
 * @param {Partial<Config>} [tuning] Tunables to override.
 * @returns {SceneDirector} The director.
 */
function opening(fields, tuning = {}) {
  const scene = new SceneDirector({ config: { ...DEFAULTS, ...tuning } });
  scene.update(event({ time: 0, ...fields }));
  return scene;
}

/** Events a second, for feeding a director a stretch of a song. */
const RATE = 10;

describe('scene director', () => {
  it('C8: between songs the tier is 0, and it is before anything has been heard', () => {
    const scene = new SceneDirector({ config: DEFAULTS });
    assert.deepEqual([scene.tier, scene.drive], [0, 0]);
    assert.equal(scene.update(event({ state: 'break', levelDb: -10, danceBpm: 190 })), 0);
    assert.deepEqual(
      [scene.tier, scene.drive],
      [0, 0],
      'a loud room between songs is still a break',
    );
  });

  it('C8: how hard the room goes decides the tier, from the first moment of a song', () => {
    // Quiet and slow, a groove, then loud and fast: each taken at once, because
    // a song has just begun and there is no dance to interrupt.
    assert.equal(opening({ levelDb: -47, danceBpm: 100 }).tier, 1, 'a quiet verse');
    assert.equal(opening({ levelDb: -39, danceBpm: 140 }).tier, 2, 'a groove');
    assert.equal(opening({ levelDb: -20, danceBpm: 185 }).tier, 3, 'a loud fast chorus');
    // And the end of a song is taken at once too.
    const scene = opening({ levelDb: -20, danceBpm: 185 });
    assert.equal(scene.update(event({ time: 0.1, state: 'break' })), 0);
  });

  it('C8: the tiers meet at a third and two thirds of drive, and every tier has dances', () => {
    // Level alone, at the slowest tempo: drive is 0.6 of how far over the bar.
    const quiet = (/** @type {number} */ drive) =>
      opening({
        levelDb: -60 + DEFAULTS.musicOverFloorDb + (drive / 0.6) * DEFAULTS.driveRangeDb,
        danceBpm: DEFAULTS.bpmMin,
      }).tier;
    assert.deepEqual([quiet(0), quiet(0.32), quiet(0.34), quiet(0.59)], [1, 1, 2, 2]);
    // At the fastest tempo, which carries 0.4 of it, the level carries the rest.
    const fast = (/** @type {number} */ drive) =>
      opening({
        levelDb: -60 + DEFAULTS.musicOverFloorDb + ((drive - 0.4) / 0.6) * DEFAULTS.driveRangeDb,
        danceBpm: DEFAULTS.bpmMax,
      }).tier;
    assert.deepEqual([fast(0.41), fast(0.65), fast(0.68), fast(0.99)], [2, 2, 3, 3]);
    // Everything at once is still a tier the sheet has.
    const scene = opening({ levelDb: 0, danceBpm: 400 });
    assert.deepEqual([scene.tier, scene.drive], [3, 1]);
    for (const tier of [1, 2, 3]) {
      assert.ok(dancesOf(tier).length >= 3, `tier ${tier}`);
    }
  });

  it('C8: inside a song a new tier is followed once it has lasted tierSettleMs, not before', () => {
    assert.equal(DEFAULTS.tierSettleMs, 2000);
    const scene = opening({ levelDb: -47, danceBpm: 100 });
    const loud = { levelDb: -20, danceBpm: 185 };
    assert.equal(scene.update(event({ time: 1, ...loud })), 1, 'followed at once');
    assert.equal(scene.update(event({ time: 2.9, ...loud })), 1, 'followed after 1.9 s');
    assert.equal(scene.asked, 3, 'the room is asking');
    assert.equal(scene.update(event({ time: 3, ...loud })), 3, 'not followed after 2 s');
    // With no settle time the room is followed at once, as it was before.
    const eager = opening({ levelDb: -47, danceBpm: 100 }, { tierSettleMs: 0 });
    assert.equal(eager.update(event({ time: 0.1, ...loud })), 3);
  });

  it('C8: a song that sits on the line between two tiers does not flicker', () => {
    // Just under and just over two thirds of drive, swapping three times a
    // second for a minute: each crossing used to start everybody on a new dance.
    const under = { levelDb: -41, danceBpm: DEFAULTS.bpmMax };
    const over = { levelDb: -38, danceBpm: DEFAULTS.bpmMax };
    const scene = opening(under);
    assert.equal(scene.tier, 2);
    assert.ok(scene.driveOf(event(over)) > 2 / 3, 'the room never asks for more');
    let changes = 0;
    let asked = 0;
    for (let at = 1; at <= 60 * RATE; at += 1) {
      const before = scene.tier;
      scene.update(event({ time: at / RATE, ...(Math.floor(at / 3) % 2 === 1 ? over : under) }));
      changes += scene.tier === before ? 0 : 1;
      asked += scene.asked === 3 ? 1 : 0;
    }
    assert.ok(asked > 250, `the room asked for the chorus in ${asked} of 600 events`);
    assert.equal(changes, 0, `${changes} changes of tier in a minute`);
    // Once it stays over the line, the punks follow.
    for (let at = 1; at <= 3 * RATE; at += 1) {
      scene.update(event({ time: 60 + at / RATE, ...over }));
    }
    assert.equal(scene.tier, 3);
  });

  it('C8: level weighs more than tempo, so loud and slow beats quiet and fast', () => {
    // Every earlier case moved level and tempo together, which any blend of
    // the two would pass. These pull them apart.
    const scene = new SceneDirector({ config: DEFAULTS });
    const loudSlow = scene.driveOf(event({ levelDb: -30, danceBpm: DEFAULTS.bpmMin }));
    const quietFast = scene.driveOf(event({ levelDb: -48, danceBpm: DEFAULTS.bpmMax }));
    assert.ok(loudSlow > quietFast, `loud and slow ${loudSlow}, quiet and fast ${quietFast}`);
    assert.ok(Math.abs(loudSlow - 0.6) < 1e-9, `${loudSlow}: level alone should carry 0.6`);
    assert.ok(Math.abs(quietFast - 0.4) < 1e-9, `${quietFast}: tempo alone should carry 0.4`);
  });

  it('C8: drive runs from 0 to 1 and never leaves it', () => {
    const scene = new SceneDirector({ config: DEFAULTS });
    assert.equal(scene.driveOf(event({ levelDb: -48, danceBpm: DEFAULTS.bpmMin })), 0);
    assert.equal(scene.driveOf(event({ levelDb: 0, danceBpm: DEFAULTS.bpmMax })), 1);
    for (const levelDb of [-120, -60, -30, 0]) {
      for (const danceBpm of [40, 140, 400]) {
        const drive = scene.driveOf(event({ levelDb, danceBpm }));
        assert.ok(drive >= 0 && drive <= 1, `${drive}`);
      }
    }
  });
});
