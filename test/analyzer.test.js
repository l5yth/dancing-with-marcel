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
import { Analyzer } from '../src/dsp/analyzer.js';
import { applause, concat, dense, drums, room, silence, speech } from './helpers/synth.js';

const RATES = [48000, 44100];
const MIN_CONFIDENCE = DEFAULTS.tempoMinConfidence;

/**
 * Run audio through a fresh analyzer.
 *
 * @param {Float32Array} audio The samples.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {number} [chunk] Samples per call to `push`.
 * @returns {AnalyzerFrame[]} Every frame.
 */
function analyze(audio, sampleRate, chunk = 4096) {
  const analyzer = new Analyzer({
    sampleRate,
    bpmMin: DEFAULTS.bpmMin,
    bpmMax: DEFAULTS.bpmMax,
  });
  /** @type {AnalyzerFrame[]} */
  const frames = [];
  for (let offset = 0; offset < audio.length; offset += chunk) {
    frames.push(...analyzer.push(audio.subarray(offset, offset + chunk)));
  }
  return frames;
}

/**
 * A fixture behind three seconds of room noise, the "lead-in" of ACCEPTANCE.
 *
 * @param {(sampleRate: number) => Float32Array} make Builds the fixture.
 * @param {number} sampleRate Sample rate in Hz.
 * @returns {Float32Array} Lead-in, then the fixture.
 */
const withLeadIn = (make, sampleRate) => concat(room(3, sampleRate), make(sampleRate));

/** Seconds of lead-in plus the seconds the tempo needs to settle. */
const SETTLED = 3 + 8;

describe('analyzer', () => {
  it('C15: the first frame comes after 1024 samples and one more every 512', () => {
    const analyzer = new Analyzer({ sampleRate: 48000, bpmMin: 95, bpmMax: 190 });
    assert.deepEqual(analyzer.push(new Float32Array(0)), []);
    assert.equal(analyzer.push(new Float32Array(1023)).length, 0);
    assert.equal(analyzer.push(new Float32Array(1)).length, 1);
    assert.equal(analyzer.push(new Float32Array(511)).length, 0);
    assert.equal(analyzer.push(new Float32Array(1)).length, 1);
    assert.equal(analyzer.push(new Float32Array(512 * 4)).length, 4);
  });

  it('C15: a frame is stamped with the seconds of audio it ends at', () => {
    const frames = analyze(silence(1, 48000), 48000);
    assert.equal(frames[0].time, 1024 / 48000);
    assert.equal(frames[1].time, 1536 / 48000);
    assert.equal(frames.length, Math.floor((48000 - 1024) / 512) + 1);
  });

  it('C15: any chunk size gives identical frames', () => {
    const audio = withLeadIn((rate) => drums(150, 9, rate), 48000);
    const expected = analyze(audio, 48000, audio.length);
    for (const chunk of [1, 128, 512, 1000, 4096, 44100]) {
      assert.deepEqual(analyze(audio, 48000, chunk), expected, `chunk ${chunk}`);
    }
  });

  it('C15: the level is the RMS of the hop in dBFS', () => {
    const quiet = analyze(silence(1, 48000), 48000);
    assert.ok(quiet.every((frame) => frame.levelDb === -120));
    const noise = analyze(room(2, 48000), 48000);
    for (const frame of noise) {
      assert.ok(Math.abs(frame.levelDb - -60) < 1.5, `${frame.levelDb}`);
    }
    const loud = analyze(drums(120, 8, 48000), 48000);
    const power =
      loud.reduce((total, frame) => total + 10 ** (frame.levelDb / 10), 0) / loud.length;
    assert.ok(Math.abs(10 * Math.log10(power) - -20) < 1, `${10 * Math.log10(power)}`);
  });

  it('C15: silence has no onsets and no tempo', () => {
    const frames = analyze(silence(20, 48000), 48000);
    assert.ok(frames.every((frame) => frame.flux === 0 && frame.tempo === null));
  });

  it('C15: no tempo appears before four seconds of audio have been heard', () => {
    const frames = analyze(drums(120, 8, 48000), 48000);
    assert.ok(frames.filter((frame) => frame.time < 4).every((frame) => frame.tempo === null));
    assert.ok(frames.some((frame) => frame.tempo !== null));
  });

  for (const rate of RATES) {
    for (const bpm of [100, 120, 160, 180]) {
      it(`C15: drums at ${bpm} bpm read within 3%, confidently and steadily, at ${rate} Hz`, () => {
        const frames = analyze(
          withLeadIn((r) => drums(bpm, 20, r), rate),
          rate,
        );
        const settled = frames.filter((frame) => frame.time >= SETTLED);
        assert.ok(settled.length > 100);
        for (const { tempo, time } of settled) {
          assert.ok(tempo !== null, `no tempo at ${time} s`);
          assert.ok(Math.abs(tempo.bpm - bpm) <= bpm * 0.03, `${tempo.bpm} at ${time} s`);
          assert.ok(tempo.confidence >= MIN_CONFIDENCE, `${tempo.confidence} at ${time} s`);
        }
      });
    }

    for (const bpm of [120, 180]) {
      it(`C15: drums over a clipped guitar bed at ${bpm} bpm read within 3% at ${rate} Hz`, () => {
        const frames = analyze(
          withLeadIn((r) => dense(bpm, 20, r), rate),
          rate,
        );
        for (const { tempo, time } of frames.filter((frame) => frame.time >= SETTLED)) {
          assert.ok(tempo !== null, `no tempo at ${time} s`);
          assert.ok(Math.abs(tempo.bpm - bpm) <= bpm * 0.03, `${tempo.bpm} at ${time} s`);
          assert.ok(tempo.confidence >= MIN_CONFIDENCE, `${tempo.confidence} at ${time} s`);
        }
      });
    }
  }

  it('C15: tempos outside the range fold by one octave: 200 to 100, 80 to 160', () => {
    for (const [bpm, folded] of [
      [200, 100],
      [80, 160],
    ]) {
      const frames = analyze(
        withLeadIn((r) => drums(bpm, 20, r), 48000),
        48000,
      );
      const { tempo } = frames.at(-1);
      assert.ok(
        tempo !== null && Math.abs(tempo.bpm - folded) <= folded * 0.03,
        `${bpm}: ${tempo?.bpm}`,
      );
    }
  });

  it('C15: the two sample rates agree on the tempo to within 1%', () => {
    const [high, low] = RATES.map(
      (rate) =>
        analyze(
          withLeadIn((r) => drums(140, 20, r), rate),
          rate,
        ).at(-1).tempo,
    );
    assert.ok(high !== null && low !== null);
    assert.ok(Math.abs(high.bpm - low.bpm) < 1.4, `${high.bpm} against ${low.bpm}`);
  });

  for (const [name, make] of [
    ['room noise', (/** @type {number} */ rate) => room(20, rate)],
    ['applause-like noise', (/** @type {number} */ rate) => applause(20, rate)],
    ['speech-like noise', (/** @type {number} */ rate) => speech(20, rate)],
  ]) {
    it(`C15: ${name} never reaches the tempo confidence threshold`, () => {
      for (const rate of RATES) {
        const frames = analyze(withLeadIn(make, rate), rate);
        for (const { tempo, time } of frames.filter((frame) => frame.time >= SETTLED)) {
          assert.ok(
            tempo === null || tempo.confidence < MIN_CONFIDENCE,
            `${tempo?.confidence} at ${time} s`,
          );
        }
      }
    });
  }
});
