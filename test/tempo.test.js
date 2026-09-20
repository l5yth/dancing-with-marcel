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
import { DEFAULTS } from '../src/config.js';
import { estimateTempo } from '../src/dsp/tempo.js';
import { mulberry32 } from './helpers/synth.js';

const RANGE = { bpmMin: 95, bpmMax: 190 };

/**
 * An onset envelope: one unit spike per period, on a small floor.
 *
 * @param {number} rate Envelope rate in Hz.
 * @param {number} bpm Beats per minute.
 * @param {number} seconds Duration.
 * @returns {Float64Array} The envelope.
 */
function spikes(rate, bpm, seconds) {
  const envelope = new Float64Array(Math.round(rate * seconds)).fill(0.02);
  const period = (60 * rate) / bpm;
  for (let beat = 0; Math.round(beat * period) < envelope.length; beat += 1) {
    envelope[Math.round(beat * period)] += 1;
  }
  return envelope;
}

describe('estimateTempo', () => {
  it('C15: finds the tempo of a clean spike train', () => {
    const estimate = estimateTempo(spikes(100, 120, 8), 100, RANGE);
    assert.ok(estimate !== null);
    assert.ok(Math.abs(estimate.bpm - 120) < 1, `${estimate.bpm}`);
    assert.ok(estimate.confidence > 0.5, `${estimate.confidence}`);
  });

  it('C15: finds a tempo whose period is not a whole number of hops', () => {
    const rate = 44100 / 512;
    const estimate = estimateTempo(spikes(rate, 180, 8), rate, RANGE);
    assert.ok(estimate !== null);
    assert.ok(Math.abs(estimate.bpm - 180) < 180 * 0.01, `${estimate.bpm}`);
  });

  it('C15: folds a tempo above the range down by an octave, and one below it up', () => {
    const fast = estimateTempo(spikes(100, 240, 8), 100, RANGE);
    const slow = estimateTempo(spikes(100, 70, 8), 100, RANGE);
    assert.ok(fast !== null && Math.abs(fast.bpm - 120) < 1.5, `${fast?.bpm}`);
    assert.ok(slow !== null && Math.abs(slow.bpm - 140) < 2, `${slow?.bpm}`);
  });

  it('C15: a random envelope has a tempo of no confidence', () => {
    const rand = mulberry32(3);
    const envelope = Float64Array.from({ length: 800 }, () => rand());
    const estimate = estimateTempo(envelope, 100, RANGE);
    assert.ok(
      estimate === null || estimate.confidence < DEFAULTS.tempoMinConfidence,
      `${estimate?.confidence}`,
    );
  });

  it('C15: no tempo without variation, without enough data, or without a range', () => {
    assert.equal(estimateTempo(new Float64Array(800).fill(1), 100, RANGE), null);
    assert.equal(estimateTempo(new Float64Array(800), 100, RANGE), null);
    assert.equal(estimateTempo(spikes(100, 120, 2), 100, RANGE), null);
    assert.equal(estimateTempo(spikes(100, 120, 8), 100, { bpmMin: 190, bpmMax: 95 }), null);
  });

  it('C15: a steady sound reports no tempo, however faint its ripple', () => {
    const rand = mulberry32(11);
    for (const ripple of [1e-9, 1e-6, 1e-3]) {
      const envelope = Float64Array.from({ length: 800 }, () => 0.02 + ripple * (rand() - 0.5));
      assert.equal(estimateTempo(envelope, 100, RANGE), null, `ripple ${ripple}`);
    }
  });

  it('C15: peaks that are large against the envelope still give a tempo', () => {
    const rate = 100;
    const envelope = Float64Array.from({ length: 800 }, (_, index) =>
      index % 50 === 0 ? 1 : 0.02,
    );
    const estimate = estimateTempo(envelope, rate, RANGE);
    assert.ok(estimate !== null);
    assert.ok(Math.abs(estimate.bpm - 120) < 1, `${estimate.bpm}`);
  });

  it('C15: the confidence stays within 0 and 1', () => {
    const estimate = estimateTempo(spikes(100, 150, 8), 100, RANGE);
    assert.ok(estimate !== null && estimate.confidence >= 0 && estimate.confidence <= 1);
  });
});
