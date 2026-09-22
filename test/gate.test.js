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
 * @file The gate against what a room really contains (SPEC D7, ACCEPTANCE C21).
 * Until 2026-09-20 every negative the gate had met was synthetic noise, and it
 * answered yes to the first real room and the first real voice it heard: a room
 * rumbles, which is peaky and so "tonal", nearly all bass, and restless; a voice
 * is harmonic, bassy and lively. Neither has a pulse, and that is what is asked
 * now. The fixtures here are built to the measurements of those recordings,
 * since no audio may live in the repository.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Classifier } from '../src/classify/classifier.js';
import { Pipeline } from '../src/classify/pipeline.js';
import { DEFAULTS } from '../src/config.js';
import {
  band,
  concat,
  fan,
  phoneInRoom,
  room,
  rumble,
  scaleToDb,
  silence,
  voice,
} from './helpers/synth.js';

const RATE = 44100;

/**
 * Run audio through the pipeline under the defaults.
 *
 * @param {Float32Array} audio Mono samples.
 * @returns {{events: PipelineEvent[], changes: PipelineEvent[]}} Every event, and
 *   those where the state changed.
 */
function run(audio) {
  const pipeline = new Pipeline({ config: DEFAULTS, sampleRate: RATE });
  /** @type {PipelineEvent[]} */
  const events = [];
  for (let offset = 0; offset < audio.length; offset += 8192) {
    events.push(...pipeline.push(audio.subarray(offset, offset + 8192)));
  }
  const changes = events.filter(
    (event, index) => index > 0 && event.state !== events[index - 1].state,
  );
  return { events, changes };
}

/** What changed, for a failure message. */
const told = (/** @type {PipelineEvent[]} */ changes) =>
  changes.map((event) => `${event.state} at ${event.time.toFixed(1)} s`).join(', ');

/**
 * A frame that is loud and moving, with a tempo of the given confidence: the
 * level swells over 1.2 s, slower than the 400 ms the level peak looks back.
 *
 * @param {number} ms Milliseconds since the fixture began.
 * @param {number} confidence Tempo confidence of the frame.
 * @returns {AnalyzerFrame} The frame.
 */
function alive(ms, confidence) {
  return {
    time: ms / 1000,
    levelDb: -23 + 3 * Math.sin((2 * Math.PI * ms) / 1200),
    flux: 1,
    flatness: 0.2,
    bass: 0.5,
    tempo: { bpm: 170, confidence },
  };
}

describe('the pulse evidence', () => {
  it('C21: two confident seconds in eight are not a pulse', () => {
    // A median and not a mean. A room throws the odd second that looks
    // rhythmic, and a mean of 0.9, 0.9 and six times 0.05 is 0.26: over the
    // bar. The median of the same eight is 0.05.
    const classifier = new Classifier(DEFAULTS);
    for (let ms = 0; ms < 60000; ms += 10) {
      const second = Math.floor(ms / 1000) % 8;
      classifier.update(alive(ms, second < 2 ? 0.9 : 0.05), 10);
      assert.equal(classifier.state, 'break', `danced at ${ms} ms on two seconds in eight`);
    }
    assert.ok(classifier.pulse < DEFAULTS.pulseEnter, `evidence ${classifier.pulse}`);
  });

  it('C21: two empty seconds in eight do not end a song', () => {
    // The other half of the same choice: a song throws the odd empty second.
    const classifier = new Classifier(DEFAULTS);
    for (let ms = 0; ms < 60000; ms += 10) {
      const second = Math.floor(ms / 1000) % 8;
      classifier.update(alive(ms, second < 2 ? 0 : 0.3), 10);
    }
    assert.equal(classifier.state, 'music');
    assert.ok(classifier.pulse >= DEFAULTS.pulseEnter, `evidence ${classifier.pulse}`);
  });
});

describe('the gate, against a real room', () => {
  it('C21: a room that rumbles is not music', () => {
    // As it was recorded: the stream opens on a moment of digital silence, the
    // floor drops to its clamp, and everything after it is loud. The old gate
    // danced to this for 94% of the recording.
    const { changes } = run(concat(silence(1, RATE), rumble(120, RATE)));
    assert.deepEqual(changes, [], `danced to an empty room: ${told(changes)}`);
  });

  it('C21: a voice is not music', () => {
    // The old gate danced to 97% of a minute of talking, at any gain.
    const { changes } = run(concat(silence(1, RATE), voice(120, RATE)));
    assert.deepEqual(changes, [], `danced to talking: ${told(changes)}`);
  });

  for (const [name, make, slack] of [
    ['a band', () => band(170, 50, RATE), 0],
    // Through a phone its pulse hovers at the bar, as the real recording's does:
    // streaks of six seconds over it, not forty. It gets there; it takes longer.
    ['a band through a phone in a room', () => phoneInRoom(band(170, 50, RATE), RATE), 10],
  ]) {
    it(`C21: ${name} is recognised, late and for good`, () => {
      // Being sure is slow, and that is the owner's choice: default to break.
      // From a cold start the tempo is not believed for eight seconds, then
      // the pulse window has to fill with it, then it has to hold.
      const budget = 8 + DEFAULTS.pulseWindow + DEFAULTS.musicEnterMs / 1000 + 1 + slack;
      const { events, changes } = run(concat(room(3, RATE), make()));
      const entered = changes.find((event) => event.state === 'music');
      assert.ok(entered !== undefined, 'never recognised');
      assert.ok(
        entered.time <= budget,
        `recognised at ${entered.time.toFixed(1)} s; the budget from a cold start is ${budget} s`,
      );
      assert.deepEqual(told(changes.slice(1)), '', 'and then dropped');
      assert.equal(events.at(-1)?.state, 'music');
    });
  }

  it('C21: talking straight after a song does not keep him dancing', () => {
    // No silence between them, so the level never says the song is over. The
    // pulse does: it is gone, and after pulseLeaveMs of that so is he.
    const song = band(170, 40, RATE);
    const { changes } = run(concat(room(3, RATE), song, voice(50, RATE)));
    const left = changes.find((event) => event.state === 'break');
    const ended = 3 + 40;
    // The pulse has to drain out of three places in turn: the eight seconds of
    // onset envelope the tempo is read from, then more than half the pulse
    // window before its median turns, and then the patience itself.
    const budget = 8 + (DEFAULTS.pulseWindow / 2 + 1) + DEFAULTS.pulseLeaveMs / 1000 + 3;
    assert.ok(left !== undefined, 'still dancing to the talking');
    assert.ok(
      left.time > ended && left.time <= ended + budget,
      `left at ${left.time.toFixed(1)} s; the song ended at ${ended} and the budget is ${budget} s`,
    );
    assert.equal(changes.at(-1), left, 'and came back');
  });

  it('C21: the floor holds on the pulse evidence, not on the lower bar', () => {
    // Frames just under the bar, so the gate cannot take them, with a tempo
    // confidence held at one value. Between pulseLeave and pulseEnter the
    // floor goes on climbing at its pace: a fan with a wobble and laughter
    // over a rumble sit there, and held for them the floor never learned
    // them, they stayed audible for ever, and a fan was danced to for a
    // minute. At pulseEnter it stops.
    const climbOver = (/** @type {number} */ confidence) => {
      const classifier = new Classifier(DEFAULTS);
      // Twenty seconds for the warm-up and the median, then a fresh start
      // 11.9 dB under the level peak: inaudible, and room to climb 20 s.
      const faint = (/** @type {number} */ ms) => ({ ...alive(ms, confidence), levelDb: -43 });
      for (let ms = 0; ms < 20000; ms += 10) {
        classifier.update(faint(ms), 10);
      }
      classifier.floorDb = -43 - DEFAULTS.musicOverFloorDb + 0.1;
      for (let ms = 20000; ms < 40000; ms += 10) {
        classifier.update(faint(ms), 10);
        assert.equal(classifier.state, 'break', `danced at a confidence of ${confidence}`);
      }
      return classifier.floorDb - (-43 - DEFAULTS.musicOverFloorDb + 0.1);
    };
    const rise = DEFAULTS.floorRiseDbPerSec * 20;
    const under = climbOver(DEFAULTS.pulseEnter - 0.01);
    assert.ok(
      under >= rise - 0.5,
      `under the bar the floor climbed ${under.toFixed(1)} dB in 20 s`,
    );
    const over = climbOver(DEFAULTS.pulseEnter);
    assert.equal(over, 0, `at the bar the floor climbed ${over.toFixed(1)} dB in 20 s`);
  });

  it('C21: a fan with a wobble is still learned as the room', () => {
    // It moves, and its wobble scores a pulse median between pulseLeave and
    // pulseEnter, so nothing holds the floor for it: within a minute it is
    // under the bar, and the gate never takes it.
    const { events, changes } = run(fan(120, RATE));
    assert.deepEqual(changes, [], `danced to a fan: ${told(changes)}`);
    const last = /** @type {PipelineEvent} */ (events.at(-1));
    assert.ok(
      last.levelDb < last.floorDb + DEFAULTS.musicOverFloorDb,
      `the fan is still audible after two minutes: ${last.levelDb.toFixed(1)} over a floor of ${last.floorDb.toFixed(1)}`,
    );
    const learned = events.find(
      (event) => event.levelDb < event.floorDb + DEFAULTS.musicOverFloorDb,
    );
    assert.ok(learned !== undefined && learned.time <= 60, 'not learned within a minute');
  });

  it('C21: a song the floor has not believed yet is not learned as the room', () => {
    // A broadcast: talk over a bed, so the floor learns the bed, then a song
    // whose peaks sit 19 dB over it, steady, one 21 dB over it with 4 dB dips
    // every eight seconds, and one with 6 dB dips, which go under the bar,
    // where the swing cannot be read. The floor used to climb into the song at half
    // a decibel a second until the song was under the bar, from where nothing
    // recovers: the swing is unreadable below the bar, and unreadable counts
    // as still. Now the pulse evidence holds it, and the most it climbs is
    // the six seconds' worth before the evidence comes; under the bar, an
    // unreadable swing does not make a song still.
    // Two minutes of talk, so the floor has learned the bed at any rise rate.
    const talkS = 120;
    const songS = 90;
    const bed = scaleToDb(room(talkS, RATE), -44);
    const talk = scaleToDb(voice(talkS, RATE), -40).map((sample, index) => sample + bed[index]);
    for (const [db, depth, name] of /** @type {[number, number, string][]} */ ([
      [-34, 0, 'steady'],
      [-32, 0.37, 'with 4 dB dips'],
      [-32, 0.5, 'with 6 dB dips, under the bar in the dips'],
    ])) {
      const song = scaleToDb(band(150, songS, RATE), db).map(
        (sample, index) =>
          sample * (1 - depth * (0.5 + 0.5 * Math.sin((2 * Math.PI * index) / (RATE * 8)))),
      );
      const { events, changes } = run(concat(talk, song));
      const atStart = events.find((event) => event.time >= talkS);
      const atEnd = events.at(-1);
      assert.ok(atStart !== undefined && atEnd !== undefined);
      const climbed = atEnd.floorDb - atStart.floorDb;
      assert.ok(
        climbed <= 3.5,
        `${name}: the floor climbed from ${atStart.floorDb.toFixed(1)} by ${climbed.toFixed(1)} dB`,
      );
      const heard = changes.find((event) => event.state === 'music');
      assert.ok(heard !== undefined, `${name}: never heard as music`);
      assert.ok(
        heard.time - talkS <= 20,
        `${name}: heard at ${(heard.time - talkS).toFixed(1)} s into the song`,
      );
      const inSong = events.filter((event) => event.time >= talkS + 20);
      const music = inSong.filter((event) => event.state === 'music').length / inSong.length;
      assert.ok(
        music >= 0.75,
        `${name}: music for ${(100 * music).toFixed(0)}% of the song after 20 s`,
      );
    }
  });
});
