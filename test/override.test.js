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
 * @file A tier forced from the keyboard (SPEC T1 to T3; ACCEPTANCE C23): the
 * pure part, with the time passed in.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OVERRIDE_MS, Override } from '../src/classify/override.js';

/** What the detector and the director say in these tests, when not overridden. */
const AUTO = Object.freeze({ dancing: true, tier: 3 });

describe('the override', () => {
  it('C23: a forced tier lasts thirty seconds', () => {
    assert.equal(OVERRIDE_MS, 30000);
  });

  it('C23: before any press nothing is forced, and what is said is what is heard', () => {
    const override = new Override();
    assert.equal(override.at(0), null);
    assert.equal(override.at(1e9), null);
    assert.equal(override.hearing(0, AUTO), AUTO, 'auto is passed through as it is');
  });

  it('C23: 0 forces a break and 1, 2 and 3 a dance tier, from the press to the deadline', () => {
    for (const [key, tier, dancing] of /** @type {[string, number, boolean][]} */ ([
      ['0', 0, false],
      ['1', 1, true],
      ['2', 2, true],
      ['3', 3, true],
    ])) {
      const override = new Override();
      assert.equal(override.press(key, 1000), true, key);
      assert.deepEqual(override.at(1000), { tier, leftMs: 30000 }, `${key} at the press`);
      assert.deepEqual(override.hearing(1000, AUTO), { dancing, tier }, `${key} at the press`);
      assert.deepEqual(override.at(30999), { tier, leftMs: 1 }, `${key} just before`);
      assert.deepEqual(override.hearing(30999, AUTO), { dancing, tier }, `${key} just before`);
      assert.equal(override.at(31000), null, `${key} at the deadline`);
      assert.equal(override.hearing(31000, AUTO), AUTO, `${key} at the deadline`);
      assert.equal(override.hearing(31001, AUTO), AUTO, `${key} after`);
    }
  });

  it('C23: a second press replaces the tier and restarts the thirty seconds', () => {
    const override = new Override();
    override.press('3', 0);
    override.press('1', 20000);
    assert.deepEqual(override.at(20000), { tier: 1, leftMs: 30000 });
    assert.deepEqual(
      override.hearing(30000, AUTO),
      { dancing: true, tier: 1 },
      'the first deadline passes',
    );
    assert.deepEqual(override.hearing(49999, AUTO), { dancing: true, tier: 1 });
    assert.equal(override.hearing(50000, AUTO), AUTO);
  });

  it('C23: pressing the tier already forced restarts the clock too', () => {
    const override = new Override();
    override.press('2', 0);
    override.press('2', 25000);
    assert.deepEqual(override.at(54999), { tier: 2, leftMs: 1 });
    assert.equal(override.at(55000), null);
  });

  it('C23: any other key is not a press, and leaves what is forced as it is', () => {
    const override = new Override();
    for (const key of ['4', '-', 'd', 'a', 'm', 'b', '', ' ', 'Digit2', 'Escape', '00', '1 ']) {
      assert.equal(override.press(key, 0), false, JSON.stringify(key));
      assert.equal(override.at(0), null, JSON.stringify(key));
    }
    override.press('3', 1000);
    for (const key of ['4', 'd', 'Escape']) {
      assert.equal(override.press(key, 5000), false, key);
      assert.deepEqual(override.at(5000), { tier: 3, leftMs: 26000 }, `${key} changed it`);
    }
  });

  it('C23: once it has run out it stays out, until the next press starts it again', () => {
    const override = new Override();
    override.press('1', 0);
    assert.equal(override.at(30000), null);
    assert.equal(override.at(30001), null);
    assert.equal(override.at(1e9), null);
    assert.equal(override.hearing(1e9, AUTO), AUTO);
    override.press('0', 1e9);
    assert.deepEqual(override.hearing(1e9 + 29999, AUTO), { dancing: false, tier: 0 });
    assert.equal(override.hearing(1e9 + 30000, AUTO), AUTO);
  });

  it('C23: what is left counts down to the millisecond and is never negative', () => {
    const override = new Override();
    override.press('2', 100);
    const left = [0, 1, 15000, 29999, 30000, 30001].map(
      (afterMs) => override.at(100 + afterMs)?.leftMs ?? null,
    );
    assert.deepEqual(left, [30000, 29999, 15000, 1, null, null]);
  });
});
