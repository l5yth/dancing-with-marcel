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
 * @file The analysis pipeline (SPEC D7): level, onset strength, and tempo for
 * every 512-sample hop of a mono stream. Framing depends only on the count of
 * samples, never on how they arrive, so live capture, unit tests, and the
 * offline eval produce identical frames from identical audio. Pure: no browser
 * API, no wall clock (SPEC invariant 4).
 */

import { rmsDb } from './level.js';
import { SpectrumFeatures } from './spectrum.js';
import { estimateTempo } from './tempo.js';

/** Samples between two analysis frames. */
const HOP = 512;

/** Samples in one analysis window. */
const WINDOW = 1024;

/** Seconds of onset envelope the tempo estimate looks at. */
const ENVELOPE_SECONDS = 8;

/** Seconds of onset envelope needed before the first tempo estimate. */
const MIN_ENVELOPE_SECONDS = 4;

/** Seconds between two tempo estimates. */
const TEMPO_EVERY_SECONDS = 1;

/** Turns a stream of samples into analysis frames. */
export class Analyzer {
  /**
   * Create an analyzer with no audio seen yet.
   *
   * @param {AnalyzerOptions} options Sample rate and tempo range.
   */
  constructor({ sampleRate, bpmMin, bpmMax }) {
    /**
     * Sample rate in Hz.
     * @type {number}
     */
    this.sampleRate = sampleRate;
    /**
     * Allowed tempo range in beats per minute.
     * @type {{bpmMin: number, bpmMax: number}}
     */
    this.range = { bpmMin, bpmMax };
    /**
     * Hops per second, which is also the rate of the onset envelope.
     * @type {number}
     */
    this.envelopeRate = sampleRate / HOP;
    /**
     * Spectral features of each frame.
     * @type {SpectrumFeatures}
     */
    this.spectrum = new SpectrumFeatures({ windowSize: WINDOW, sampleRate });
    /**
     * The last window of samples, as a ring.
     * @type {Float32Array}
     */
    this.ring = new Float32Array(WINDOW);
    /**
     * Next write position in the ring.
     * @type {number}
     */
    this.write = 0;
    /**
     * Samples seen so far.
     * @type {number}
     */
    this.total = 0;
    /**
     * The most recent onset strengths, oldest first, at most eight seconds.
     * @type {number[]}
     */
    this.envelope = [];
    /**
     * Frames since the last tempo estimate.
     * @type {number}
     */
    this.sinceTempo = 0;
    /**
     * Latest tempo estimate, or `null` while there is none.
     * @type {TempoEstimate | null}
     */
    this.tempo = null;
  }

  /**
   * Feed samples and collect the frames they complete. Any chunk size gives
   * the same frames.
   *
   * @param {Float32Array} samples Mono samples.
   * @returns {AnalyzerFrame[]} One frame per completed hop, oldest first.
   */
  push(samples) {
    /** @type {AnalyzerFrame[]} */
    const frames = [];
    for (const sample of samples) {
      this.ring[this.write] = sample;
      this.write = (this.write + 1) % WINDOW;
      this.total += 1;
      if (this.total >= WINDOW && (this.total - WINDOW) % HOP === 0) {
        frames.push(this.completeFrame());
      }
    }
    return frames;
  }

  /**
   * Analyze the window that has just filled.
   *
   * @returns {AnalyzerFrame} The frame.
   */
  completeFrame() {
    const samples = new Float32Array(WINDOW);
    samples.set(this.ring.subarray(this.write), 0);
    samples.set(this.ring.subarray(0, this.write), WINDOW - this.write);
    const { flux, flatness, bass } = this.spectrum.next(samples);
    this.envelope.push(flux);
    if (this.envelope.length > ENVELOPE_SECONDS * this.envelopeRate) {
      this.envelope.shift();
    }
    this.sinceTempo += 1;
    if (
      this.sinceTempo >= TEMPO_EVERY_SECONDS * this.envelopeRate &&
      this.envelope.length >= MIN_ENVELOPE_SECONDS * this.envelopeRate
    ) {
      this.sinceTempo = 0;
      this.tempo = estimateTempo(this.envelope, this.envelopeRate, this.range);
    }
    return {
      time: this.total / this.sampleRate,
      levelDb: rmsDb(samples.subarray(WINDOW - HOP)),
      flux,
      flatness,
      bass,
      tempo: this.tempo,
    };
  }
}
