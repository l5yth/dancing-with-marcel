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
import { Fft } from '../src/dsp/fft.js';
import { mulberry32 } from './helpers/synth.js';

/**
 * A slow reference DFT.
 *
 * @param {Float64Array} re Real parts.
 * @param {Float64Array} im Imaginary parts.
 * @returns {{re: Float64Array, im: Float64Array}} The spectrum.
 */
function naiveDft(re, im) {
  const size = re.length;
  const outRe = new Float64Array(size);
  const outIm = new Float64Array(size);
  for (let bin = 0; bin < size; bin += 1) {
    for (let time = 0; time < size; time += 1) {
      const angle = (-2 * Math.PI * bin * time) / size;
      outRe[bin] += re[time] * Math.cos(angle) - im[time] * Math.sin(angle);
      outIm[bin] += re[time] * Math.sin(angle) + im[time] * Math.cos(angle);
    }
  }
  return { re: outRe, im: outIm };
}

describe('fft', () => {
  it('C15: matches a naive DFT on random complex input', () => {
    const rand = mulberry32(1);
    for (const size of [2, 4, 8, 64, 256]) {
      const re = Float64Array.from({ length: size }, () => rand() * 2 - 1);
      const im = Float64Array.from({ length: size }, () => rand() * 2 - 1);
      const expected = naiveDft(re, im);
      new Fft(size).transform(re, im);
      for (let bin = 0; bin < size; bin += 1) {
        assert.ok(Math.abs(re[bin] - expected.re[bin]) < 1e-9, `re[${bin}] of ${size}`);
        assert.ok(Math.abs(im[bin] - expected.im[bin]) < 1e-9, `im[${bin}] of ${size}`);
      }
    }
  });

  it('C15: a sine on an exact bin peaks at that bin and its mirror only', () => {
    const size = 64;
    const re = Float64Array.from({ length: size }, (_, index) =>
      Math.sin((2 * Math.PI * 5 * index) / size),
    );
    const im = new Float64Array(size);
    new Fft(size).transform(re, im);
    for (let bin = 0; bin < size; bin += 1) {
      const magnitude = Math.hypot(re[bin], im[bin]);
      const expected = bin === 5 || bin === size - 5 ? size / 2 : 0;
      assert.ok(Math.abs(magnitude - expected) < 1e-9, `bin ${bin}`);
    }
  });

  it('C15: an impulse has a flat spectrum', () => {
    const size = 32;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    re[0] = 1;
    new Fft(size).transform(re, im);
    for (let bin = 0; bin < size; bin += 1) {
      assert.ok(Math.abs(re[bin] - 1) < 1e-12 && Math.abs(im[bin]) < 1e-12, `bin ${bin}`);
    }
  });

  it("C15: Parseval's theorem holds", () => {
    const rand = mulberry32(2);
    const size = 128;
    const re = Float64Array.from({ length: size }, () => rand() * 2 - 1);
    const im = new Float64Array(size);
    const timeEnergy = re.reduce((total, value) => total + value * value, 0);
    new Fft(size).transform(re, im);
    let frequencyEnergy = 0;
    for (let bin = 0; bin < size; bin += 1) {
      frequencyEnergy += re[bin] * re[bin] + im[bin] * im[bin];
    }
    assert.ok(Math.abs(timeEnergy - frequencyEnergy / size) < 1e-9);
  });

  it('C15: sizes that are not a power of two are rejected', () => {
    for (const size of [0, 1, 3, 100, 1.5, Number.NaN, -8]) {
      assert.throws(() => new Fft(size), RangeError, String(size));
    }
  });
});
