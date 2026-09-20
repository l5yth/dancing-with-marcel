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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BREAK_LOOPS, DANCE_LOOPS, LOOP_ENERGY, SceneDirector } from '../src/classify/scene.js';
import { DEFAULTS } from '../src/config.js';
import { LOOPS } from '../src/sprites/index.js';
import { mulberry32 } from './helpers/synth.js';

const HOP_MS = (512 / 44100) * 1000;

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
    flux: 1,
    onsets: 20,
    state: 'music',
    bpm: 140,
    confidence: 0.5,
    danceBpm: 140,
    locked: true,
    ...fields,
  };
}

/**
 * A director whose chance is a fixed sequence.
 *
 * @param {number[]} draws What `random()` returns, in order, repeating.
 * @returns {SceneDirector} The director.
 */
function director(draws) {
  let index = 0;
  return new SceneDirector({
    config: DEFAULTS,
    random: () => draws[index++ % draws.length],
  });
}

/**
 * Feed one event repeatedly.
 *
 * @param {SceneDirector} scene The director.
 * @param {PipelineEvent} what The event.
 * @param {number} ms How long to feed it.
 * @returns {string} The loop at the end.
 */
function hold(scene, what, ms) {
  let loop = scene.loop;
  for (let elapsed = 0; elapsed < ms; elapsed += HOP_MS) {
    loop = scene.update(what, HOP_MS);
  }
  return loop;
}

describe('scene director', () => {
  it('C8: every loop of the sprite sheet is reachable, and none is listed twice', () => {
    const all = [...BREAK_LOOPS, ...DANCE_LOOPS.flat()];
    assert.deepEqual([...all].sort(), Object.keys(LOOPS).sort());
    assert.equal(new Set(all).size, all.length);
    assert.equal(BREAK_LOOPS.length, 4);
    assert.deepEqual(BREAK_LOOPS, ['smoke', 'beer', 'n64', 'backstage']);
  });

  it('C8: a loop carries the energy of its strongest frame', () => {
    assert.equal(LOOP_ENERGY.idle, 1);
    assert.equal(LOOP_ENERGY.stomp, 2);
    assert.equal(LOOP_ENERGY.climax, 3);
    for (const loop of BREAK_LOOPS) {
      assert.equal(LOOP_ENERGY[loop], 0, loop);
    }
  });

  it('C8: a break draws one between-song scene and keeps it to the end', () => {
    for (const [draw, expected] of [
      [0, 'smoke'],
      [0.3, 'beer'],
      [0.6, 'n64'],
      [0.99, 'backstage'],
    ]) {
      const scene = director([Number(draw)]);
      const first = scene.update(event({ state: 'break' }), HOP_MS);
      assert.equal(first, expected);
      assert.equal(hold(scene, event({ state: 'break' }), 60000), expected, 'held for a minute');
    }
  });

  it('C8: chance is drawn once per break, not once per frame', () => {
    let draws = 0;
    const scene = new SceneDirector({
      config: DEFAULTS,
      random: () => {
        draws += 1;
        return 0.1;
      },
    });
    hold(scene, event({ state: 'break' }), 30000);
    assert.equal(draws, 1);
    hold(scene, event({ state: 'music', levelDb: -20 }), 5000);
    hold(scene, event({ state: 'break' }), 30000);
    assert.equal(draws, 3, 'one for the dance, one for the second break');
  });

  it('C8: over many breaks every between-song scene comes up', () => {
    const random = mulberry32(0xc0ffee);
    const scene = new SceneDirector({ config: DEFAULTS, random });
    /** @type {Record<string, number>} */
    const seen = {};
    for (let round = 0; round < 400; round += 1) {
      hold(scene, event({ state: 'music' }), 1500);
      const loop = hold(scene, event({ state: 'break' }), 1500);
      seen[loop] = (seen[loop] ?? 0) + 1;
    }
    assert.deepEqual(Object.keys(seen).sort(), [...BREAK_LOOPS].sort());
    for (const loop of BREAK_LOOPS) {
      assert.ok(seen[loop] > 400 * 0.15, `${loop} came up ${seen[loop]} times`);
    }
  });

  it('C8: how hard the room goes decides which dance he does', () => {
    // Quiet and slow, then loud and fast, at the same tempo range.
    const quiet = director([0]);
    assert.ok(
      DANCE_LOOPS[0].includes(hold(quiet, event({ levelDb: -47, danceBpm: 100 }), 3000)),
      'a quiet verse gets a low-energy loop',
    );
    const loud = director([0]);
    assert.ok(
      DANCE_LOOPS[2].includes(hold(loud, event({ levelDb: -20, danceBpm: 185 }), 3000)),
      'a loud fast chorus gets a high-energy loop',
    );
    const middle = director([0]);
    assert.ok(
      DANCE_LOOPS[1].includes(hold(middle, event({ levelDb: -39, danceBpm: 140 }), 3000)),
      'a groove gets a mid-energy loop',
    );
  });

  it('C8: drive runs from 0 to 1 and never leaves it', () => {
    const scene = director([0]);
    assert.equal(scene.driveOf(event({ levelDb: -48, danceBpm: DEFAULTS.bpmMin })), 0);
    assert.equal(scene.driveOf(event({ levelDb: 0, danceBpm: DEFAULTS.bpmMax })), 1);
    for (const levelDb of [-120, -60, -30, 0]) {
      for (const danceBpm of [40, 140, 400]) {
        const drive = scene.driveOf(event({ levelDb, danceBpm }));
        assert.ok(drive >= 0 && drive <= 1, `${drive}`);
      }
    }
  });

  it('C8: a dance is held for sceneHoldMs before another of the same energy may follow', () => {
    const scene = director([0, 0.99]);
    const playing = event({ levelDb: -20, danceBpm: 185 });
    const first = hold(scene, playing, 200);
    assert.equal(hold(scene, playing, DEFAULTS.sceneHoldMs - 500), first, 'still the same dance');
    const next = hold(scene, playing, 1000);
    assert.notEqual(next, first);
    assert.ok(DANCE_LOOPS[2].includes(next), 'and still a high-energy one');
  });

  it('C8: a change of energy switches the dance at once', () => {
    const scene = director([0]);
    const soft = hold(scene, event({ levelDb: -47, danceBpm: 100 }), 2000);
    assert.ok(DANCE_LOOPS[0].includes(soft));
    const hard = hold(scene, event({ levelDb: -20, danceBpm: 185 }), 200);
    assert.ok(DANCE_LOOPS[2].includes(hard), 'without waiting out the hold');
  });

  it('C8: he is between songs before anything has been heard', () => {
    const scene = new SceneDirector({ config: DEFAULTS });
    assert.ok(BREAK_LOOPS.includes(scene.loop));
    assert.equal(scene.state, 'break');
  });
});
