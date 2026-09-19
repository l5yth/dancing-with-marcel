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
import { FluxExtractor, hannWindow } from '../src/dsp/flux.js';
import { mulberry32 } from './helpers/synth.js';

const SIZE = 1024;
const RATE = 48000;

/**
 * A fresh extractor.
 *
 * @param {number} [sampleRate] Sample rate in Hz.
 * @returns {FluxExtractor} The extractor.
 */
const extractor = (sampleRate = RATE) => new FluxExtractor({ windowSize: SIZE, sampleRate });

/**
 * A frame of white noise.
 *
 * @returns {Float32Array} The frame.
 */
function noiseFrame() {
  const rand = mulberry32(7);
  return Float32Array.from({ length: SIZE }, () => (rand() * 2 - 1) * 0.3);
}

/**
 * A frame holding a sine.
 *
 * @param {number} hertz Frequency.
 * @param {number} [offset] Start sample, to continue a tone across frames.
 * @returns {Float32Array} The frame.
 */
const sine = (hertz, offset = 0) =>
  Float32Array.from(
    { length: SIZE },
    (_, index) => 0.3 * Math.sin((2 * Math.PI * hertz * (index + offset)) / RATE),
  );

describe('flux', () => {
  it('C15: the Hann window is periodic: 0 at the start, 1 in the middle, symmetric', () => {
    const window = hannWindow(SIZE);
    assert.equal(window[0], 0);
    assert.ok(Math.abs(window[SIZE / 2] - 1) < 1e-12);
    for (let index = 1; index < SIZE; index += 1) {
      assert.ok(Math.abs(window[index] - window[SIZE - index]) < 1e-12, String(index));
    }
  });

  it('C15: silence reads zero flux, and so does the very first frame', () => {
    const quiet = extractor();
    for (let frame = 0; frame < 5; frame += 1) {
      assert.equal(quiet.next(new Float32Array(SIZE)), 0);
    }
    assert.equal(extractor().next(noiseFrame()), 0);
  });

  it('C15: a steady tone has almost no flux and a noise burst has a lot', () => {
    const tone = extractor();
    tone.next(sine(1000, 0));
    tone.next(sine(1000, 512));
    const steady = tone.next(sine(1000, 1024));
    const burst = extractor();
    burst.next(new Float32Array(SIZE));
    const spike = burst.next(noiseFrame());
    assert.ok(spike > 0);
    assert.ok(steady < spike / 50, `steady ${steady} against burst ${spike}`);
  });

  it('C15: only rises count: a fall reads zero', () => {
    const fall = extractor();
    fall.next(noiseFrame());
    assert.equal(fall.next(new Float32Array(SIZE)), 0);
  });

  it('C15: a low kick counts for a good part of a broadband hit, not for a sliver', () => {
    const kick = extractor();
    kick.next(new Float32Array(SIZE));
    const low = kick.next(sine(60));
    const broad = extractor();
    broad.next(new Float32Array(SIZE));
    const high = broad.next(noiseFrame());
    assert.ok(low > 0.1 * high, `kick ${low} against noise ${high}`);
  });

  it('C15: energy above the highest counted frequency is ignored', () => {
    const above = extractor();
    above.next(new Float32Array(SIZE));
    assert.ok(above.next(sine(12000)) < 1e-3);
  });

  it('C15: the octave bands are strictly increasing and cover the counted bins', () => {
    for (const rate of [44100, 48000]) {
      const { edges, firstBin, lastBin } = extractor(rate);
      assert.equal(edges.length, 9);
      assert.equal(edges[0], firstBin);
      assert.equal(edges.at(-1), lastBin + 1);
      for (let index = 1; index < edges.length; index += 1) {
        assert.ok(edges[index] > edges[index - 1], `${rate} Hz, edge ${index}`);
      }
    }
  });
});
