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
import { Pipeline } from '../src/classify/pipeline.js';
import { DEFAULTS, parseConfig } from '../src/config.js';
import { concat, drums, room } from './helpers/synth.js';

const RATE = 44100;

/**
 * A pipeline with the default tuning, or an override of it.
 *
 * @param {Partial<Config>} [overrides] Values to change.
 * @returns {Pipeline} The pipeline.
 */
function pipeline(overrides = {}) {
  return new Pipeline({
    config: Object.freeze({ ...DEFAULTS, ...overrides }),
    sampleRate: RATE,
  });
}

/**
 * Feed hand-made frames, so the tempo rules are tested without synthesizing audio.
 *
 * @param {Pipeline} instance The pipeline.
 * @param {object} options Options.
 * @param {number} options.levelDb Level of every frame.
 * @param {number | null} options.bpm Tempo of every frame, or `null` for none.
 * @param {number} options.confidence Confidence of that tempo.
 * @param {number} options.ms How long to feed it.
 * @returns {PipelineEvent} The last event.
 */
function feed(instance, { levelDb, bpm, confidence, ms }) {
  /** @type {PipelineEvent} */
  let event;
  for (let elapsed = 0; elapsed < ms; elapsed += instance.hopMs) {
    event = instance.step({
      time: elapsed / 1000,
      levelDb,
      flux: 0,
      tempo: bpm === null ? null : { bpm, confidence },
    });
  }
  return event;
}

/** A level that is music-like, and one that is break-like. */
const LOUD = -20;
const QUIET = -80;

describe('pipeline', () => {
  it('C9: before any tempo is seen, the dance tempo is the default', () => {
    assert.equal(pipeline().danceBpm, DEFAULTS.defaultBpm);
    const quiet = feed(pipeline(), { levelDb: QUIET, bpm: null, confidence: 0, ms: 5000 });
    assert.equal(quiet.danceBpm, DEFAULTS.defaultBpm);
    assert.equal(quiet.locked, false);
  });

  it('C9: the default tempo is clamped into the configured range', () => {
    assert.equal(pipeline({ defaultBpm: 400, bpmMax: 150 }).danceBpm, 150);
    assert.equal(pipeline({ defaultBpm: 40, bpmMin: 100 }).danceBpm, 100);
  });

  it('C9: the first confident tempo of a music span is adopted at once', () => {
    const instance = pipeline();
    const event = feed(instance, { levelDb: LOUD, bpm: 178, confidence: 0.5, ms: 2000 });
    assert.equal(event.state, 'music');
    assert.equal(event.danceBpm, 178);
    assert.equal(event.locked, true);
  });

  it('C9: a tempo below the confidence threshold is ignored', () => {
    const event = feed(pipeline(), {
      levelDb: LOUD,
      bpm: 178,
      confidence: DEFAULTS.tempoMinConfidence - 0.01,
      ms: 5000,
    });
    assert.equal(event.state, 'music');
    assert.equal(event.danceBpm, DEFAULTS.defaultBpm);
    assert.equal(event.locked, false);
    assert.equal(event.bpm, 178, 'the raw reading is still reported');
    assert.ok(event.confidence > 0);
  });

  it('C9: a later change waits for bpmSettleMs, then follows', () => {
    const instance = pipeline();
    feed(instance, { levelDb: LOUD, bpm: 120, confidence: 0.6, ms: 2000 });
    assert.equal(instance.danceBpm, 120);

    const early = feed(instance, {
      levelDb: LOUD,
      bpm: 160,
      confidence: 0.6,
      ms: DEFAULTS.bpmSettleMs - 200,
    });
    assert.equal(early.danceBpm, 120, 'not yet');

    const late = feed(instance, { levelDb: LOUD, bpm: 160, confidence: 0.6, ms: 400 });
    assert.equal(late.danceBpm, 160);
  });

  it('C9: a change that does not hold leaves the dance tempo alone', () => {
    const instance = pipeline();
    feed(instance, { levelDb: LOUD, bpm: 120, confidence: 0.6, ms: 2000 });
    feed(instance, {
      levelDb: LOUD,
      bpm: 160,
      confidence: 0.6,
      ms: DEFAULTS.bpmSettleMs - 500,
    });
    const back = feed(instance, { levelDb: LOUD, bpm: 120, confidence: 0.6, ms: 1000 });
    assert.equal(back.danceBpm, 120);
  });

  it('C9: a reading within 3% is the same tempo, and does not restart the settle', () => {
    const instance = pipeline();
    feed(instance, { levelDb: LOUD, bpm: 120, confidence: 0.6, ms: 2000 });
    const jitter = feed(instance, { levelDb: LOUD, bpm: 123, confidence: 0.6, ms: 10000 });
    assert.equal(jitter.danceBpm, 120);
    assert.equal(instance.candidate, null);
  });

  it('C9: a change settles even when most hops carry no confident reading', () => {
    const instance = pipeline();
    feed(instance, { levelDb: LOUD, bpm: 120, confidence: 0.6, ms: 2000 });
    // One confident reading of 160 per second, as a real track gives.
    for (let second = 0; second < 5; second += 1) {
      feed(instance, { levelDb: LOUD, bpm: 160, confidence: 0.6, ms: instance.hopMs });
      feed(instance, { levelDb: LOUD, bpm: null, confidence: 0, ms: 1000 });
    }
    assert.equal(instance.danceBpm, 160);
  });

  it('C9: a flickering candidate never settles', () => {
    const instance = pipeline();
    feed(instance, { levelDb: LOUD, bpm: 120, confidence: 0.6, ms: 2000 });
    for (let round = 0; round < 6; round += 1) {
      feed(instance, { levelDb: LOUD, bpm: 160, confidence: 0.6, ms: 400 });
      feed(instance, { levelDb: LOUD, bpm: 190, confidence: 0.6, ms: 400 });
    }
    assert.equal(instance.danceBpm, 120);
  });

  it('C9: a break drops the pending change, and the next span adopts at once', () => {
    const instance = pipeline();
    feed(instance, { levelDb: LOUD, bpm: 120, confidence: 0.6, ms: 2000 });
    feed(instance, { levelDb: LOUD, bpm: 160, confidence: 0.6, ms: 1000 });
    const quiet = feed(instance, { levelDb: QUIET, bpm: null, confidence: 0, ms: 5000 });
    assert.equal(quiet.state, 'break');
    assert.equal(quiet.danceBpm, 120, 'the last dance tempo is kept through the break');
    assert.equal(instance.candidate, null);

    const next = feed(instance, { levelDb: LOUD, bpm: 190, confidence: 0.6, ms: 2000 });
    assert.equal(next.state, 'music');
    assert.equal(next.danceBpm, 190);
  });

  it('C9: while dancing the tempo stays a finite number inside the range', () => {
    const config = parseConfig('?bpmMin=100&bpmMax=180');
    const instance = new Pipeline({ config, sampleRate: RATE });
    for (const bpm of [100, 140, 180]) {
      const event = feed(instance, { levelDb: LOUD, bpm, confidence: 0.9, ms: 4000 });
      assert.ok(Number.isFinite(event.danceBpm));
      assert.ok(event.danceBpm >= config.bpmMin && event.danceBpm <= config.bpmMax);
    }
  });

  it('C9: real audio drives the whole pipeline: break, then music at the played tempo', () => {
    const instance = pipeline();
    const audio = concat(room(3, RATE), drums(160, 20, RATE));
    /** @type {PipelineEvent[]} */
    const events = [];
    for (let offset = 0; offset < audio.length; offset += 4096) {
      events.push(...instance.push(audio.subarray(offset, offset + 4096)));
    }
    assert.ok(events.length > 1000);
    assert.ok(events.slice(0, 100).every((event) => event.state === 'break'));
    const last = events.at(-1);
    assert.equal(last.state, 'music');
    assert.ok(Math.abs(last.danceBpm - 160) <= 160 * 0.03, `${last.danceBpm}`);
    assert.equal(last.locked, true);
  });

  it('C9: any chunk size gives identical events', () => {
    const audio = concat(room(2, RATE), drums(150, 8, RATE));
    /**
     * @param {number} chunk Samples per push.
     * @returns {PipelineEvent[]} The events.
     */
    const run = (chunk) => {
      const instance = pipeline();
      /** @type {PipelineEvent[]} */
      const events = [];
      for (let offset = 0; offset < audio.length; offset += chunk) {
        events.push(...instance.push(audio.subarray(offset, offset + chunk)));
      }
      return events;
    };
    const expected = run(audio.length);
    for (const chunk of [512, 4096]) {
      assert.deepEqual(run(chunk), expected, `chunk ${chunk}`);
    }
  });
});
