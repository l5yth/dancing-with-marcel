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

  it('C8: how hard the room goes decides the tier', () => {
    const scene = new SceneDirector({ config: DEFAULTS });
    // Quiet and slow, a groove, then loud and fast.
    assert.equal(scene.update(event({ levelDb: -47, danceBpm: 100 })), 1, 'a quiet verse');
    assert.equal(scene.update(event({ levelDb: -39, danceBpm: 140 })), 2, 'a groove');
    assert.equal(scene.update(event({ levelDb: -20, danceBpm: 185 })), 3, 'a loud fast chorus');
    assert.equal(scene.tier, 3);
    // A change of energy is reported at once, and so is the end of the song.
    assert.equal(scene.update(event({ levelDb: -47, danceBpm: 100 })), 1);
    assert.equal(scene.update(event({ state: 'break' })), 0);
  });

  it('C8: the tiers meet at a third and two thirds of drive, and every tier has dances', () => {
    const scene = new SceneDirector({ config: DEFAULTS });
    // Level alone, at the slowest tempo: drive is 0.6 of how far over the bar.
    const at = (/** @type {number} */ drive) =>
      scene.update(
        event({
          levelDb: -60 + DEFAULTS.musicOverFloorDb + (drive / 0.6) * DEFAULTS.driveRangeDb,
          danceBpm: DEFAULTS.bpmMin,
        }),
      );
    assert.deepEqual([at(0), at(0.32), at(0.34), at(0.59)], [1, 1, 2, 2]);
    // Everything at once is still a tier the sheet has.
    assert.equal(scene.update(event({ levelDb: 0, danceBpm: 400 })), 3);
    assert.equal(scene.drive, 1);
    for (const tier of [1, 2, 3]) {
      assert.ok(dancesOf(tier).length >= 3, `tier ${tier}`);
    }
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
