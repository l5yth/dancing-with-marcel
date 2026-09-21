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
 * @file Seeded synthetic audio fixtures, defined by the recipes in ACCEPTANCE
 * Layer C. No audio file is ever committed (SPEC invariant 6); tests generate
 * these in code. Every fixture takes an optional random source so the same seed
 * always yields the same samples.
 */

/** Seed of every fixture (ACCEPTANCE Conventions). */
export const SEED = 0xc0ffee;

/**
 * A small seeded random number generator.
 *
 * @param {number} seed Any 32-bit integer.
 * @returns {() => number} Returns numbers in `[0, 1)`.
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Root-mean-square of a buffer.
 *
 * @param {Float32Array} buffer Samples.
 * @returns {number} The RMS, 0 for an empty buffer.
 */
export function rms(buffer) {
  let sum = 0;
  for (const sample of buffer) {
    sum += sample * sample;
  }
  return buffer.length === 0 ? 0 : Math.sqrt(sum / buffer.length);
}

/**
 * Scale a buffer to a target RMS level. Silence stays silence.
 *
 * @param {Float32Array} buffer Samples.
 * @param {number} db Target RMS in dBFS.
 * @returns {Float32Array} A scaled copy.
 */
export function scaleToDb(buffer, db) {
  const level = rms(buffer);
  const gain = level === 0 ? 0 : 10 ** (db / 20) / level;
  return buffer.map((sample) => sample * gain);
}

/**
 * White noise in `[-1, 1)`.
 *
 * @param {number} length Number of samples.
 * @param {() => number} rand Random source.
 * @returns {Float32Array} The noise.
 */
function noise(length, rand) {
  return Float32Array.from({ length }, () => rand() * 2 - 1);
}

/**
 * One-pole low-pass filter.
 *
 * @param {Float32Array} input Samples.
 * @param {number} cutoffHz Cutoff in Hz.
 * @param {number} sampleRate Sample rate in Hz.
 * @returns {Float32Array} The filtered copy.
 */
function lowpass(input, cutoffHz, sampleRate) {
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  const output = new Float32Array(input.length);
  let state = 0;
  for (let index = 0; index < input.length; index += 1) {
    state += alpha * (input[index] - state);
    output[index] = state;
  }
  return output;
}

/**
 * One-pole high-pass filter.
 *
 * @param {Float32Array} input Samples.
 * @param {number} cutoffHz Cutoff in Hz.
 * @param {number} sampleRate Sample rate in Hz.
 * @returns {Float32Array} The filtered copy.
 */
function highpass(input, cutoffHz, sampleRate) {
  const low = lowpass(input, cutoffHz, sampleRate);
  return input.map((sample, index) => sample - low[index]);
}

/**
 * A burst that decays exponentially.
 *
 * @param {number} seconds Burst length.
 * @param {number} tau Decay time constant in seconds.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {(index: number) => number} source Value before the decay envelope.
 * @returns {Float32Array} The burst.
 */
function burst(seconds, tau, sampleRate, source) {
  return Float32Array.from(
    { length: Math.round(seconds * sampleRate) },
    (_, index) => Math.exp(-index / (tau * sampleRate)) * source(index),
  );
}

/**
 * Exact zeros.
 *
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @returns {Float32Array} Silence.
 */
export function silence(seconds, sampleRate) {
  return new Float32Array(Math.round(seconds * sampleRate));
}

/**
 * A real room, as one was recorded: not hiss but rumble. Seven tenths of the
 * energy sits under 200 Hz, the level wanders by several decibels, and now and
 * then something thumps. At -48 dBFS RMS, which is a laptop microphone at a
 * sane gain. Its spectrum is peaky, so it reads as tonal; it is nearly all
 * bass; and it moves. It has no pulse.
 *
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The room.
 */
export function rumble(seconds, sampleRate, rand = mulberry32(SEED)) {
  const length = Math.round(seconds * sampleRate);
  const low = lowpass(lowpass(noise(length, rand), 160, sampleRate), 160, sampleRate);
  const mid = lowpass(noise(length, rand), 900, sampleRate);
  const out = new Float32Array(length);
  // The level wanders: a random walk in decibels, a new target every 0.4 to 1.6 s.
  let gainDb = 0;
  let target = 0;
  let until = 0;
  for (let index = 0; index < length; index += 1) {
    if (index >= until) {
      target = (rand() * 2 - 1) * 5;
      until = index + Math.round((1.5 + 4 * rand()) * sampleRate);
    }
    gainDb += (target - gainDb) / (1.2 * sampleRate);
    out[index] =
      (low[index] * 3 + mid[index] * 0.25 + (rand() * 2 - 1) * 0.02) * 10 ** (gainDb / 20);
  }
  // Something thumps, at no particular time: a door, a desk, a footstep.
  for (let at = 0; at < length; at += Math.round((4 + 14 * rand()) * sampleRate)) {
    const size = 0.3 + 0.7 * rand();
    for (let index = 0; index < 0.25 * sampleRate && at + index < length; index += 1) {
      out[at + index] +=
        size *
        Math.sin((2 * Math.PI * 70 * index) / sampleRate) *
        Math.exp(-index / (0.05 * sampleRate));
    }
  }
  return scaleToDb(out, -48);
}

/**
 * A real voice, as one was recorded: voiced syllables, which are harmonic and so
 * read as tonal, most of their energy in the first few harmonics and so nearly
 * all bass, at four or five a second but never evenly, in phrases with pauses
 * between them. At -30 dBFS RMS. It replaced a fixture of filtered-noise bursts
 * on a near-regular grid, which was flatter than any voice and more rhythmic
 * than one: about as rhythmic as a real song through a phone speaker, so no
 * gate that asks about pulse could tell the two apart, and reality won.
 *
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The voice.
 */
export function voice(seconds, sampleRate, rand = mulberry32(SEED)) {
  const length = Math.round(seconds * sampleRate);
  const out = new Float32Array(length);
  let position = Math.round(0.3 * sampleRate);
  while (position < length) {
    // A phrase of three to nine syllables, then a breath.
    const syllables = 3 + Math.floor(rand() * 7);
    for (let count = 0; count < syllables && position < length; count += 1) {
      const span = Math.round((0.07 + 0.38 * rand() * rand()) * sampleRate);
      const pitch = 105 + 80 * rand();
      const glide = 1 + (rand() * 2 - 1) * 0.12;
      const formant = 400 + 900 * rand();
      const loud = 0.12 + 0.88 * rand() * rand();
      let phase = 0;
      for (let index = 0; index < span && position + index < length; index += 1) {
        const t = index / span;
        phase += (2 * Math.PI * pitch * (1 + (glide - 1) * t)) / sampleRate;
        let sample = 0;
        for (let harmonic = 1; harmonic <= 24; harmonic += 1) {
          const hertz = pitch * harmonic;
          const shape = 1 / harmonic + 0.6 * Math.exp(-(((hertz - formant) / 250) ** 2));
          sample += shape * Math.sin(harmonic * phase);
        }
        const envelope = Math.sin(Math.PI * t) ** 0.7;
        out[position + index] += loud * envelope * sample;
      }
      position += span + Math.round((0.01 + (rand() < 0.2 ? 0.5 : 0.1) * rand()) * sampleRate);
    }
    position += Math.round((0.35 + 0.9 * rand()) * sampleRate);
  }
  for (let index = 0; index < length; index += 1) {
    out[index] += (rand() * 2 - 1) * 0.004;
  }
  return scaleToDb(out, -30);
}

/**
 * A quiet room: hiss at -74 dBFS RMS, low enough that the learned floor sinks
 * to its clamp. This is a calm flat at night, not the -60 dBFS of `room`.
 *
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The quiet room.
 */
export function quietRoom(seconds, sampleRate, rand = mulberry32(SEED)) {
  return scaleToDb(noise(Math.round(seconds * sampleRate), rand), -74);
}

/**
 * Mains hum at about -50 dBFS: 50 Hz with its octave, over a little hiss. It is
 * what a calm room actually contains, a fridge or a fan or a laptop, and it is
 * loud against a sunken floor, very tonal, and all bass.
 *
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The hum.
 */
export function hum(seconds, sampleRate, rand = mulberry32(SEED)) {
  const length = Math.round(seconds * sampleRate);
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    out[index] =
      0.003 * Math.sin(2 * Math.PI * 50 * t) +
      0.0015 * Math.sin(2 * Math.PI * 100 * t) +
      (rand() * 2 - 1) * 0.0003;
  }
  return out;
}

/**
 * A band rather than a drum machine, at -20 dBFS RMS: the same kit as `drums`,
 * but played by a person. Every hit lands a few milliseconds off the grid and
 * at its own strength, there is a fill at the end of every fourth bar, a
 * sustained chord sits under it, and a voice throws bursts wherever it likes.
 * The onset envelope of a drum machine correlates with itself almost
 * perfectly; this one does it about as well as a record does, which is the
 * point: a tempo threshold tuned on `drums` has never met music.
 *
 * @param {number} bpm Beats per minute.
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The band.
 */
export function band(bpm, seconds, sampleRate, rand = mulberry32(SEED)) {
  const length = Math.round(seconds * sampleRate);
  const mix = new Float32Array(length);
  const beat = (60 / bpm) * sampleRate;
  const add = (
    /** @type {number} */ start,
    /** @type {Float32Array} */ hit,
    /** @type {number} */ gain,
  ) => {
    for (let index = 0; index < hit.length && start + index < length; index += 1) {
      if (start + index >= 0) {
        mix[start + index] += gain * hit[index];
      }
    }
  };
  /** A hit lands up to 20 ms early or late, as hands do. */
  const loose = () => Math.round((rand() * 2 - 1) * 0.02 * sampleRate);
  const kick = burst(0.08, 0.025, sampleRate, (index) =>
    Math.sin((2 * Math.PI * 60 * index) / sampleRate),
  );
  const snare = () => {
    const grit = highpass(noise(Math.round(0.12 * sampleRate), rand), 200, sampleRate);
    return burst(0.12, 0.03, sampleRate, (index) => 0.8 * grit[index]);
  };
  for (let count = 0; Math.round(count * beat) < length; count += 1) {
    const start = Math.round(count * beat);
    add(start + loose(), count % 2 === 0 ? kick : snare(), 0.55 + 0.45 * rand());
    // The fill: sixteenths through the last beat of every fourth bar.
    if (count % 16 === 15) {
      for (const step of [0.25, 0.5, 0.75]) {
        add(Math.round(start + step * beat) + loose(), snare(), 0.5 + 0.4 * rand());
      }
    }
  }
  // The chord under it: three partials, so there is something tonal to hear.
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    mix[index] +=
      0.05 * Math.sin(2 * Math.PI * 196 * t) +
      0.04 * Math.sin(2 * Math.PI * 247 * t) +
      0.03 * Math.sin(2 * Math.PI * 294 * t);
  }
  // The voice: bursts at no particular time, about eight a second, and as
  // loud as the kit, because on a punk record it is.
  for (let at = 0; at < length; at += Math.round((0.04 + 0.17 * rand()) * sampleRate)) {
    const pitch = 300 + 500 * rand();
    add(
      at,
      burst(0.09, 0.03, sampleRate, (index) =>
        Math.sin((2 * Math.PI * pitch * index) / sampleRate),
      ),
      0.6 + 0.6 * rand(),
    );
  }
  return scaleToDb(mix, -20);
}

/**
 * A brick-wall limiter: clip at `ceiling` times the RMS, then bring the result
 * back to -20 dBFS. At 1.0 the peaks of every hit are gone and what is left
 * moves about a quarter of a decibel, which is what a PA with a hard limiter on
 * it sends into the room.
 *
 * @param {Float32Array} audio The clean source.
 * @param {number} ceiling Where to clip, as a multiple of the RMS level.
 * @returns {Float32Array} The limited audio.
 */
export function limited(audio, ceiling) {
  const limit = ceiling * rms(audio);
  return scaleToDb(
    audio.map((sample) => Math.max(-limit, Math.min(limit, sample))),
    -20,
  );
}

/**
 * Pass audio through a phone speaker in a room and into a laptop microphone:
 * no low end, two early reflections, a long way down, and the room on top.
 * Real music reaches the classifier like this, never as a clean file.
 *
 * @param {Float32Array} audio The clean source.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} What the microphone hears.
 */
export function phoneInRoom(audio, sampleRate, rand = mulberry32(SEED)) {
  // One-pole high-pass at 500 Hz: a phone speaker has nothing below it.
  const alpha = 1 / (1 + (2 * Math.PI * 500) / sampleRate);
  const high = new Float32Array(audio.length);
  for (let index = 1; index < audio.length; index += 1) {
    high[index] = alpha * (high[index - 1] + audio[index] - audio[index - 1]);
  }
  // Two early reflections smear every onset, as a wall and a desk do.
  const taps = [
    [Math.round(0.04 * sampleRate), 0.4],
    [Math.round(0.07 * sampleRate), 0.25],
  ];
  const heard = new Float32Array(audio.length);
  for (let index = 0; index < audio.length; index += 1) {
    let sample = high[index];
    for (const [delay, gain] of taps) {
      if (index >= delay) {
        sample += gain * high[index - delay];
      }
    }
    heard[index] = sample;
  }
  const quiet = scaleToDb(heard, -42);
  return quiet.map((sample) => sample + (rand() * 2 - 1) * 0.0008);
}

/**
 * White noise at -60 dBFS RMS: the room before the music.
 *
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The room.
 */
export function room(seconds, sampleRate, rand = mulberry32(SEED)) {
  return scaleToDb(noise(Math.round(seconds * sampleRate), rand), -60);
}

/**
 * A drum loop at -20 dBFS RMS. Kick on beats 1 and 3, snare on beats 2 and 4,
 * a hat on every eighth note.
 *
 * @param {number} bpm Beats per minute.
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The loop.
 */
export function drums(bpm, seconds, sampleRate, rand = mulberry32(SEED)) {
  const length = Math.round(seconds * sampleRate);
  const mix = new Float32Array(length);
  const beat = (60 / bpm) * sampleRate;
  const add = (/** @type {number} */ start, /** @type {Float32Array} */ hit) => {
    for (let index = 0; index < hit.length && start + index < length; index += 1) {
      mix[start + index] += hit[index];
    }
  };
  const kick = burst(0.08, 0.025, sampleRate, (index) =>
    Math.sin((2 * Math.PI * 60 * index) / sampleRate),
  );
  for (let count = 0; Math.round(count * beat) < length; count += 1) {
    const start = Math.round(count * beat);
    if (count % 2 === 0) {
      add(start, kick);
    } else {
      const grit = highpass(noise(Math.round(0.12 * sampleRate), rand), 200, sampleRate);
      add(
        start,
        burst(0.12, 0.03, sampleRate, (index) => 0.8 * grit[index]),
      );
    }
    for (const offset of [0, beat / 2]) {
      const sizzle = highpass(noise(Math.round(0.01 * sampleRate), rand), 6000, sampleRate);
      add(
        Math.round(start + offset),
        burst(0.01, 0.004, sampleRate, (index) => 0.4 * sizzle[index]),
      );
    }
  }
  return scaleToDb(mix, -20);
}

/**
 * A drum loop over a clipped guitar bed, at -20 dBFS RMS in total: a harmonic
 * stack on 82 Hz and 110 Hz, hard-clipped, at -24 dBFS before summing.
 *
 * @param {number} bpm Beats per minute.
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The loop over the bed.
 */
export function dense(bpm, seconds, sampleRate, rand = mulberry32(SEED)) {
  const length = Math.round(seconds * sampleRate);
  const stack = Float32Array.from({ length }, (_, index) => {
    let sum = 0;
    for (const base of [82, 110]) {
      for (let harmonic = 1; harmonic <= 8; harmonic += 1) {
        sum += Math.sin((2 * Math.PI * base * harmonic * index) / sampleRate) / harmonic;
      }
    }
    return sum;
  });
  const peak = stack.reduce((top, sample) => Math.max(top, Math.abs(sample)), 0);
  const clipped = stack.map((sample) => Math.max(-0.5, Math.min(0.5, sample / peak)));
  const bed = scaleToDb(clipped, -24);
  const loop = drums(bpm, seconds, sampleRate, rand);
  return scaleToDb(
    loop.map((sample, index) => sample + bed[index]),
    -20,
  );
}

/**
 * Applause-like noise at -20 dBFS RMS: white noise under seeded Poisson
 * clicks, 25 per second on average, each decaying in 8 ms.
 *
 * @param {number} seconds Duration.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {() => number} [rand] Random source.
 * @returns {Float32Array} The applause.
 */
export function applause(seconds, sampleRate, rand = mulberry32(SEED)) {
  const output = new Float32Array(Math.round(seconds * sampleRate));
  const decay = Math.exp(-1 / (0.008 * sampleRate));
  let envelope = 0;
  for (let index = 0; index < output.length; index += 1) {
    envelope = envelope * decay + (rand() < 25 / sampleRate ? 1 : 0);
    output[index] = (rand() * 2 - 1) * envelope;
  }
  return scaleToDb(output, -20);
}

/**
 * Join buffers end to end.
 *
 * @param {...Float32Array} buffers Buffers to join.
 * @returns {Float32Array} One buffer.
 */
export function concat(...buffers) {
  const joined = new Float32Array(buffers.reduce((total, buffer) => total + buffer.length, 0));
  let offset = 0;
  for (const buffer of buffers) {
    joined.set(buffer, offset);
    offset += buffer.length;
  }
  return joined;
}
