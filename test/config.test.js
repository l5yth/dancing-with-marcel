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
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { configWith, DEFAULTS, isDebug, parseConfig, RANGES } from '../src/config.js';

describe('config', () => {
  it('C11: the empty query returns the defaults', () => {
    assert.deepEqual(parseConfig(''), DEFAULTS);
    assert.deepEqual(DEFAULTS, {
      musicOverFloorDb: 12,
      breakUnderFloorDb: 8,
      pulseEnter: 0.15,
      pulseLeave: 0.09,
      pulseLeaveMs: 10000,
      pulseWindow: 8,
      minLevelSwingDb: 0.1,
      timbreWindowMs: 1500,
      floorRiseDbPerSec: 0.5,
      musicEnterMs: 3000,
      breakHoldMs: 2000,
      levelWindowMs: 400,
      bpmMin: 95,
      bpmMax: 190,
      tempoMinConfidence: 0.15,
      defaultBpm: 140,
      bpmSettleMs: 3000,
      driveRangeDb: 18,
      tierSettleMs: 2000,
      breakFrameMs: 900,
      breakRefreshMinMs: 60000,
      breakRefreshMaxMs: 300000,
    });
  });

  it('C11: the tempo range spans exactly one octave by default, so no tempo has two readings', () => {
    assert.equal(DEFAULTS.bpmMax, 2 * DEFAULTS.bpmMin);
  });

  it('C11: tempo tunables take valid overrides and refuse invalid ones', () => {
    const tuned = parseConfig('?bpmMin=80&bpmMax=160&tempoMinConfidence=0.5');
    assert.equal(tuned.bpmMin, 80);
    assert.equal(tuned.bpmMax, 160);
    assert.equal(tuned.tempoMinConfidence, 0.5);
    assert.equal(parseConfig('?tempoMinConfidence=1.5').tempoMinConfidence, 0.15);
    assert.equal(parseConfig('?tempoMinConfidence=-0.1').tempoMinConfidence, 0.15);
  });

  it('C11: a tempo range in the wrong order falls back to the defaults', () => {
    for (const query of ['?bpmMin=150&bpmMax=100', '?bpmMin=120&bpmMax=120', '?bpmMin=200']) {
      const config = parseConfig(query);
      assert.equal(config.bpmMin, DEFAULTS.bpmMin, query);
      assert.equal(config.bpmMax, DEFAULTS.bpmMax, query);
    }
  });

  it('C11: a valid override wins, with or without the leading question mark', () => {
    assert.equal(parseConfig('?breakHoldMs=4000').breakHoldMs, 4000);
    assert.equal(parseConfig('breakHoldMs=4000').breakHoldMs, 4000);
    assert.equal(parseConfig('?musicOverFloorDb=20&breakUnderFloorDb=15').musicOverFloorDb, 20);
    assert.equal(parseConfig('?musicOverFloorDb=20&breakUnderFloorDb=15').breakUnderFloorDb, 15);
  });

  it('C11: bounds are inclusive', () => {
    assert.equal(parseConfig('?breakHoldMs=0').breakHoldMs, 0);
    assert.equal(parseConfig('?breakHoldMs=60000').breakHoldMs, 60000);
  });

  it('C11: empty, non-numeric, and out-of-range values are ignored', () => {
    for (const raw of ['', '  ', 'abc', 'NaN', 'Infinity', '-5', '60001', '99999999']) {
      assert.equal(parseConfig(`?breakHoldMs=${encodeURIComponent(raw)}`).breakHoldMs, 2000, raw);
    }
  });

  it('C11: unknown keys are ignored', () => {
    assert.deepEqual(parseConfig('?foo=1&bar=2'), DEFAULTS);
    assert.deepEqual(configWith({ foo: 1 }), DEFAULTS);
  });

  it('C11: configWith is the one place the rules live, and the URL goes through it', () => {
    assert.deepEqual(configWith({}), DEFAULTS);
    assert.equal(configWith({ breakHoldMs: 4000 }).breakHoldMs, 4000);
    assert.equal(configWith({ breakHoldMs: 99999 }).breakHoldMs, DEFAULTS.breakHoldMs);
    assert.equal(configWith({ breakHoldMs: Number.NaN }).breakHoldMs, DEFAULTS.breakHoldMs);
    assert.equal(
      configWith({ musicOverFloorDb: 5, breakUnderFloorDb: 20 }).musicOverFloorDb,
      DEFAULTS.musicOverFloorDb,
    );
    assert.equal(
      configWith({ levelWindowMs: 5000, timbreWindowMs: 200 }).levelWindowMs,
      DEFAULTS.levelWindowMs,
    );
    assert.equal(configWith({ bpmMin: 150, bpmMax: 100 }).bpmMax, DEFAULTS.bpmMax);
    assert.ok(Object.isFrozen(configWith({})));
  });

  it('C11: a repeated key uses its first occurrence', () => {
    assert.equal(parseConfig('?breakHoldMs=3000&breakHoldMs=5000').breakHoldMs, 3000);
  });

  it('C11: the returned config is frozen', () => {
    assert.ok(Object.isFrozen(parseConfig('')));
    assert.ok(Object.isFrozen(DEFAULTS));
    assert.ok(Object.isFrozen(RANGES));
  });

  it('C11: DEFAULTS and RANGES have identical key sets and every default is in range', () => {
    assert.deepEqual(Object.keys(RANGES).sort(), Object.keys(DEFAULTS).sort());
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const [min, max] = RANGES[/** @type {keyof typeof RANGES} */ (key)];
      assert.ok(min <= value && value <= max, key);
      assert.ok(min < max, key);
    }
  });

  it('C11: every tunable in the parameter table carries a doc comment', () => {
    const source = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
    const start = source.indexOf('const PARAMS = {');
    const table = source.slice(start, source.indexOf('\n};', start)).split('\n');
    const keyLines = table.flatMap((line, index) => (/^ {2}\w+: \{/.test(line) ? [index] : []));
    assert.equal(keyLines.length, Object.keys(DEFAULTS).length);
    for (const index of keyLines) {
      assert.match(table[index - 1], /\*\/\s*$/, table[index]);
    }
  });

  it('C11: level thresholds in the wrong order fall back to the defaults', () => {
    for (const query of [
      '?musicOverFloorDb=5&breakUnderFloorDb=20',
      '?musicOverFloorDb=8&breakUnderFloorDb=8',
      '?musicOverFloorDb=4',
    ]) {
      const config = parseConfig(query);
      assert.equal(config.musicOverFloorDb, DEFAULTS.musicOverFloorDb, query);
      assert.equal(config.breakUnderFloorDb, DEFAULTS.breakUnderFloorDb, query);
    }
  });

  it('C11: isDebug is true only for debug=1', () => {
    assert.equal(isDebug('?debug=1'), true);
    assert.equal(isDebug('debug=1'), true);
    assert.equal(isDebug('?debug=0'), false);
    assert.equal(isDebug('?debug=true'), false);
    assert.equal(isDebug(''), false);
  });

  it('C11: nothing is persisted', () => {
    const storage = /localStorage|sessionStorage|indexedDB|document\.cookie/;
    for (const name of readdirSync(new URL('../src/', import.meta.url), { recursive: true })) {
      if (String(name).endsWith('.js')) {
        const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, storage, String(name));
      }
    }
  });
});
