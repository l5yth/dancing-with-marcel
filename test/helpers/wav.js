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
 * @file Raw audio encoders for tests: a 16-bit WAV file for ffmpeg to read
 * back, and the little-endian float bytes ffmpeg would write out. Test-only;
 * no audio file is ever committed (SPEC invariant 6).
 */

/**
 * Encode mono samples as a 16-bit PCM WAV file.
 *
 * @param {Float32Array} samples Mono samples in -1 to 1.
 * @param {number} sampleRate Sample rate in Hz.
 * @returns {Buffer} The file.
 */
export function wavBytes(samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    data.writeInt16LE(Math.round(clamped * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // size of this chunk
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per frame
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * The little-endian float bytes of some samples, as ffmpeg writes `f32le`.
 *
 * @param {Float32Array} samples Mono samples.
 * @returns {Buffer} The bytes.
 */
export function floatBytes(samples) {
  const bytes = Buffer.alloc(samples.length * 4);
  for (let index = 0; index < samples.length; index += 1) {
    bytes.writeFloatLE(samples[index], index * 4);
  }
  return bytes;
}
