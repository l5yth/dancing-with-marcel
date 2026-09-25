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
 * @file Samples in, decisions out: the analyzer feeds the state gate, and the
 * dance tempo follows the detected tempo (SPEC D3, D7). One pipeline serves the
 * page and the offline eval, so a threshold tuned in the eval means the same
 * thing live. Pure: no browser API, no wall clock (SPEC invariant 4).
 */

import { Analyzer } from '../dsp/analyzer.js';
import { Classifier } from './classifier.js';

/** Samples between two analysis frames; matches the analyzer's hop. */
const HOP = 512;

/** How far two tempo readings may sit apart and still count as the same tempo. */
const SAME_BPM_TOLERANCE = 0.03;

/**
 * Whether two tempos are the same within {@link SAME_BPM_TOLERANCE}.
 *
 * @param {number} one A tempo in beats per minute.
 * @param {number} other Another tempo in beats per minute.
 * @returns {boolean} `true` when they are within tolerance.
 */
function sameBpm(one, other) {
  return Math.abs(one - other) <= other * SAME_BPM_TOLERANCE;
}

/** Turns a stream of samples into per-hop decisions. */
export class Pipeline {
  /**
   * Create a pipeline in the `break` state, with the dance tempo at
   * `defaultBpm` clamped into the configured range.
   *
   * @param {{config: Readonly<Config>, sampleRate: number}} options Tuning and sample rate.
   */
  constructor({ config, sampleRate }) {
    /**
     * Active configuration.
     * @type {Readonly<Config>}
     */
    this.config = config;
    /**
     * Level, onset strength, and tempo per hop.
     * @type {Analyzer}
     */
    this.analyzer = new Analyzer({
      sampleRate,
      bpmMin: config.bpmMin,
      bpmMax: config.bpmMax,
    });
    /**
     * Break or music, with hysteresis.
     * @type {Classifier}
     */
    this.gate = new Classifier(config);
    /**
     * Milliseconds of audio one hop covers.
     * @type {number}
     */
    this.hopMs = (HOP / sampleRate) * 1000;
    /**
     * Tempo the punks dance at, in beats per minute.
     * @type {number}
     */
    this.danceBpm = Math.min(Math.max(config.defaultBpm, config.bpmMin), config.bpmMax);
    /**
     * Whether a confident tempo has ever been adopted.
     * @type {boolean}
     */
    this.locked = false;
    /**
     * Whether the current music span is still waiting for its first tempo.
     * @type {boolean}
     */
    this.spanFresh = true;
    /**
     * Tempo waiting to be adopted, or `null` when none is.
     * @type {number | null}
     */
    this.candidate = null;
    /**
     * How long the candidate has held, in milliseconds.
     * @type {number}
     */
    this.candidateMs = 0;
  }

  /**
   * Take a new configuration while the audio runs, for the floor ceiling
   * slider (SPEC S1, S2): the gate takes it at once, and so does the tempo
   * follower, hop by hop. The analyzer keeps the tempo range it was built
   * with, which the slider does not touch.
   *
   * @param {Readonly<Config>} config The configuration from now on.
   * @returns {void}
   */
  retune(config) {
    this.config = config;
    this.gate.retune(config);
  }

  /**
   * Feed samples and collect the decisions they complete. Any chunk size gives
   * the same decisions.
   *
   * @param {Float32Array} samples Mono samples at the pipeline's sample rate.
   * @returns {PipelineEvent[]} One event per completed hop, oldest first.
   */
  push(samples) {
    return this.analyzer.push(samples).map((frame) => this.step(frame));
  }

  /**
   * Turn one analysis frame into a decision.
   *
   * @param {AnalyzerFrame} frame What the analyzer measured.
   * @returns {PipelineEvent} The decision.
   */
  step(frame) {
    const state = this.gate.update(frame, this.hopMs);
    const confident =
      frame.tempo !== null && frame.tempo.confidence >= this.config.tempoMinConfidence;
    this.trackTempo(state, confident ? frame.tempo : null);
    return {
      time: frame.time,
      levelDb: this.gate.levelDb ?? frame.levelDb,
      clipped: frame.clipped,
      floorDb: this.gate.floorDb,
      flatness: this.gate.flatness,
      bass: this.gate.bass,
      swing: this.gate.swing,
      pulse: this.gate.pulse,
      state,
      bpm: frame.tempo?.bpm ?? null,
      confidence: frame.tempo?.confidence ?? 0,
      danceBpm: this.danceBpm,
      locked: this.locked,
    };
  }

  /**
   * Follow the tempo with the settle rule of SPEC D3: the first confident
   * tempo of a music span is adopted at once, a later change must hold for
   * `bpmSettleMs` before it counts, and a break drops the pending change.
   *
   * @param {State} state The state of this hop.
   * @param {TempoEstimate | null} tempo Confident tempo, or `null`.
   * @returns {void}
   */
  trackTempo(state, tempo) {
    if (state !== 'music') {
      this.spanFresh = true;
      this.candidate = null;
      this.candidateMs = 0;
      return;
    }
    // A candidate ages over every hop of music, not only over the hops that
    // carry a confident reading: on real tracks most do not, and a candidate
    // that only aged on those would never settle.
    if (this.candidate !== null) {
      this.candidateMs += this.hopMs;
    }
    if (tempo === null) {
      return;
    }
    if (this.spanFresh) {
      this.adopt(tempo.bpm);
      return;
    }
    if (sameBpm(tempo.bpm, this.danceBpm)) {
      this.candidate = null;
      this.candidateMs = 0;
      return;
    }
    if (this.candidate === null || !sameBpm(tempo.bpm, this.candidate)) {
      this.candidate = tempo.bpm;
      this.candidateMs = 0;
      return;
    }
    if (this.candidateMs >= this.config.bpmSettleMs) {
      this.adopt(tempo.bpm);
    }
  }

  /**
   * Dance at a tempo from now on.
   *
   * @param {number} bpm The tempo in beats per minute.
   * @returns {void}
   */
  adopt(bpm) {
    this.danceBpm = bpm;
    this.locked = true;
    this.spanFresh = false;
    this.candidate = null;
    this.candidateMs = 0;
  }
}
