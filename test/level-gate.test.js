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
import { LevelGate } from '../src/classify/level-gate.js';

const CONFIG = {
  musicDb: -40,
  breakDb: -50,
  musicEnterMs: 1000,
  breakHoldMs: 2000,
  levelWindowMs: 400,
};
const FRAME_MS = 10;

/**
 * Feed a constant level for a duration.
 *
 * @param {LevelGate} gate The gate.
 * @param {number} levelDb Level in dBFS.
 * @param {number} ms Duration in milliseconds.
 * @returns {string} The state after the last frame.
 */
function feed(gate, levelDb, ms) {
  let state = gate.state;
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
    state = gate.update(levelDb, FRAME_MS);
  }
  return state;
}

/**
 * Feed a constant level until the state changes.
 *
 * @param {LevelGate} gate The gate.
 * @param {number} levelDb Level in dBFS.
 * @returns {number} Milliseconds until the state changed.
 */
function msUntilSwitch(gate, levelDb) {
  const before = gate.state;
  let elapsed = 0;
  while (gate.state === before && elapsed < 60000) {
    gate.update(levelDb, FRAME_MS);
    elapsed += FRAME_MS;
  }
  return elapsed;
}

describe('LevelGate', () => {
  it('unit: starts in break and stays there on a quiet room', () => {
    const gate = new LevelGate(CONFIG);
    assert.equal(gate.state, 'break');
    assert.equal(feed(gate, -70, 5000), 'break');
  });

  it('unit: enters music after musicEnterMs of loud audio, not before', () => {
    const gate = new LevelGate(CONFIG);
    assert.equal(feed(gate, -20, 990), 'break');
    assert.equal(feed(gate, -20, FRAME_MS), 'music');
  });

  it('unit: a loud burst shorter than musicEnterMs is ignored', () => {
    const gate = new LevelGate(CONFIG);
    assert.equal(feed(gate, -20, 500), 'break');
    feed(gate, -80, 2000);
    // The burst plus the window it lingers in still has to stay under musicEnterMs.
    assert.equal(feed(gate, -20, 500), 'break');
  });

  it('unit: leaves music after breakHoldMs of quiet, plus the width of the level window', () => {
    const gate = new LevelGate(CONFIG);
    feed(gate, -20, 3000);
    assert.equal(gate.state, 'music');
    const ms = msUntilSwitch(gate, -80);
    const budget = CONFIG.breakHoldMs + CONFIG.levelWindowMs;
    assert.ok(ms >= CONFIG.breakHoldMs && ms <= budget + 100, `left music after ${ms} ms`);
    assert.equal(gate.state, 'break');
  });

  it('unit: a quiet stretch shorter than breakHoldMs stays music', () => {
    const gate = new LevelGate(CONFIG);
    feed(gate, -20, 3000);
    assert.equal(feed(gate, -80, 1000), 'music');
    assert.equal(feed(gate, -20, 3000), 'music');
    assert.equal(feed(gate, -80, 1000), 'music');
  });

  it('unit: levels between the thresholds change nothing', () => {
    const inBreak = new LevelGate(CONFIG);
    assert.equal(feed(inBreak, -45, 5000), 'break');
    const inMusic = new LevelGate(CONFIG);
    feed(inMusic, -20, 3000);
    assert.equal(feed(inMusic, -45, 10000), 'music');
  });

  it('unit: the first reading is the level, with no ramp from silence', () => {
    const gate = new LevelGate(CONFIG);
    assert.equal(gate.levelDb, null);
    gate.update(-30, FRAME_MS);
    assert.ok(Math.abs(gate.levelDb - -30) < 1e-9, `${gate.levelDb}`);
  });

  it('unit: the gaps between drum hits do not drag the level down to silence', () => {
    // Four loud hops, then 32 silent ones: a beat at about 150 bpm.
    const gate = new LevelGate(CONFIG);
    for (let beat = 0; beat < 40; beat += 1) {
      for (let hop = 0; hop < 36; hop += 1) {
        gate.update(hop < 4 ? -14 : -120, FRAME_MS);
      }
    }
    assert.ok(Math.abs(gate.levelDb - -14) < 1e-9, `${gate.levelDb}`);
    assert.equal(gate.state, 'music');
  });

  it('unit: the level is the loudest hop of the window and expires with it', () => {
    const gate = new LevelGate(CONFIG);
    gate.update(-14, FRAME_MS);
    feed(gate, -60, CONFIG.levelWindowMs - 2 * FRAME_MS);
    assert.ok(Math.abs(gate.levelDb - -14) < 1e-9, `still the peak: ${gate.levelDb}`);
    feed(gate, -60, 3 * FRAME_MS);
    assert.ok(Math.abs(gate.levelDb - -60) < 1e-9, `peak expired: ${gate.levelDb}`);
    assert.equal(gate.recent.length, Math.round(CONFIG.levelWindowMs / FRAME_MS));
  });

  it('unit: a frame longer than the window still leaves one hop in it', () => {
    const gate = new LevelGate(CONFIG);
    gate.update(-30, 5000);
    assert.equal(gate.recent.length, 1);
    gate.update(-70, 5000);
    assert.ok(Math.abs(gate.levelDb - -70) < 1e-9, `${gate.levelDb}`);
  });

  it('unit: musicEnterMs of zero enters music on the first loud frame', () => {
    const gate = new LevelGate({ ...CONFIG, musicEnterMs: 0 });
    assert.equal(gate.update(-20, FRAME_MS), 'music');
  });
});
