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
 * @file Per-frame spectral features (SPEC D7). Three numbers come off one FFT:
 *
 * - **flux**, the onset strength: the positive change of the log-compressed
 *   spectrum since the previous frame. A drum hit adds energy at once and
 *   spikes it; a steady tone or a fading sound does not. The change is averaged
 *   inside octave-wide bands and then across bands, so a kick in the lowest
 *   octave counts as much as a hat in the highest, instead of being drowned by
 *   the hundreds of high-frequency bins.
 * - **flatness**, how noise-like the frame is: the geometric mean of the
 *   magnitudes over their arithmetic mean, 0 for a pure tone and 1 for white
 *   noise. Applause and hiss are flat; music has peaks.
 * - **bass**, the share of the energy below {@link BASS_HZ}. A band over a PA
 *   has a kick and a bass guitar; talking and clapping do not.
 *
 * Pure: no browser API (SPEC invariant 4).
 */

import { Fft } from './fft.js';

/** Number of octave-wide bands between the lowest and the highest counted frequency. */
const BAND_COUNT = 8;

/** Frequency below which energy counts as bass, in Hz. */
export const BASS_HZ = 200;

/** Floor under a magnitude before its logarithm is taken, so silence stays finite. */
const TINY = 1e-12;

/**
 * Periodic Hann window.
 *
 * @param {number} size Window length.
 * @returns {Float64Array} The window: 0 at index 0, 1 at index `size / 2`.
 */
export function hannWindow(size) {
  return Float64Array.from(
    { length: size },
    (_, index) => 0.5 * (1 - Math.cos((2 * Math.PI * index) / size)),
  );
}

/**
 * @typedef {object} SpectrumOptions
 * @property {number} windowSize FFT length and frame length in samples; a power of two.
 * @property {number} sampleRate Sample rate in Hz.
 * @property {number} [minHz] Lowest frequency that counts, in Hz.
 * @property {number} [maxHz] Highest frequency that counts, in Hz.
 * @property {number} [gamma] Log compression strength; larger reacts to quieter components.
 */

/** Computes the spectral features of consecutive frames. */
export class SpectrumFeatures {
  /**
   * Prepare the window, the FFT, and the frequency ranges.
   *
   * @param {SpectrumOptions} options Frame size, sample rate, and tuning.
   */
  constructor({ windowSize, sampleRate, minHz = 30, maxHz = 8000, gamma = 1000 }) {
    /**
     * FFT of the frame length.
     * @type {Fft}
     */
    this.fft = new Fft(windowSize);
    /**
     * Hann taper applied to each frame.
     * @type {Float64Array}
     */
    this.taper = hannWindow(windowSize);
    /**
     * Sum of the taper, which turns a bin magnitude into an amplitude.
     * @type {number}
     */
    this.taperSum = this.taper.reduce((total, value) => total + value, 0);
    /**
     * First FFT bin that counts (DC is never included).
     * @type {number}
     */
    this.firstBin = Math.max(1, Math.ceil((minHz * windowSize) / sampleRate));
    /**
     * Last FFT bin that counts.
     * @type {number}
     */
    this.lastBin = Math.min(windowSize / 2, Math.floor((maxHz * windowSize) / sampleRate));
    /**
     * Last FFT bin that counts as bass.
     * @type {number}
     */
    this.bassBin = Math.min(this.lastBin, Math.floor((BASS_HZ * windowSize) / sampleRate));
    /**
     * First bin of every band, plus one past the last bin at the end. Bands
     * are log-spaced and never empty.
     * @type {number[]}
     */
    this.edges = [this.firstBin];
    for (let band = 1; band < BAND_COUNT; band += 1) {
      const hertz = minHz * (maxHz / minHz) ** (band / BAND_COUNT);
      const edge = Math.max(this.edges[band - 1] + 1, Math.ceil((hertz * windowSize) / sampleRate));
      this.edges.push(Math.min(edge, this.lastBin));
    }
    this.edges.push(this.lastBin + 1);
    /**
     * Log compression strength.
     * @type {number}
     */
    this.gamma = gamma;
    /**
     * Real parts of the FFT workspace.
     * @type {Float64Array}
     */
    this.re = new Float64Array(windowSize);
    /**
     * Imaginary parts of the FFT workspace.
     * @type {Float64Array}
     */
    this.im = new Float64Array(windowSize);
    /**
     * Log magnitudes of the previous frame.
     * @type {Float64Array}
     */
    this.previous = new Float64Array(this.lastBin - this.firstBin + 1);
    /**
     * Log magnitudes of the frame being processed.
     * @type {Float64Array}
     */
    this.current = new Float64Array(this.previous.length);
    /**
     * Whether a previous frame exists to compare with.
     * @type {boolean}
     */
    this.hasPrevious = false;
  }

  /**
   * Features of the next frame. The first frame has nothing to compare with
   * and its flux reads 0.
   *
   * @param {Float32Array} frame The samples, `windowSize` of them.
   * @returns {SpectrumFrame} What the frame looks like.
   */
  next(frame) {
    const { re, im, taper, taperSum, firstBin, lastBin, bassBin, gamma, current, previous, edges } =
      this;
    for (let index = 0; index < re.length; index += 1) {
      re[index] = frame[index] * taper[index];
      im[index] = 0;
    }
    this.fft.transform(re, im);

    let sum = 0;
    let logSum = 0;
    let bassPower = 0;
    let totalPower = 0;
    for (let bin = firstBin; bin <= lastBin; bin += 1) {
      const magnitude = Math.hypot(re[bin], im[bin]) / taperSum;
      current[bin - firstBin] = Math.log1p(gamma * magnitude);
      sum += magnitude;
      logSum += Math.log(magnitude + TINY);
      const power = magnitude * magnitude;
      totalPower += power;
      if (bin <= bassBin) {
        bassPower += power;
      }
    }
    const bins = lastBin - firstBin + 1;
    const arithmetic = sum / bins;
    const geometric = Math.exp(logSum / bins);

    let flux = 0;
    if (this.hasPrevious) {
      for (let band = 0; band < BAND_COUNT; band += 1) {
        let rise = 0;
        for (let bin = edges[band]; bin < edges[band + 1]; bin += 1) {
          rise += Math.max(0, current[bin - firstBin] - previous[bin - firstBin]);
        }
        flux += rise / (edges[band + 1] - edges[band]);
      }
      flux /= BAND_COUNT;
    }
    this.current = previous;
    this.previous = current;
    this.hasPrevious = true;
    return {
      flux,
      flatness: arithmetic < TINY ? 1 : Math.min(1, geometric / arithmetic),
      bass: totalPower < TINY ? 0 : bassPower / totalPower,
    };
  }
}
