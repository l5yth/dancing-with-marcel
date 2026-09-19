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

const CONFIG = { musicDb: -40, breakDb: -50, musicEnterMs: 1000, breakHoldMs: 2000, smoothMs: 250 };
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
    assert.equal(feed(gate, -20, 500), 'break');
  });

  it('unit: leaves music only after breakHoldMs of quiet', () => {
    const gate = new LevelGate(CONFIG);
    feed(gate, -20, 3000);
    assert.equal(gate.state, 'music');
    const ms = msUntilSwitch(gate, -80);
    assert.ok(ms >= 2000 && ms <= 2400, `left music after ${ms} ms`);
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

  it('unit: the first reading seeds the smoothing instead of ramping from silence', () => {
    const gate = new LevelGate(CONFIG);
    assert.equal(gate.smoothedDb, null);
    gate.update(-30, FRAME_MS);
    assert.equal(gate.smoothedDb, -30);
  });

  it('unit: smoothing converges on a steady level', () => {
    const gate = new LevelGate(CONFIG);
    gate.update(-80, FRAME_MS);
    feed(gate, -20, 5000);
    assert.ok(Math.abs(gate.smoothedDb - -20) < 0.01);
  });

  it('unit: musicEnterMs of zero enters music on the first loud frame', () => {
    const gate = new LevelGate({ ...CONFIG, musicEnterMs: 0 });
    assert.equal(gate.update(-20, FRAME_MS), 'music');
  });
});
