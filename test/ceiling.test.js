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
 * @file The floor ceiling in the pure core (SPEC S1, S2; ACCEPTANCE C24). The
 * slider on the page moves `floorMaxDb` while the audio runs, and the floor is
 * never above it: a ceiling moved under the floor takes the floor down at
 * once, whatever holds it, and that is what gives back a page gone deaf
 * (SPEC § 6).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Classifier } from '../src/classify/classifier.js';
import { Pipeline } from '../src/classify/pipeline.js';
import { configWith, DEFAULTS } from '../src/config.js';
import { drums, mulberry32, room, SEED, scaleToDb } from './helpers/synth.js';

/** Sample rate of the audio the pipeline test feeds, in hertz. */
const RATE = 44100;

/** Milliseconds each hand-made frame covers. */
const FRAME_MS = 10;

/**
 * A frame that is loud and moving, with a tempo of the given confidence: the
 * level swells between -26 and -20 dB over 1.2 s, slower than the 400 ms the
 * level peak looks back.
 *
 * @param {number} ms Milliseconds since the fixture began.
 * @param {number} confidence Tempo confidence of the frame.
 * @returns {AnalyzerFrame} The frame.
 */
function alive(ms, confidence) {
  return {
    time: ms / 1000,
    levelDb: -23 + 3 * Math.sin((2 * Math.PI * ms) / 1200),
    clipped: 0,
    flux: 1,
    flatness: 0.2,
    bass: 0.5,
    tempo: { bpm: 170, confidence },
  };
}

/**
 * A frame of a steady sound with no tempo, as a room is.
 *
 * @param {number} levelDb Its level.
 * @returns {AnalyzerFrame} The frame.
 */
function steady(levelDb) {
  return { time: 0, levelDb, clipped: 0, flux: 0, flatness: 1, bass: 0, tempo: null };
}

/**
 * The defaults with the ceiling somewhere else, the way the slider sets it.
 *
 * @param {number} floorMaxDb The ceiling, in dBFS.
 * @returns {Readonly<Config>} The configuration.
 */
const under = (floorMaxDb) => configWith({ floorMaxDb });

describe('the floor ceiling', () => {
  it('C24: a ceiling moved under the floor takes the floor to it before another frame', () => {
    const classifier = new Classifier(DEFAULTS);
    classifier.floorDb = -30;
    classifier.retune(under(-45));
    assert.equal(classifier.floorDb, -45);
    assert.equal(classifier.config.floorMaxDb, -45);
  });

  it('C24: it does so whatever holds the floor', () => {
    // Three holds, each reached through frames. A song under way, alone: one
    // taken at a confident pulse that has since sunk under `pulseLeave`, so
    // the audio no longer looks like music and the evidence holds nothing,
    // for the ten seconds `pulseLeaveMs` gives it before the song ends. The
    // pulse evidence alone, with the level under the bar. And audio that
    // looks like music but has not been taken for it yet, since entering
    // takes a minute here; in a break that needs the evidence too, so this
    // one cannot be had on its own. In each the floor stays put for another
    // frame, and the ceiling moves it all the same.
    const holds = [
      {
        name: 'a song under way, alone',
        config: DEFAULTS,
        until: 33000,
        frame: (/** @type {number} */ ms) => alive(ms, ms < 25000 ? 0.3 : 0.07),
        reached: (/** @type {Classifier} */ gate) =>
          gate.state === 'music' && !gate.musicLike && !gate.pulsing,
      },
      {
        name: 'the pulse evidence alone',
        config: DEFAULTS,
        until: 30000,
        frame: (/** @type {number} */ ms) => ({ ...alive(ms, 0.3), levelDb: -50 }),
        reached: (/** @type {Classifier} */ gate) =>
          gate.state === 'break' && !gate.musicLike && gate.pulsing && !gate.still,
      },
      {
        name: 'audio that looks like music',
        config: configWith({ musicEnterMs: 60000 }),
        until: 30000,
        frame: (/** @type {number} */ ms) => alive(ms, 0.3),
        reached: (/** @type {Classifier} */ gate) => gate.state === 'break' && gate.musicLike,
      },
    ];
    for (const { name, config, until, frame, reached } of holds) {
      const classifier = new Classifier(config);
      let ms = 0;
      for (; ms < until; ms += FRAME_MS) {
        classifier.update(frame(ms), FRAME_MS);
      }
      assert.ok(reached(classifier), `${name} was not reached`);
      const held = classifier.floorDb;
      assert.ok(held > -70, `${name}: the floor is already at ${held}`);
      classifier.update(frame(ms), FRAME_MS);
      assert.equal(classifier.floorDb, held, `${name} did not hold the floor`);
      classifier.retune(configWith({ ...config, floorMaxDb: -70 }));
      assert.equal(classifier.floorDb, -70, `${name} kept the floor over the ceiling`);
      classifier.update(frame(ms + FRAME_MS), FRAME_MS);
      assert.equal(classifier.floorDb, -70, `${name} took the floor back over the ceiling`);
    }
  });

  it('C24: a higher ceiling moves nothing at once, and the floor may climb to it', () => {
    const classifier = new Classifier(DEFAULTS);
    classifier.floorDb = -50;
    classifier.retune(under(-20));
    assert.equal(classifier.floorDb, -50, 'raising the ceiling moved the floor');
    const most = (DEFAULTS.floorRiseDbPerSec * FRAME_MS) / 1000;
    let before = classifier.floorDb;
    let highest = before;
    for (let ms = 0; ms < 90000; ms += FRAME_MS) {
      classifier.update(steady(-22), FRAME_MS);
      assert.ok(
        classifier.floorDb - before <= most + 1e-9,
        `the floor climbed ${(classifier.floorDb - before).toFixed(4)} dB in one frame`,
      );
      before = classifier.floorDb;
      highest = Math.max(highest, classifier.floorDb);
    }
    assert.ok(highest > -25, `the floor stopped at ${highest.toFixed(1)}, the old ceiling`);
    assert.equal(classifier.floorDb, -22, 'the floor did not reach the room under the new ceiling');
  });

  it('C24: a retune keeps the room, and a quieter room is still taken at once', () => {
    // A minute of a room at -40 dB, which the floor learns all the way; then
    // a ceiling under it, so that the retune does pull the floor down. A
    // retune that moved nothing would prove nothing about the room.
    const classifier = new Classifier(DEFAULTS);
    for (let ms = 0; ms < 60000; ms += FRAME_MS) {
      classifier.update(steady(-40), FRAME_MS);
    }
    assert.equal(classifier.floorDb, -40, 'the room was not learned');
    const heard = classifier.roomOf();
    const levels = [...classifier.roomLevels];
    classifier.retune(under(-45));
    assert.equal(classifier.floorDb, -45, 'the retune did not pull the floor down');
    assert.equal(classifier.roomOf(), heard, 'the room was forgotten');
    assert.equal(heard, -40);
    assert.deepEqual(classifier.roomLevels, levels);
    // The level peak looks back `levelWindowMs`, so the quieter room is heard
    // once the louder one has left it.
    for (let ms = 0; ms <= DEFAULTS.levelWindowMs; ms += FRAME_MS) {
      classifier.update(steady(-60), FRAME_MS);
    }
    assert.equal(classifier.floorDb, -60, 'a quieter room under the ceiling was not taken');
  });

  it('C24: a classifier built under a low ceiling starts at the ceiling', () => {
    // The floor starts at -60 dBFS, and is never above the ceiling.
    assert.equal(new Classifier(under(-70)).floorDb, -70);
    assert.equal(new Classifier(DEFAULTS).floorDb, -60);
  });

  it('C24: the floor is never over the ceiling in force, however it moves', () => {
    // Loud, restless frames a tenth of a second each, so the floor travels;
    // the ceiling jumps to anywhere in its range every fifty of them, and is
    // asked after every retune and every frame. Between two jumps the pulse
    // is strong enough to hold the floor or too faint to, a coin toss each
    // time, so the floor both holds and climbs.
    const rand = mulberry32(SEED);
    const classifier = new Classifier(DEFAULTS);
    let clamped = 0;
    let strong = false;
    for (let index = 0; index < 2000; index += 1) {
      if (index % 50 === 0) {
        const floor = classifier.floorDb;
        classifier.retune(under(-79 + Math.floor(rand() * 80)));
        clamped += classifier.floorDb < floor ? 1 : 0;
        assert.ok(classifier.floorDb <= classifier.config.floorMaxDb, `retune ${index / 50}`);
        strong = rand() < 0.5;
      }
      const confidence = strong ? 0.2 + rand() * 0.8 : rand() * 0.1;
      const tempo = rand() < 0.2 ? null : { bpm: 150, confidence };
      classifier.update(
        {
          time: index / 10,
          levelDb: -40 + rand() * 40,
          clipped: 0,
          flux: rand(),
          flatness: rand(),
          bass: rand(),
          tempo,
        },
        100,
      );
      assert.ok(
        classifier.floorDb <= classifier.config.floorMaxDb,
        `frame ${index}: floor ${classifier.floorDb} over ${classifier.config.floorMaxDb}`,
      );
    }
    assert.ok(clamped >= 5, `the ceiling pulled the floor down only ${clamped} times`);
  });

  it('C24: a pipeline passes a retune to its classifier', () => {
    const pipeline = new Pipeline({ config: DEFAULTS, sampleRate: RATE });
    const loud = pipeline.push(scaleToDb(room(60, RATE), -20));
    const floor = /** @type {PipelineEvent} */ (loud.at(-1)).floorDb;
    assert.ok(floor > -50, `a minute of -20 dB left the floor at ${floor.toFixed(1)}`);
    const lower = under(-50);
    pipeline.retune(lower);
    assert.equal(pipeline.config, lower);
    assert.equal(pipeline.gate.config, lower);
    const after = pipeline.push(scaleToDb(room(10, RATE), -20));
    assert.ok(after.length > 0);
    assert.equal(after[0].floorDb, -50);
    assert.ok(
      after.every((event) => event.floorDb <= -50),
      `a floor over the ceiling: ${Math.max(...after.map((event) => event.floorDb))}`,
    );
  });
  it('C24: a retune changes the ceiling and nothing else: a song under way goes on at its tempo', () => {
    // Drums at 120 bpm until they are danced to at a locked tempo, then the
    // ceiling pulled under the floor mid-song, the song going on without a
    // seam. The retune reaches the floor and only the floor: the song is not
    // dropped, and its tempo is not forgotten.
    const song = drums(120, 35, RATE);
    const pipeline = new Pipeline({ config: DEFAULTS, sampleRate: RATE });
    const before = /** @type {PipelineEvent} */ (pipeline.push(song.subarray(0, 25 * RATE)).at(-1));
    assert.equal(before.state, 'music', 'the drums were not taken');
    assert.ok(before.locked, 'no tempo was locked');
    assert.ok(before.floorDb > -70, `the floor is already at ${before.floorDb}`);
    pipeline.retune(under(-70));
    const after = pipeline.push(song.subarray(25 * RATE));
    assert.ok(after.length > 0);
    assert.equal(after[0].floorDb, -70);
    for (const event of after) {
      assert.equal(event.state, 'music', `dropped at ${event.time.toFixed(2)} s`);
      assert.ok(event.locked, `the tempo was forgotten at ${event.time.toFixed(2)} s`);
      assert.ok(
        Math.abs(event.danceBpm - 120) <= 120 * 0.03,
        `danced at ${event.danceBpm} at ${event.time.toFixed(2)} s`,
      );
    }
  });

  it('C24: a retune changes the ceiling and the floor, and nothing else the classifier holds', () => {
    // No clock, no window, no room. Two moments with the gate's clocks
    // running: a song being entered, its entry clock part full under an entry
    // of a minute; and a song being left, the sound gone and the pulse faint,
    // both leave clocks counting. A retune that restarted a clock would let a
    // hand dragging the slider through a rescue keep putting the song off,
    // and one nudging it after the music stopped keep them dancing to nothing.
    const moments = [
      {
        name: 'a song being entered',
        config: configWith({ musicEnterMs: 60000 }),
        until: 20000,
        frame: (/** @type {number} */ ms) => alive(ms, 0.3),
        running: (/** @type {Classifier} */ gate) => gate.state === 'break' && gate.heldMs > 0,
      },
      {
        name: 'a song being left',
        config: DEFAULTS,
        until: 32000,
        frame: (/** @type {number} */ ms) => {
          if (ms < 25000) {
            return alive(ms, 0.3);
          }
          return ms < 31000 ? alive(ms, 0.07) : { ...alive(ms, 0.07), levelDb: -120 };
        },
        running: (/** @type {Classifier} */ gate) =>
          gate.state === 'music' && gate.faintMs > 0 && gate.quietMs > 0,
      },
    ];
    /**
     * Everything a classifier holds but its configuration and its floor,
     * which a retune is there to change.
     *
     * @param {Classifier} gate The classifier.
     * @returns {object} A deep copy of the rest.
     */
    const rest = (gate) => structuredClone({ ...gate, config: null, floorDb: null });
    for (const { name, config, until, frame, running } of moments) {
      const classifier = new Classifier(config);
      for (let ms = 0; ms < until; ms += FRAME_MS) {
        classifier.update(frame(ms), FRAME_MS);
      }
      assert.ok(running(classifier), `${name} was not reached`);
      assert.ok(classifier.floorDb > -70, `${name}: the floor is already at ${classifier.floorDb}`);
      const before = rest(classifier);
      classifier.retune(configWith({ ...config, floorMaxDb: -70 }));
      assert.equal(classifier.floorDb, -70, name);
      assert.deepEqual(rest(classifier), before, `${name}: the retune touched more than the floor`);
    }
  });

  it('C24: a retune changes the configuration, and nothing else the pipeline holds', () => {
    // The tempo follower with a change under way: 120 bpm locked, then 160
    // for a second and a half, pending. The lock, the tempo danced to, the
    // pending change and its clock are where they were after a retune, and
    // the analyzer and the gate are the same objects. A follower told that a
    // song had just begun would take the next stray estimate for its tempo at
    // once, and one that dropped the pending change would take it late.
    const pipeline = new Pipeline({ config: DEFAULTS, sampleRate: RATE });
    let ms = 0;
    /**
     * Feed hand-made frames at a tempo, confident enough to be followed.
     *
     * @param {number} bpm The tempo they carry.
     * @param {number} until Milliseconds since the start to feed up to.
     * @returns {void}
     */
    const feed = (bpm, until) => {
      for (; ms < until; ms += pipeline.hopMs) {
        pipeline.step({ ...alive(ms, 0.3), tempo: { bpm, confidence: 0.3 } });
      }
    };
    feed(120, 25000);
    feed(160, 26500);
    assert.equal(pipeline.gate.state, 'music');
    assert.equal(pipeline.danceBpm, 120);
    assert.ok(pipeline.locked && !pipeline.spanFresh, 'no tempo locked');
    assert.ok(pipeline.candidate === 160 && pipeline.candidateMs > 1000, 'no change under way');
    const { analyzer, gate } = pipeline;
    /**
     * Everything a pipeline holds but its configuration, which a retune is
     * there to change, and the objects it is made of, compared by identity.
     *
     * @returns {object} A deep copy of the rest.
     */
    const rest = () => structuredClone({ ...pipeline, config: null, analyzer: null, gate: null });
    const before = rest();
    pipeline.retune(under(-70));
    assert.deepEqual(rest(), before, 'the retune touched the tempo follower');
    assert.equal(pipeline.analyzer, analyzer);
    assert.equal(pipeline.gate, gate);
  });
});

describe('a page gone deaf', () => {
  /**
   * The page the slider is for (SPEC § 6). A song loud enough to hear whose
   * pulse is too faint to hold the floor, for a hundred seconds: the floor
   * climbs into it and sits at its ceiling, -25, with the song 5 dB over it
   * and under the bar. Then the song's pulse comes, and holds the floor there.
   *
   * @returns {{classifier: Classifier, ms: number}} The classifier, and the
   *   time the fixture has reached.
   */
  const deafen = () => {
    const classifier = new Classifier(DEFAULTS);
    let ms = 0;
    for (; ms < 100000; ms += FRAME_MS) {
      classifier.update(alive(ms, 0.05), FRAME_MS);
    }
    assert.equal(classifier.floorDb, -25, 'the floor did not climb to its ceiling');
    assert.equal(classifier.state, 'break');
    return { classifier, ms };
  };

  it('C24: left alone, the page stays deaf', () => {
    const { classifier, ms: from } = deafen();
    for (let ms = from; ms < from + 60000; ms += FRAME_MS) {
      classifier.update(alive(ms, 0.3), FRAME_MS);
      assert.equal(classifier.state, 'break', `heard at ${ms} ms`);
      assert.equal(classifier.floorDb, -25, `the floor moved at ${ms} ms`);
    }
    assert.ok(classifier.pulsing, 'the pulse never came');
  });

  it('C24: the ceiling moved down while the pulse holds the floor, the song is taken', () => {
    const { classifier, ms: from } = deafen();
    let ms = from;
    for (; !classifier.pulsing; ms += FRAME_MS) {
      assert.ok(ms < from + 20000, 'the pulse never came');
      classifier.update(alive(ms, 0.3), FRAME_MS);
    }
    const held = classifier.floorDb;
    classifier.update(alive(ms, 0.3), FRAME_MS);
    ms += FRAME_MS;
    assert.equal(classifier.floorDb, held, 'the pulse did not hold the floor');
    const movedAt = ms;
    classifier.retune(under(-45));
    assert.equal(classifier.floorDb, -45);
    // A frame is taken at the end of the audio it covers, so that is when the
    // song is taken, and what is held to the budget.
    while (classifier.state !== 'music') {
      classifier.update(alive(ms, 0.3), FRAME_MS);
      ms += FRAME_MS;
      assert.ok(
        ms - movedAt <= DEFAULTS.musicEnterMs + 1000,
        `not taken ${ms - movedAt} ms after the ceiling moved`,
      );
    }
  });
});
