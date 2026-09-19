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
import { rmsDb, SILENCE_DB } from '../src/dsp/level.js';

describe('rmsDb', () => {
  it('unit: silence and an empty frame read as the silence floor', () => {
    assert.equal(rmsDb(new Float32Array(512)), SILENCE_DB);
    assert.equal(rmsDb(new Float32Array(0)), SILENCE_DB);
  });

  it('unit: a full-scale square wave is 0 dBFS', () => {
    assert.ok(Math.abs(rmsDb(new Float32Array(512).fill(1))) < 1e-6);
  });

  it('unit: a half-scale signal is 6 dB down', () => {
    assert.ok(Math.abs(rmsDb(new Float32Array(512).fill(0.5)) - -6.0206) < 1e-3);
  });

  it('unit: a full-scale sine is about -3 dBFS', () => {
    const cycles = 10;
    const length = 4800;
    const sine = Float32Array.from({ length }, (_, index) =>
      Math.sin((2 * Math.PI * cycles * index) / length),
    );
    assert.ok(Math.abs(rmsDb(sine) - -3.0103) < 0.01);
  });

  it('unit: the sign of the samples does not matter', () => {
    assert.equal(rmsDb(new Float32Array(64).fill(-0.25)), rmsDb(new Float32Array(64).fill(0.25)));
  });
});
