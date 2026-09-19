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
 * @file Radix-2 fast Fourier transform (SPEC D7): own implementation, no
 * dependency. Pure: no browser API (SPEC invariant 4).
 */

/**
 * Reverse the lowest `bits` bits of a number.
 *
 * @param {number} value The number.
 * @param {number} bits How many low bits to reverse.
 * @returns {number} The number with those bits in reverse order.
 */
function reverseBits(value, bits) {
  let result = 0;
  for (let bit = 0; bit < bits; bit += 1) {
    result = (result << 1) | ((value >> bit) & 1);
  }
  return result;
}

/** In-place forward FFT of a fixed power-of-two size. */
export class Fft {
  /**
   * Prepare the twiddle factors and the bit-reversal table.
   *
   * @param {number} size Transform length: a power of two, at least 2.
   * @throws {RangeError} When `size` is not a power of two of at least 2.
   */
  constructor(size) {
    if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
      throw new RangeError(`FFT size must be a power of two of at least 2, got ${size}`);
    }
    /**
     * Transform length.
     * @type {number}
     */
    this.size = size;
    const bits = Math.log2(size);
    /**
     * Cosine of the twiddle angles, one per half-size index.
     * @type {Float64Array}
     */
    this.cos = Float64Array.from({ length: size / 2 }, (_, index) =>
      Math.cos((2 * Math.PI * index) / size),
    );
    /**
     * Negative sine of the twiddle angles (forward transform), one per half-size index.
     * @type {Float64Array}
     */
    this.sin = Float64Array.from(
      { length: size / 2 },
      (_, index) => -Math.sin((2 * Math.PI * index) / size),
    );
    /**
     * Bit-reversed index of every position.
     * @type {Uint32Array}
     */
    this.reverse = Uint32Array.from({ length: size }, (_, index) => reverseBits(index, bits));
  }

  /**
   * Transform in place: `re` and `im` hold the input and are overwritten with
   * the spectrum, bin `k` at index `k`.
   *
   * @param {Float64Array} re Real parts, length `size`.
   * @param {Float64Array} im Imaginary parts, length `size`.
   * @returns {void}
   */
  transform(re, im) {
    const { size, cos, sin, reverse } = this;
    for (let index = 0; index < size; index += 1) {
      const partner = reverse[index];
      if (partner > index) {
        [re[index], re[partner]] = [re[partner], re[index]];
        [im[index], im[partner]] = [im[partner], im[index]];
      }
    }
    for (let half = 1; half < size; half *= 2) {
      const step = size / (half * 2);
      for (let start = 0; start < size; start += half * 2) {
        for (let offset = 0; offset < half; offset += 1) {
          const wr = cos[offset * step];
          const wi = sin[offset * step];
          const upper = start + offset;
          const lower = upper + half;
          const tr = re[lower] * wr - im[lower] * wi;
          const ti = re[lower] * wi + im[lower] * wr;
          re[lower] = re[upper] - tr;
          im[lower] = im[upper] - ti;
          re[upper] += tr;
          im[upper] += ti;
        }
      }
    }
  }
}
