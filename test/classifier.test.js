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
import {
  Classifier,
  FLOOR_MAX_DB,
  FLOOR_MIN_DB,
  FLOOR_START_DB,
} from '../src/classify/classifier.js';
import { debugLabel } from '../src/classify/label.js';
import { Pipeline } from '../src/classify/pipeline.js';
import { DEFAULTS } from '../src/config.js';
import {
  applause,
  band,
  concat,
  dense,
  drums,
  hum,
  limited,
  phoneInRoom,
  quietRoom,
  room,
  scaleToDb,
  silence,
  voice,
} from './helpers/synth.js';

const RATE = 44100;

/**
 * Run audio through a pipeline and collect what it decided.
 *
 * @param {Float32Array} audio Mono samples.
 * @param {object} [options] Options.
 * @param {number} [options.chunk] Samples per push.
 * @param {number} [options.sampleRate] Sample rate in Hz.
 * @param {Partial<Config>} [options.config] Tuning overrides.
 * @returns {{events: PipelineEvent[], changes: PipelineEvent[], labels: string[]}}
 *   Every event, the events where the state changed, and the label of each event.
 */
function run(audio, { chunk = 8192, sampleRate = RATE, config = {} } = {}) {
  const pipeline = new Pipeline({
    config: Object.freeze({ ...DEFAULTS, ...config }),
    sampleRate,
  });
  /** @type {PipelineEvent[]} */
  const events = [];
  for (let offset = 0; offset < audio.length; offset += chunk) {
    events.push(...pipeline.push(audio.subarray(offset, offset + chunk)));
  }
  const changes = events.filter(
    (event, index) => index > 0 && event.state !== events[index - 1].state,
  );
  const labels = events.map((event) =>
    debugLabel(event.state, event.locked ? event.danceBpm : null),
  );
  return { events, changes, labels };
}

/**
 * The defaults with the swing and the pulse questions switched off. For unit
 * tests that feed hand-made frames at a constant level in order to examine the
 * level thresholds alone: under the defaults such frames are never music. The fixtures
 * that run real audio through the pipeline keep the defaults.
 */
const STILL = Object.freeze({ ...DEFAULTS, minLevelSwingDb: 0, pulseEnter: 0, pulseLeave: 0 });

/**
 * Seconds from a cold start within which a strong source is recognised: the
 * eight seconds in which the tempo is not yet believed, the pulse window, the
 * hold, and one to spare. Being sure is slow; that is the contract now.
 */
const ENTRY_S = 8 + DEFAULTS.pulseWindow + DEFAULTS.musicEnterMs / 1000 + 1;

/**
 * The defaults with the pulse question switched off, for hand-made frames that
 * carry no tempo and are about something else: the floor, or the swing.
 */
const PULSELESS = Object.freeze({ ...DEFAULTS, pulseEnter: 0, pulseLeave: 0 });

/** Three seconds of room noise, the lead-in of every music fixture. */
const leadIn = (/** @type {number} */ rate = RATE) => room(3, rate);

/** Seconds of lead-in before a fixture starts. */
const LEAD = 3;

/**
 * A frame that answers yes to every question: loud, tonal, pulsing, and with a
 * level that swells over 1.2 s. Slower than the 400 ms the level peak looks
 * back, because anything faster is flattened into a constant and does not move.
 *
 * @param {number} ms Milliseconds since the fixture began.
 * @returns {AnalyzerFrame} The frame.
 */
function lively(ms) {
  return {
    time: ms / 1000,
    levelDb: -23 + 3 * Math.sin((2 * Math.PI * ms) / 1200),
    flux: 1,
    flatness: 0.2,
    bass: 0.5,
    tempo: null,
  };
}

describe('a stop inside a song', () => {
  for (const [name, make, gap] of [
    ['drums at 120', (/** @type {number} */ s) => drums(120, s, RATE), 1.5],
    ['drums over a guitar bed at 180', (/** @type {number} */ s) => dense(180, s, RATE), 1.9],
    ['a band at 170', (/** @type {number} */ s) => band(170, s, RATE), 1.9],
  ]) {
    it(`C7: a stop of ${gap} s in ${name} is not a break`, () => {
      // Shorter than breakHoldMs, so SPEC D2 says he keeps dancing. The fourth
      // question broke that: it reads nothing until half its window is
      // audible again, which kept the answer at no for 0.7 s after the band
      // came back, and a stop of 1.5 s ended in a break 0.35 s into the music.
      // While a song is playing, a window too empty to read is not evidence
      // of stillness.
      assert.ok(gap * 1000 < DEFAULTS.breakHoldMs);
      const audio = make(30);
      audio.fill(0, 15 * RATE, Math.round((15 + gap) * RATE));
      const { changes } = run(concat(leadIn(), audio));
      assert.deepEqual(
        changes.map((event) => event.state),
        ['music'],
        changes.map((event) => `${event.state} at ${event.time.toFixed(2)} s`).join(', '),
      );
    });
  }
});

describe('a calm room', () => {
  it('C20: a hum in a quiet room is not music, however far the floor has sunk', () => {
    // In a calm flat the learned floor sinks to its clamp, and then anything
    // audible at all is sixteen decibels over it. A fridge or a fan is also
    // very tonal and all bass, so it answered yes to all three questions and
    // Marcel danced to it within a second. What it does not do is move.
    const { events, changes } = run(concat(quietRoom(20, RATE), hum(30, RATE)));
    const onset = events.filter((event) => event.time > 20.2 && event.time < 21.2);
    assert.ok(onset.length > 50);
    assert.ok(
      onset.every((event) => event.levelDb > event.floorDb + DEFAULTS.musicOverFloorDb),
      'the hum is not loud against the floor as it starts, so the fixture proves nothing',
    );
    // A sound that starts is not a sound that moves: the two hops straddling
    // its onset must not hold the swing over the bar for long enough to count.
    const moving = events.filter(
      (event) => event.time > 20 && event.swing >= DEFAULTS.minLevelSwingDb,
    );
    assert.ok(
      moving.length * (512 / RATE) * 1000 < DEFAULTS.musicEnterMs / 2,
      `the onset of the hum read as movement for ${moving.length} hops`,
    );
    // And the floor goes to meet it, at the pace it now keeps, instead of
    // sitting at its clamp: slow enough not to swallow a song before the gate
    // is sure of it, so half a decibel a second and not three.
    const before = /** @type {PipelineEvent} */ (events.find((event) => event.time > 20));
    const last = /** @type {PipelineEvent} */ (events.at(-1));
    const learned = DEFAULTS.floorRiseDbPerSec * 25;
    assert.ok(
      last.floorDb >= before.floorDb + learned && last.floorDb <= last.levelDb,
      `after thirty seconds of hum the floor went from ${before.floorDb.toFixed(1)} to ${last.floorDb.toFixed(1)}`,
    );
    assert.deepEqual(
      changes.map((event) => `${event.state} at ${event.time.toFixed(1)} s`),
      [],
      'he danced to the fridge',
    );
  });

  it('C20: the level of music moves and the level of a machine does not', () => {
    // The fourth question, measured rather than assumed: the swing is the
    // spread of the audible level over the timbre window.
    const swingOf = (/** @type {Float32Array} */ audio) => {
      const swings = run(audio)
        .events.filter((event) => event.time > 8)
        .map((event) => event.swing)
        .sort((a, b) => a - b);
      return { low: swings[Math.floor(swings.length * 0.1)], high: swings.at(-1) };
    };
    const machine = swingOf(concat(quietRoom(4, RATE), hum(20, RATE)));
    const music = swingOf(concat(leadIn(), phoneInRoom(band(140, 20, RATE), RATE)));
    assert.ok(
      machine.high < DEFAULTS.minLevelSwingDb,
      `a hum in full flow swings ${machine.high?.toFixed(2)} dB, over the ${DEFAULTS.minLevelSwingDb} dB bar`,
    );
    assert.ok(
      music.low >= DEFAULTS.minLevelSwingDb,
      `a band through a phone swings only ${music.low?.toFixed(2)} dB in its calmest tenth`,
    );
  });

  it('C20: a sound that has only just started never looks like music', () => {
    // The benefit of the doubt belongs to a song already playing. At the door
    // it would be the hum's way in: for the first half window after any sound
    // starts there is nothing to read a spread from, and a steady one answers
    // yes to everything else.
    const classifier = new Classifier(PULSELESS);
    for (let ms = 0; ms < 5000; ms += 10) {
      classifier.update(
        { time: ms / 1000, levelDb: -20, flux: 1, flatness: 0.2, bass: 0.5, tempo: null },
        10,
      );
      assert.equal(classifier.musicLike, false, `looked like music ${ms} ms after it started`);
    }
    assert.equal(classifier.state, 'break');
  });

  it('C20: the floor holds still from the moment the audio looks like music', () => {
    // Tried the other way on 2026-09-20 and withdrawn the same day: a floor that
    // kept learning until the state turned chased every song through its own
    // entry and lifted the bar out from under the quiet ones. With four
    // questions, all of them saying yes is evidence enough to stop learning.
    // A long entry time, so there is room to look like music for seconds
    // without being declared music.
    const classifier = new Classifier(Object.freeze({ ...PULSELESS, musicEnterMs: 60000 }));
    let ms = 0;
    for (; !classifier.musicLike; ms += 10) {
      assert.ok(ms < 4000, 'the fixture never came to look like music');
      classifier.update(lively(ms), 10);
    }
    const held = classifier.floorDb;
    for (const until = ms + 4000; ms < until; ms += 10) {
      classifier.update(lively(ms), 10);
      assert.equal(classifier.musicLike, true, 'the fixture stopped looking like music');
    }
    assert.equal(classifier.state, 'break', 'not declared music, only looking like it');
    assert.equal(classifier.floorDb, held, 'the floor climbed under audio that looked like music');
  });

  it('C20: a quiet song is heard', () => {
    // What the withdrawn rule cost, as a fixture: a band ten decibels over the
    // room. The floor climbed 3 dB/s for the 1.75 s it takes to be sure of a
    // song, the bar rose with it, and the song never got over it: 0% music.
    const bed = room(70, RATE);
    const song = scaleToDb(band(140, 50, RATE), -50);
    const from = 10 * RATE;
    for (let index = 0; index < song.length; index += 1) {
      bed[from + index] += song[index];
    }
    const { events, changes } = run(bed);
    const entered = changes.find((event) => event.state === 'music');
    assert.ok(entered !== undefined, 'the quiet song was never heard');
    // The page is warm by the tenth second: the envelope and more than half
    // the pulse window have to fill with the song, and then it has to hold.
    const budget = 10 + 8 + DEFAULTS.pulseWindow / 2 + DEFAULTS.musicEnterMs / 1000 + 1;
    assert.ok(entered.time <= budget, `heard at ${entered.time} s, budget ${budget}`);
    const during = events.filter((event) => event.time > entered.time && event.time < 59);
    assert.ok(
      during.every((event) => event.state === 'music'),
      'and then dropped',
    );
  });

  it('C20: a record through a limiter is not dropped in the middle', () => {
    // Staying needs a third of the movement entering did, like the two level
    // thresholds. A limiter leaves about a quarter of a decibel of it, which
    // hovers around the entry bar: with one bar for both, this fixture was
    // dropped twice in forty seconds.
    const { events, changes } = run(concat(leadIn(), limited(band(180, 40, RATE), 1)));
    const entered = changes.find((event) => event.state === 'music');
    assert.ok(entered !== undefined, 'never became music');
    assert.ok(entered.time <= ENTRY_S, `entered at ${entered.time} s`);
    assert.deepEqual(
      changes
        .filter((event) => event.state === 'break')
        .map((event) => `break at ${event.time.toFixed(1)} s`),
      [],
    );
    assert.equal(events.at(-1)?.state, 'music');
  });

  it('C20: a fridge that starts during a song does not keep him dancing after it', () => {
    // The fourth question is asked while dancing too, and this is why: asked
    // only at the door, he danced to the fridge for as long as it hummed.
    const song = concat(quietRoom(10, RATE), band(140, 30, RATE), silence(40, RATE));
    const fridge = hum(60, RATE);
    const bed = quietRoom(80, RATE);
    for (let index = 0; index < song.length; index += 1) {
      song[index] += bed[index] + (index >= 20 * RATE ? fridge[index - 20 * RATE] : 0);
    }
    const { changes } = run(song);
    const left = changes.find((event) => event.state === 'break');
    const budget = (DEFAULTS.breakHoldMs + DEFAULTS.timbreWindowMs + 1000) / 1000;
    assert.ok(left !== undefined, 'he is still dancing to the fridge');
    assert.ok(
      left.time > 40 && left.time <= 40 + budget,
      `left at ${left.time} s, and the song ended at 40`,
    );
    assert.equal(changes.at(-1), left, 'and came back');
  });

  it('C20: once a song has begun the floor holds still behind it', () => {
    // The other half, so the fix cannot overshoot: a song under way must not
    // drag the floor up after itself, or a long loud set would end in a break.
    const classifier = new Classifier(PULSELESS);
    for (let ms = 0; ms < 6000; ms += 10) {
      classifier.update(lively(ms), 10);
    }
    assert.equal(classifier.state, 'music');
    const held = classifier.floorDb;
    for (let ms = 6000; ms < 26000; ms += 10) {
      classifier.update(lively(ms), 10);
    }
    assert.equal(classifier.floorDb, held, 'the floor climbed during the song');
  });
});

describe('the tempo of real music', () => {
  for (const bpm of [150, 170]) {
    it(`C20: a band at ${bpm} bpm through a phone in a room is locked, and read correctly`, () => {
      // Not 110: a slow, sparse band through a phone speaker never gathers the
      // pulse to be recognised at all, which is a limit SPEC D7 records.
      // tempoMinConfidence was set against a drum machine, which scores 0.97.
      // A record scores about 0.2 and a record through a phone speaker in a
      // room about 0.13, so at 0.3 it never locked and he danced at the 140
      // default whatever was playing. Not 140 here, or the default would pass.
      const { events } = run(concat(leadIn(), phoneInRoom(band(bpm, 60, RATE), RATE)));
      const last = /** @type {PipelineEvent} */ (events.at(-1));
      assert.equal(last.state, 'music');
      assert.equal(last.locked, true, `never locked; still dancing at ${last.danceBpm}`);
      assert.ok(
        Math.abs(last.danceBpm - bpm) / bpm <= 0.03,
        `dancing at ${last.danceBpm.toFixed(1)} to a ${bpm} bpm band`,
      );
    });
  }

  for (const [id, name, make] of [
    ['C15', 'room noise', (/** @type {number} */ rate) => room(40, rate)],
    ['C15', 'applause-like noise', (/** @type {number} */ rate) => applause(40, rate)],
    ['C15', 'a voice', (/** @type {number} */ rate) => voice(40, rate)],
    [
      'C20',
      'a hum in a quiet room',
      (/** @type {number} */ rate) => concat(quietRoom(20, rate), hum(30, rate)),
    ],
  ]) {
    it(`${id}: ${name} never sets the dance tempo`, () => {
      // What the old threshold was protecting, stated as itself. Noise is
      // allowed to look periodic to the estimator for a second or two; it is
      // not allowed to become the tempo he dances at. A
      // tempo only settles inside a music span, and none of these opens one.
      // At both rates, as the criterion says.
      for (const sampleRate of [48000, 44100]) {
        const { events } = run(make(sampleRate), { sampleRate });
        assert.ok(
          events.every((event) => !event.locked),
          `a tempo was locked from noise at ${sampleRate} Hz`,
        );
        assert.ok(events.every((event) => event.danceBpm === DEFAULTS.defaultBpm));
      }
    });
  }
});

describe('classifier', () => {
  it('C1: silence stays break, with no transitions', () => {
    const { events, changes, labels } = run(silence(20, RATE));
    assert.ok(events.length > 1000);
    assert.ok(events.every((event) => event.state === 'break'));
    assert.deepEqual(changes, []);
    assert.ok(labels.every((label) => label === 'break'));
  });

  it('C1: room noise stays break, with no transitions', () => {
    const { events, changes, labels } = run(room(20, RATE));
    assert.ok(events.every((event) => event.state === 'break'));
    assert.deepEqual(changes, []);
    assert.ok(labels.every((label) => label === 'break'));
  });

  it('C1: a loud steady tone is not music: it does not move', () => {
    const tone = Float32Array.from(
      { length: RATE * 20 },
      (_, index) => 0.3 * Math.sin((2 * Math.PI * 1000 * index) / RATE),
    );
    const { events } = run(concat(leadIn(), tone));
    assert.ok(events.every((event) => event.state === 'break'));
    const heard = events.filter(
      (event) => event.time > 5 && event.levelDb >= event.floorDb + DEFAULTS.musicOverFloorDb,
    );
    assert.ok(heard.length > 100, `only ${heard.length} audible frames`);
    assert.ok(
      heard.every((event) => event.swing < DEFAULTS.minLevelSwingDb),
      'a steady tone has to be still, or something other than the swing is rejecting it',
    );
  });

  for (const [name, make] of [
    ['drums', (/** @type {number} */ bpm) => drums(bpm, 20, RATE)],
    ['drums over a guitar bed', (/** @type {number} */ bpm) => dense(bpm, 20, RATE)],
  ]) {
    it(`C2: ${name} at 120 bpm becomes music, then shows the tempo`, () => {
      const { events, changes, labels } = run(concat(leadIn(), make(120)));
      const entered = changes.find((event) => event.state === 'music');
      assert.ok(entered !== undefined, 'never became music');
      assert.ok(entered.time <= ENTRY_S, `entered at ${entered.time} s`);

      const before = events.indexOf(entered);
      assert.ok(
        labels.slice(0, before).every((label) => label === 'break'),
        'nothing is claimed before the music starts',
      );
      const locked = events.findIndex((event) => event.locked);
      assert.ok(locked >= before, 'a tempo was claimed before the music started');
      assert.ok(
        labels.slice(before, locked).every((label) => label === 'music'),
        'between entering and locking the label is exactly music',
      );

      const shown = labels.findIndex((label) => /^music \(\d+ bpm\)$/.test(label));
      assert.ok(shown !== -1, 'the tempo is never shown');
      assert.ok(events[shown].time <= ENTRY_S, `tempo shown at ${events[shown].time} s`);
      for (let index = shown; index < labels.length; index += 1) {
        const match = /^music \((\d+) bpm\)$/.exec(labels[index]);
        if (match !== null) {
          assert.equal(Number(match[1]), Math.round(events[index].danceBpm));
          assert.ok(Math.abs(Number(match[1]) - 120) <= 120 * 0.03, labels[index]);
        }
      }
      assert.equal(
        changes.filter((event) => event.state === 'break' && event.time > entered.time).length,
        0,
        'fell back to break',
      );
    });
  }

  /**
   * Hold a music fixture to everything C2 asks of it: it enters inside the
   * budget, shows the tempo inside ten seconds, reads that tempo within 3% for
   * the rest of the run, keeps the label and the dance tempo in agreement, and
   * never falls back to a break.
   *
   * @param {Float32Array} audio Lead-in followed by the music.
   * @param {number} bpm The tempo played.
   * @returns {void}
   */
  function expectSteadyMusic(audio, bpm) {
    const { events, changes, labels } = run(audio);
    const entered = changes.find((event) => event.state === 'music');
    assert.ok(entered !== undefined, 'never became music');
    assert.ok(entered.time <= ENTRY_S, `entered at ${entered.time} s`);
    assert.equal(
      changes.filter((event) => event.state === 'break' && event.time > entered.time).length,
      0,
      'fell back to break',
    );
    const entryIndex = events.indexOf(entered);
    assert.ok(
      labels.slice(0, entryIndex).every((label) => label === 'break'),
      'nothing is claimed before the music starts',
    );
    const locked = events.findIndex((event) => event.locked);
    assert.ok(locked >= entryIndex, 'a tempo was claimed before the music started');
    assert.ok(
      labels.slice(entryIndex, locked).every((label) => label === 'music'),
      'between entering and locking the label is exactly music',
    );
    assert.ok(
      events.slice(entryIndex).every((event) => event.state === 'music'),
      'he keeps dancing to the end of the fixture',
    );
    const shown = labels.findIndex((label) => /^music \(\d+ bpm\)$/.test(label));
    assert.ok(shown !== -1, 'the tempo is never shown');
    assert.ok(events[shown].time <= ENTRY_S, `tempo shown at ${events[shown].time} s`);
    for (let index = shown; index < labels.length; index += 1) {
      const match = /^music \((\d+) bpm\)$/.exec(labels[index]);
      if (match !== null) {
        assert.equal(Number(match[1]), Math.round(events[index].danceBpm), 'label disagrees');
        assert.ok(
          Math.abs(Number(match[1]) - bpm) <= bpm * 0.03,
          `${labels[index]} at ${events[index].time} s, playing ${bpm}`,
        );
      }
    }
  }

  for (const bpm of [100, 160, 180]) {
    it(`C3: drums at ${bpm} bpm become music and show that tempo, without an octave error`, () => {
      expectSteadyMusic(concat(leadIn(), drums(bpm, 20, RATE)), bpm);
    });
  }

  for (const bpm of [160, 180]) {
    it(`C3: drums over a guitar bed at ${bpm} bpm read the same`, () => {
      expectSteadyMusic(concat(leadIn(), dense(bpm, 20, RATE)), bpm);
    });
  }

  it('C4: applause-like noise never becomes music, however loud', () => {
    const { events, changes } = run(concat(leadIn(), applause(10, RATE), applause(60, RATE)));
    assert.equal(changes.filter((event) => event.state === 'music').length, 0);
    assert.ok(events.some((event) => event.levelDb > event.floorDb + DEFAULTS.musicOverFloorDb));
  });

  it('C5: a voice never becomes music', () => {
    const { changes } = run(concat(leadIn(), voice(70, RATE)));
    assert.equal(changes.filter((event) => event.state === 'music').length, 0);
  });

  it('C6: song, gap, song gives three transitions, each inside its budget', () => {
    const gapStart = LEAD + 30;
    const songStart = gapStart + 6;
    const { changes } = run(
      concat(leadIn(), drums(120, 30, RATE), room(6, RATE), drums(160, 30, RATE)),
    );
    assert.deepEqual(
      changes.map((event) => event.state),
      ['music', 'break', 'music'],
    );
    const [first, quiet, second] = changes;
    assert.ok(first.time <= ENTRY_S, `${first.time}`);

    const leaveFrom = gapStart + DEFAULTS.breakHoldMs / 1000;
    const leaveTo = leaveFrom + (DEFAULTS.levelWindowMs + 1000) / 1000;
    assert.ok(quiet.time >= leaveFrom && quiet.time <= leaveTo, `left music at ${quiet.time} s`);

    // On a warm page: the envelope and the pulse window have to fill with the
    // new song, then it has to hold.
    const enterFrom = songStart + DEFAULTS.musicEnterMs / 1000;
    const enterTo = songStart + 8 + DEFAULTS.pulseWindow / 2 + DEFAULTS.musicEnterMs / 1000 + 1;
    assert.ok(
      second.time >= enterFrom && second.time <= enterTo,
      `re-entered music at ${second.time} s, budget ${enterTo}`,
    );
  });

  it('C6: the second song takes the dance tempo with it, from the moment he dances to it', () => {
    const songStart = LEAD + 30 + 6;
    const { events } = run(
      concat(leadIn(), drums(120, 30, RATE), room(6, RATE), drums(160, 30, RATE)),
    );
    const settled = events.filter((event) => event.time >= songStart && event.state === 'music');
    assert.ok(settled.length > 0);
    // At the moment the criterion names, not merely by the end of the run.
    assert.ok(Math.abs(settled[0].danceBpm - 160) <= 160 * 0.03, `${settled[0].danceBpm} on entry`);
    for (const event of settled) {
      assert.ok(
        Math.abs(event.danceBpm - 160) <= 160 * 0.03,
        `${event.danceBpm} at ${event.time} s`,
      );
    }
  });

  it('C7: a stop shorter than breakHoldMs stays music', () => {
    const { changes, events } = run(
      concat(
        leadIn(),
        drums(120, 15, RATE),
        silence(DEFAULTS.breakHoldMs / 2000, RATE),
        drums(120, 15, RATE),
      ),
    );
    assert.deepEqual(
      changes.map((event) => event.state),
      ['music'],
    );
    assert.ok(Math.abs(events.at(-1).danceBpm - 120) <= 120 * 0.03, `${events.at(-1).danceBpm}`);
  });

  it('C10: every chunk size gives identical decisions, and so does a repeat run', () => {
    const audio = concat(leadIn(), drums(120, 8, RATE), room(4, RATE), drums(160, 8, RATE));
    const expected = run(audio, { chunk: audio.length }).events;
    for (const chunk of [128, 512, 1000, 4096, 44100]) {
      assert.deepEqual(run(audio, { chunk }).events, expected, `chunk ${chunk}`);
    }
    assert.deepEqual(run(audio, { chunk: audio.length }).events, expected, 'repeat run');
  });

  it('C10: 48 kHz agrees with 44.1 kHz on order, timing, and tempo', () => {
    /**
     * The same fixture at a sample rate.
     *
     * @param {number} rate Sample rate in Hz.
     * @returns {Float32Array} The audio.
     */
    const fixture = (rate) =>
      concat(leadIn(rate), drums(120, 15, rate), room(5, rate), drums(160, 15, rate));
    const low = run(fixture(44100), { sampleRate: 44100 });
    const high = run(fixture(48000), { sampleRate: 48000 });
    assert.deepEqual(
      high.changes.map((event) => event.state),
      low.changes.map((event) => event.state),
    );
    for (let index = 0; index < low.changes.length; index += 1) {
      const drift = Math.abs(high.changes[index].time - low.changes[index].time);
      assert.ok(drift <= 0.5, `transition ${index} drifted ${drift.toFixed(2)} s`);
    }
    const tempo = (/** @type {typeof low} */ result) => result.events.at(-1).danceBpm;
    assert.ok(
      Math.abs(tempo(high) - tempo(low)) <= tempo(low) * 0.03,
      `${tempo(high)} vs ${tempo(low)}`,
    );
  });

  it('C6: entering needs more level than staying does, which is what stops the flapping', () => {
    // A song that sits between the two thresholds keeps dancing but could not
    // have started; one gate for both would flap on exactly this passage.
    const config = { ...STILL, musicOverFloorDb: 20, breakUnderFloorDb: 6 };
    const between = -60 + 10;
    const quiet = new Classifier(config);
    for (let elapsed = 0; elapsed < 8000; elapsed += 10) {
      quiet.update(
        { time: 0, levelDb: between, flux: 1, flatness: 0.1, bass: 0.9, tempo: null },
        10,
      );
    }
    assert.equal(quiet.state, 'break', 'that level is not enough to start');

    const playing = new Classifier(config);
    const loud = { time: 0, levelDb: -20, flux: 1, flatness: 0.1, bass: 0.9, tempo: null };
    for (let elapsed = 0; elapsed < 5000; elapsed += 10) {
      playing.update(loud, 10);
    }
    assert.equal(playing.state, 'music');
    const floor = playing.floorDb;
    for (let elapsed = 0; elapsed < 8000; elapsed += 10) {
      playing.update(
        { time: 0, levelDb: floor + 10, flux: 1, flatness: 0.1, bass: 0.9, tempo: null },
        10,
      );
    }
    assert.equal(playing.state, 'music', 'but it is enough to keep going');
  });

  it('unit: the floor learns a quiet room at once and a louder one slowly', () => {
    const classifier = new Classifier(DEFAULTS);
    assert.equal(classifier.floorDb, FLOOR_START_DB);
    /**
     * Feed frames of a constant level.
     *
     * @param {number} levelDb The level.
     * @param {number} ms How long.
     * @returns {void}
     */
    const feed = (levelDb, ms) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 10) {
        classifier.update({ time: 0, levelDb, flux: 0, flatness: 1, bass: 0, tempo: null }, 10);
      }
    };
    feed(-70, 50);
    assert.ok(Math.abs(classifier.floorDb - -70) < 1e-9, `fell to ${classifier.floorDb}`);
    feed(-40, 1000);
    assert.ok(
      classifier.floorDb > -70 && classifier.floorDb < -60,
      `rose slowly to ${classifier.floorDb}`,
    );
  });

  it('unit: the floor stays within its limits', () => {
    const quiet = new Classifier(DEFAULTS);
    for (let index = 0; index < 100; index += 1) {
      quiet.update({ time: 0, levelDb: -120, flux: 0, flatness: 1, bass: 0, tempo: null }, 10);
    }
    assert.equal(quiet.floorDb, FLOOR_MIN_DB);
    assert.equal(FLOOR_MIN_DB, -80, 'SPEC D10 states the floor is clamped to -80 dBFS');

    const loud = new Classifier(DEFAULTS);
    for (let index = 0; index < 20000; index += 1) {
      loud.update({ time: 0, levelDb: 0, flux: 0, flatness: 1, bass: 0, tempo: null }, 10);
    }
    assert.equal(loud.floorDb, FLOOR_MAX_DB);
    assert.equal(FLOOR_MAX_DB, -25, 'SPEC D10 states the floor is clamped to -25 dBFS');
  });
});
