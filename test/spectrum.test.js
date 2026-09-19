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
import { BASS_HZ, hannWindow, SpectrumFeatures } from '../src/dsp/spectrum.js';
import { mulberry32 } from './helpers/synth.js';

const SIZE = 1024;
const RATE = 48000;

/**
 * A fresh feature extractor.
 *
 * @param {number} [sampleRate] Sample rate in Hz.
 * @returns {SpectrumFeatures} The extractor.
 */
const features = (sampleRate = RATE) => new SpectrumFeatures({ windowSize: SIZE, sampleRate });

/**
 * A frame of white noise.
 *
 * @param {number} [seed] Seed of the generator.
 * @returns {Float32Array} The frame.
 */
function noiseFrame(seed = 7) {
  const rand = mulberry32(seed);
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

/**
 * The flux of one frame, after a silent frame to compare against.
 *
 * @param {Float32Array} frame The frame.
 * @returns {number} Its onset strength.
 */
function fluxOf(frame) {
  const extractor = features();
  extractor.next(new Float32Array(SIZE));
  return extractor.next(frame).flux;
}

describe('spectrum', () => {
  it('C15: the Hann window is periodic: 0 at the start, 1 in the middle, symmetric', () => {
    const window = hannWindow(SIZE);
    assert.equal(window[0], 0);
    assert.ok(Math.abs(window[SIZE / 2] - 1) < 1e-12);
    for (let index = 1; index < SIZE; index += 1) {
      assert.ok(Math.abs(window[index] - window[SIZE - index]) < 1e-12, String(index));
    }
  });

  it('C15: silence reads zero flux, and so does the very first frame', () => {
    const quiet = features();
    for (let frame = 0; frame < 5; frame += 1) {
      assert.equal(quiet.next(new Float32Array(SIZE)).flux, 0);
    }
    assert.equal(features().next(noiseFrame()).flux, 0);
  });

  it('C15: a steady tone has almost no flux and a noise burst has a lot', () => {
    const tone = features();
    tone.next(sine(1000, 0));
    tone.next(sine(1000, 512));
    const steady = tone.next(sine(1000, 1024)).flux;
    const spike = fluxOf(noiseFrame());
    assert.ok(spike > 0);
    assert.ok(steady < spike / 50, `steady ${steady} against burst ${spike}`);
  });

  it('C15: only rises count: a fall reads zero', () => {
    const fall = features();
    fall.next(noiseFrame());
    assert.equal(fall.next(new Float32Array(SIZE)).flux, 0);
  });

  it('C15: a low kick counts for a good part of a broadband hit, not for a sliver', () => {
    const low = fluxOf(sine(60));
    const high = fluxOf(noiseFrame());
    assert.ok(low > 0.1 * high, `kick ${low} against noise ${high}`);
  });

  it('C15: energy above the highest counted frequency is ignored', () => {
    assert.ok(fluxOf(sine(12000)) < 1e-3);
  });

  it('C15: flatness is near 0 for a tone and near 1 for white noise', () => {
    assert.ok(features().next(sine(1000)).flatness < 0.05);
    assert.ok(features().next(noiseFrame()).flatness > 0.3);
  });

  it('C15: flatness stays within 0 and 1, and silence counts as flat', () => {
    for (const frame of [
      new Float32Array(SIZE),
      sine(60),
      sine(4000),
      noiseFrame(),
      noiseFrame(9),
    ]) {
      const { flatness } = features().next(frame);
      assert.ok(flatness >= 0 && flatness <= 1, `${flatness}`);
    }
    assert.equal(features().next(new Float32Array(SIZE)).flatness, 1);
  });

  it('C15: bass is the share of the energy below the cutoff', () => {
    assert.ok(features().next(sine(60)).bass > 0.99);
    assert.ok(features().next(sine(4000)).bass < 0.01);
    assert.equal(features().next(new Float32Array(SIZE)).bass, 0);
    assert.equal(BASS_HZ, 200);
  });

  it('C15: a tone right at the cutoff counts as bass, one above it does not', () => {
    assert.ok(features().next(sine(BASS_HZ - 40)).bass > 0.9);
    assert.ok(features().next(sine(BASS_HZ + 200)).bass < 0.1);
  });

  it('C15: the octave bands are strictly increasing and cover the counted bins', () => {
    for (const rate of [44100, 48000]) {
      const { edges, firstBin, lastBin, bassBin } = features(rate);
      assert.equal(edges.length, 9);
      assert.equal(edges[0], firstBin);
      assert.equal(edges.at(-1), lastBin + 1);
      for (let index = 1; index < edges.length; index += 1) {
        assert.ok(edges[index] > edges[index - 1], `${rate} Hz, edge ${index}`);
      }
      assert.ok(bassBin > firstBin && bassBin < lastBin, `${rate} Hz, bass bin ${bassBin}`);
    }
  });
});
