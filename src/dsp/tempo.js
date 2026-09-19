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
 * @file Tempo from an onset envelope (SPEC D7): normalized autocorrelation of
 * the envelope, scored at a candidate period and its multiples (a real beat
 * repeats at 2, 3, and 4 periods too), which resolves half-time and
 * double-time confusion inside the allowed range. A hop is about 11 ms, so a
 * beat period is rarely a whole number of hops: the onsets are widened a
 * little and candidate periods are scanned in quarter-hop steps, otherwise
 * whole-hop multiples drift off the real harmonics and favor false periods.
 * Pure: no browser API (SPEC invariant 4).
 */

/** Weight of the autocorrelation at 1, 2, 3, and 4 times a candidate period. */
const HARMONIC_WEIGHTS = [1, 0.6, 0.4, 0.3];

/** Sum of {@link HARMONIC_WEIGHTS}, which scales a score into 0 to 1. */
const WEIGHT_SUM = HARMONIC_WEIGHTS.reduce((total, weight) => total + weight, 0);

/** Half-width of the moving average that is subtracted from the envelope, in seconds. */
const LOCAL_MEAN_SECONDS = 0.25;

/** Weights of the smoothing kernel that widens each onset over five hops. */
const SMOOTHING_KERNEL = [1, 2, 3, 2, 1];

/** Step of the candidate period scan, in hops. */
const LAG_STEP = 0.25;

/**
 * How large the peaks must be against the envelope itself before a tempo is
 * reported. A steady sound has a nearly constant envelope, which correlates
 * perfectly with itself at every lag and would otherwise yield a confident
 * tempo out of rounding noise.
 */
const MIN_PEAK_RATIO = 0.05;

/**
 * Keep what stands out from its surroundings: subtract a centered moving
 * average, rectify, widen each onset a little, and remove the mean.
 *
 * @param {ArrayLike<number>} envelope Onset strength per hop.
 * @param {number} rate Envelope rate in Hz.
 * @returns {Float64Array} The zero-mean peaks.
 */
function emphasizePeaks(envelope, rate) {
  const count = envelope.length;
  const half = Math.max(1, Math.round(rate * LOCAL_MEAN_SECONDS));
  const prefix = new Float64Array(count + 1);
  for (let index = 0; index < count; index += 1) {
    prefix[index + 1] = prefix[index] + envelope[index];
  }
  const peaks = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const low = Math.max(0, index - half);
    const high = Math.min(count, index + half + 1);
    peaks[index] = Math.max(0, envelope[index] - (prefix[high] - prefix[low]) / (high - low));
  }
  const reach = (SMOOTHING_KERNEL.length - 1) / 2;
  const kernelSum = SMOOTHING_KERNEL.reduce((total, weight) => total + weight, 0);
  const widened = new Float64Array(count);
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    let sum = 0;
    for (let tap = 0; tap < SMOOTHING_KERNEL.length; tap += 1) {
      const source = index + tap - reach;
      if (source >= 0 && source < count) {
        sum += SMOOTHING_KERNEL[tap] * peaks[source];
      }
    }
    widened[index] = sum / kernelSum;
    total += widened[index];
  }
  const mean = total / count;
  for (let index = 0; index < count; index += 1) {
    widened[index] -= mean;
  }
  return widened;
}

/**
 * Estimate the tempo of an onset envelope.
 *
 * @param {ArrayLike<number>} envelope Onset strength per hop, oldest first.
 * @param {number} rate Envelope rate in Hz (hops per second).
 * @param {{bpmMin: number, bpmMax: number}} range Allowed tempo range in beats per minute.
 * @returns {TempoEstimate | null} The estimate, or `null` when the envelope is
 *   too short to hold the slowest period four times, or is too flat to carry a
 *   rhythm.
 */
export function estimateTempo(envelope, rate, { bpmMin, bpmMax }) {
  const lagMin = Math.max(1, (60 * rate) / bpmMax);
  const lagMax = (60 * rate) / bpmMin;
  const maxLag = Math.ceil(lagMax) * HARMONIC_WEIGHTS.length + 1;
  const count = envelope.length;
  if (count <= maxLag + Math.ceil(lagMax) || lagMax <= lagMin) {
    return null;
  }
  const peaks = emphasizePeaks(envelope, rate);
  let variance = 0;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    variance += peaks[index] * peaks[index];
    total += envelope[index];
  }
  variance /= count;
  if (variance < 1e-12 || Math.sqrt(variance) < (MIN_PEAK_RATIO * total) / count) {
    return null;
  }

  // Normalized autocorrelation, corrected for the shrinking overlap at long lags.
  const correlation = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index + lag < count; index += 1) {
      sum += peaks[index] * peaks[index + lag];
    }
    correlation[lag] = sum / (count - lag) / variance;
  }
  const at = (/** @type {number} */ lag) => {
    const whole = Math.floor(lag);
    const fraction = lag - whole;
    return correlation[whole] * (1 - fraction) + correlation[whole + 1] * fraction;
  };

  // Score every candidate period with its multiples and keep the best.
  const steps = Math.floor((lagMax - lagMin) / LAG_STEP) + 1;
  const scores = new Float64Array(steps);
  let best = 0;
  for (let step = 0; step < steps; step += 1) {
    const lag = lagMin + step * LAG_STEP;
    let score = 0;
    for (let harmonic = 0; harmonic < HARMONIC_WEIGHTS.length; harmonic += 1) {
      score += HARMONIC_WEIGHTS[harmonic] * at(lag * (harmonic + 1));
    }
    scores[step] = score / WEIGHT_SUM;
    if (scores[step] > scores[best]) {
      best = step;
    }
  }

  // Refine below the scan step with a parabola through the best score and its neighbors.
  let offset = 0;
  if (best > 0 && best < steps - 1) {
    const curvature = scores[best - 1] - 2 * scores[best] + scores[best + 1];
    if (curvature < 0) {
      offset = (0.5 * (scores[best - 1] - scores[best + 1])) / curvature;
    }
  }
  const period = lagMin + (best + offset) * LAG_STEP;
  return {
    bpm: (60 * rate) / period,
    confidence: Math.min(1, Math.max(0, scores[best])),
  };
}
