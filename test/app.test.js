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
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boot } from '../src/app.js';
import { BREAK_LOOPS, dancesOf, STAGE } from '../src/classify/show.js';
import { DEFAULTS } from '../src/config.js';
import { LOOP_ENERGY } from '../src/sprites/asciipunk.js';
import {
  createAudioStack,
  createFakeDocument,
  createFakeTimers,
  createFakeWindow,
  namedError,
  pictureOf,
} from './helpers/fakes.js';
import { drums, scaleToDb, silence } from './helpers/synth.js';

/**
 * Build the app on fakes.
 *
 * @param {object} [options] Options.
 * @param {string} [options.search] Query string.
 * @param {string[]} [options.missing] Element ids to leave out of the page.
 * @returns {any} The stack, the page, and the environment.
 */
function setup({ search = '', missing = [], random = () => 0 } = {}) {
  const stack = createAudioStack();
  const document = createFakeDocument({ missing });
  const window = createFakeWindow();
  const timers = createFakeTimers();
  const env = {
    document,
    location: { search },
    timers,
    navigator: { mediaDevices: stack.mediaDevices },
    AudioContext: stack.AudioContext,
    AudioWorkletNode: stack.AudioWorkletNode,
    window,
    random,
  };
  return { stack, document, window, timers, env };
}

/**
 * Click start and wait for the capture to settle.
 *
 * @param {any} document The fake page.
 * @returns {Promise<void>} Resolves when the click handler is done.
 */
async function click(document) {
  await document.elements.start.listeners.click();
}

/** Sample rate of the fake audio context. */
const RATE = 48000;

/**
 * Seconds of drums after which he is dancing, from a cold start: the gate
 * defaults to break and takes its time to be sure (SPEC D7).
 */
const WARM_S = 22;

/**
 * Post audio to the page in 512-sample frames, like the worklet would.
 *
 * @param {any} stack The fake audio stack.
 * @param {Float32Array} audio The samples.
 */
function push(stack, audio) {
  const { port } = stack.log.nodes[0];
  for (let offset = 0; offset + 512 <= audio.length; offset += 512) {
    port.onmessage({ data: audio.slice(offset, offset + 512) });
  }
}

/**
 * Count the ticks a show is given from here on.
 *
 * @param {import('../src/classify/show.js').Show} show The show.
 * @returns {{ticks: number}} A counter that keeps counting.
 */
function countTicks(show) {
  const counter = { ticks: 0 };
  const tick = show.tick.bind(show);
  show.tick = (ms) => {
    counter.ticks += 1;
    tick(ms);
  };
  return counter;
}

/**
 * A key going down, as the app reads one.
 *
 * @param {Partial<KeyPress>} fields What to override; the key is `d` unless said.
 * @returns {KeyPress} The key press.
 */
function press(fields) {
  return {
    key: 'd',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...fields,
  };
}

/**
 * The overlay's first line.
 *
 * @param {any} document The fake page.
 * @returns {string} The line.
 */
function firstLine(document) {
  return document.elements.overlay.textContent.split('\n')[0];
}

/**
 * Run animation frames until everybody has walked on, between songs.
 *
 * @param {any} window The fake window.
 * @param {import('../src/classify/show.js').Show} show The show.
 * @returns {number} The time of the last frame run, in milliseconds.
 */
function walkOn(window, show) {
  let elapsedMs = 0;
  window.runFrame(elapsedMs);
  while (show.punks.some((punk) => punk.state !== 'stage')) {
    elapsedMs += DEFAULTS.breakFrameMs;
    window.runFrame(elapsedMs);
    assert.ok(elapsedMs < 120000, 'somebody never came home');
  }
  return elapsedMs;
}

describe('app', () => {
  it('unit: the page starts idle: button shown, overlay and repository link hidden', () => {
    const { document, env } = setup();
    boot(env);
    assert.equal(document.elements.start.hidden, false);
    assert.equal(document.elements.overlay.hidden, true);
    assert.equal(document.elements.repo.hidden, true);
  });

  it('C16: the show runs from the moment the page opens, before the microphone', () => {
    const { document, window, env } = setup();
    const { show } = boot(env);
    assert.ok(Number.parseFloat(document.elements.stage.style.fontSize) > 1, 'the stage is sized');
    assert.ok(window.runFrame(0), 'an animation frame was asked for');
    const empty = pictureOf(document.elements.stage);
    assert.equal(empty.split('\n').length, STAGE.rows, 'a line is drawn for every row');
    assert.equal(empty.trim(), '', 'they start in the wings');
    walkOn(window, show);
    const drawn = pictureOf(document.elements.stage).replaceAll(/\s/g, '');
    assert.ok(drawn.length > 200, `only ${drawn.length} characters of punk`);
    for (const punk of show.punks) {
      assert.ok(BREAK_LOOPS.includes(punk.loop), `${punk.id} does ${punk.loop} between songs`);
    }
    assert.equal(document.elements.panel.hidden, false, 'the start button is still offered');
  });

  it('C19: the grid is measured again when the shipped face lands', async () => {
    // The cell is measured once and kept. The font does change once: the
    // shipped face arrives after the first paint, and a grid sized against
    // whatever monospace the machine had would be the wrong shape all night.
    const { document, env } = setup();
    const { stage } = boot(env);
    const probes = () => document.created.filter((/** @type {any} */ node) => node.id === 'pre');
    assert.equal(probes().length, 1, 'measured once to begin with');
    const before = document.elements.stage.style.fontSize;

    // A wider cell in the new face. Width, because the stage is width-bound on
    // any wide window: a taller cell would change nothing and prove nothing.
    document.cell.width = 72;
    await document.loadFonts();
    assert.equal(probes().length, 2, 'the cell was never measured again');
    assert.notEqual(document.elements.stage.style.fontSize, before);
    assert.ok(stage.cell !== null, 'the stage is left without a measurement');
  });

  it('C19: a page whose browser has no font set still draws', () => {
    const { document, window, env } = setup();
    document.fonts = undefined;
    assert.doesNotThrow(() => boot(env));
    window.runFrame(0);
    assert.equal(pictureOf(document.elements.stage).split('\n').length, STAGE.rows);
  });

  it('C16: the stage is refitted when the window changes shape', () => {
    const { document, window, env } = setup();
    boot(env);
    const before = document.elements.stage.style.fontSize;
    window.innerWidth = 640;
    window.innerHeight = 480;
    window.listeners.resize();
    assert.notEqual(document.elements.stage.style.fontSize, before);
  });

  it('C18: the panel gets out of the way once capture runs, debugging or not', async () => {
    // Debug mode used to keep the centred panel up, which put a full-width
    // "music (140 bpm)" across Marcel's chest: exactly where you are looking
    // while tuning a threshold. The overlay names the state in its first line,
    // so nothing is lost by clearing the centre.
    for (const search of ['', '?debug=1']) {
      const { document, env } = setup({ search });
      boot(env);
      await click(document);
      assert.equal(document.elements.panel.hidden, true, `panel still up with "${search}"`);
    }
  });

  it('C16: what they perform follows what is heard', async () => {
    const { stack, document, window, env } = setup();
    const { director, show } = boot(env);
    await click(document);
    const lastMs = walkOn(window, show);
    const beforeMusic = pictureOf(document.elements.stage);
    assert.deepEqual([show.dancing, show.tier, director.tier], [false, 0, 0], 'between songs');

    push(stack, drums(120, WARM_S, RATE));
    window.runFrame(lastMs + 16);
    assert.notEqual(pictureOf(document.elements.stage), beforeMusic, 'the scene changed');
    assert.equal(document.elements.label.textContent.startsWith('music'), true);
    assert.equal(show.dancing, true);
    assert.ok(director.tier >= 1, 'the director names a tier');
    assert.equal(show.tier, director.tier, 'and the show dances to it');
    for (const punk of show.punks) {
      assert.ok(dancesOf(show.tier).includes(punk.loop), `${punk.id} does ${punk.loop}`);
    }
  });

  it('C22: the beat drives the show: a tick every eighth note at the tempo heard', async () => {
    // The wiring, not its effects: with the dance tempo replaced by the
    // default, or the rate left at breakFrameMs, the ticks below would not
    // fall where an eighth note says they must.
    const { stack, document, window, env } = setup();
    const { show } = boot(env);
    await click(document);
    // Long enough for the gate to be sure and the tempo to lock, so the dance
    // tempo is the detected one and not the default it would fall back to.
    push(stack, drums(120, WARM_S, RATE));
    // Read the tempo they settled on rather than assuming it.
    const shown = /music \((\d+) bpm\)/.exec(document.elements.label.textContent);
    assert.ok(shown !== null, `no tempo locked: ${document.elements.label.textContent}`);
    const danceBpm = Number(shown[1]);
    assert.ok(Math.abs(danceBpm - 120) <= 4, `${danceBpm} bpm for a 120 bpm fixture`);
    assert.notEqual(danceBpm, DEFAULTS.defaultBpm, 'the default would hide a broken wiring');

    const counter = countTicks(show);
    window.runFrame(0);
    assert.equal(counter.ticks, 0, 'the music has just begun: drawn, not moved on');
    for (let elapsedMs = 5; elapsedMs <= 6000; elapsedMs += 5) {
      window.runFrame(elapsedMs);
    }
    // Four eighth notes a second at 120, however the animation frames fall:
    // 24 in six seconds, where the default 140 would make it 28.
    assert.ok(Math.abs(counter.ticks - 24) <= 1, `${counter.ticks} ticks in 6 s`);
    assert.ok(Math.abs(counter.ticks - (6000 / 60000) * DEFAULTS.defaultBpm * 2) > 2);
  });

  it('C22: between songs nobody is hurried along by the beat', async () => {
    const { stack, document, window, env } = setup();
    const { show } = boot(env);
    await click(document);
    push(stack, silence(2, RATE));
    const counter = countTicks(show);
    window.runFrame(0);
    // Odd moments as well as even ones, so that a rate gone wrong cannot hide.
    for (const elapsedMs of [3, 214, 501, DEFAULTS.breakFrameMs - 1]) {
      window.runFrame(elapsedMs);
      assert.equal(counter.ticks, 0, `a tick at ${elapsedMs} ms, inside one break frame`);
    }
    window.runFrame(DEFAULTS.breakFrameMs);
    assert.equal(counter.ticks, 1);
    window.runFrame(2 * DEFAULTS.breakFrameMs - 1);
    assert.equal(counter.ticks, 1);
    window.runFrame(2 * DEFAULTS.breakFrameMs);
    assert.equal(counter.ticks, 2);
  });

  it('C22: ?breakFrameMs= sets the pace between songs', () => {
    const { window, env } = setup({ search: '?breakFrameMs=300' });
    const { show } = boot(env);
    const counter = countTicks(show);
    for (let elapsedMs = 0; elapsedMs <= 3000; elapsedMs += 10) {
      window.runFrame(elapsedMs);
    }
    assert.equal(counter.ticks, 10);
  });

  it('C22: ticks keep their phase, and after a stall start again from now', () => {
    const { window, env } = setup();
    const { show } = boot(env);
    const counter = countTicks(show);
    const step = DEFAULTS.breakFrameMs;
    window.runFrame(0);
    // Animation frames land late; the ticks do not drift with them.
    window.runFrame(step + 40);
    window.runFrame(2 * step + 1);
    assert.equal(counter.ticks, 2, 'the second tick waited for the first one to be on time');
    // A tab left in the background for a minute is one tick, not sixty.
    window.runFrame(60000);
    assert.equal(counter.ticks, 3);
    window.runFrame(60000 + step - 1);
    assert.equal(counter.ticks, 3);
    window.runFrame(60000 + step);
    assert.equal(counter.ticks, 4);
  });

  it('C18: whoever is given something new to do opens on its first frame, and holds it', async () => {
    // Ticking before drawing would open every dance on its second frame, and a
    // two-frame scene on the wrong one.
    const { stack, document, window, env } = setup();
    const { show } = boot(env);
    await click(document);
    const lastMs = walkOn(window, show);
    push(stack, drums(120, WARM_S, RATE));
    assert.equal(show.dancing, true);
    const counter = countTicks(show);
    const eighth = 60000 / 120 / 2;

    window.runFrame(lastMs + 1);
    assert.equal(counter.ticks, 0, 'the dance was moved on before it was drawn');
    assert.deepEqual(
      show.punks.map((punk) => punk.index),
      [0, 0, 0],
    );
    const opening = pictureOf(document.elements.stage);
    window.runFrame(lastMs + 1 + eighth - 20);
    assert.equal(counter.ticks, 0, 'the first frame is held a whole tick');
    assert.equal(pictureOf(document.elements.stage), opening);
    window.runFrame(lastMs + 1 + eighth + 20);
    assert.equal(counter.ticks, 1);
    assert.notEqual(pictureOf(document.elements.stage), opening);
  });

  it('C16: the overlay names what is actually being performed', async () => {
    const { stack, document, env } = setup({ search: '?debug=1' });
    const { director, show } = boot(env);
    await click(document);
    // Into the music: between songs the tier is 0 whatever the overlay is fed.
    push(stack, drums(120, WARM_S, RATE));
    const text = document.elements.overlay.textContent;
    const tier = /^state\s+music\s+tier (\d)$/m.exec(text);
    const cast = /^punks\s+(.+)$/m.exec(text);
    assert.ok(tier !== null && cast !== null, text);
    assert.ok(director.tier >= 1, 'the drums were not heard as music');
    assert.equal(Number(tier[1]), director.tier, 'the overlay is reporting a different tier');
    assert.equal(cast[1], show.caption(), 'the overlay is reporting a different cast');
    assert.match(cast[1], /^billy \w+, mo \w+, spike \w+$/);
  });

  it('C22: the show is told how long a tick lasted, and the URL how long a break may go on', () => {
    const { window, env } = setup({
      search: '?breakFrameMs=500&breakRefreshMinMs=2000&breakRefreshMaxMs=2000',
    });
    const { show } = boot(env);
    assert.deepEqual(show.refresh, { min: 2000, max: 2000 });
    window.runFrame(0);
    for (const [elapsedMs, breakMs] of [
      [500, 500],
      [1000, 1000],
      [1500, 1500],
      // Two seconds in, the break is dealt again and its clock starts over.
      [2000, 0],
      [2500, 500],
    ]) {
      window.runFrame(elapsedMs);
      assert.equal(show.breakMs, breakMs, `at ${elapsedMs} ms`);
    }
  });

  it('C22: left alone, a break is dealt again between one and five minutes in', () => {
    const { env } = setup();
    const { show } = boot(env);
    assert.deepEqual(show.refresh, {
      min: DEFAULTS.breakRefreshMinMs,
      max: DEFAULTS.breakRefreshMaxMs,
    });
    assert.deepEqual(show.refresh, { min: 60000, max: 300000 });
  });

  it('C22: chance reaches the show, so a test can script it', () => {
    let draws = 0;
    const { env } = setup({
      random: () => {
        draws += 1;
        return 0;
      },
    });
    const { show } = boot(env);
    assert.ok(draws > 0, 'the show was dealt its scenes by some other chance');
    assert.equal(show.random, env.random);
  });

  it('C16: d shows and hides the debug text, wherever the page started', async () => {
    for (const [search, opensShown] of /** @type {[string, boolean][]} */ ([
      ['', false],
      ['?debug=1', true],
    ])) {
      const { stack, document, window, env } = setup({ search });
      const { director, show } = boot(env);
      const { overlay, repo } = document.elements;
      const shown = () => [!overlay.hidden, !repo.hidden];
      assert.deepEqual(shown(), [opensShown, opensShown], `opened with "${search}"`);
      window.listeners.keydown(press({}));
      assert.deepEqual(shown(), [!opensShown, !opensShown], 'd did not toggle it');
      window.listeners.keydown(press({ key: 'D' }));
      assert.deepEqual(shown(), [opensShown, opensShown], 'a capital D did not toggle it back');

      // Keys that are not this one: the browser's own shortcuts, a key held
      // down, and every other letter.
      for (const other of [
        press({ ctrlKey: true }),
        press({ metaKey: true }),
        press({ altKey: true }),
        press({ repeat: true }),
        press({ key: 'f' }),
        press({ key: 'Dead' }),
      ]) {
        window.listeners.keydown(other);
        assert.deepEqual(shown(), [opensShown, opensShown], JSON.stringify(other));
      }

      // Shown in the middle of a song, it says what was last heard at once,
      // not at the next refresh: the tier the director names and the cast the
      // show has, which between songs would be 0 and prove little.
      await click(document);
      push(stack, drums(120, WARM_S, RATE));
      if (opensShown) {
        window.listeners.keydown(press({}));
      }
      overlay.textContent = '';
      window.listeners.keydown(press({}));
      assert.equal(overlay.hidden, false);
      const tier = /^state\s+music\s+tier (\d)$/m.exec(overlay.textContent);
      const cast = /^punks\s+(.+)$/m.exec(overlay.textContent);
      assert.ok(tier !== null && cast !== null, overlay.textContent);
      assert.ok(director.tier >= 1, 'the drums were not heard as music');
      assert.equal(Number(tier[1]), director.tier, 'd showed another tier');
      assert.equal(cast[1], show.caption(), 'd showed another cast');
      // Hidden, it is left alone: nothing is written that nobody reads.
      window.listeners.keydown(press({}));
      overlay.textContent = 'stale';
      push(stack, drums(120, 1, RATE));
      assert.equal(overlay.textContent, 'stale');
    }
  });

  it('C23: with no microphone, 2 makes them dance a tier-2 loop at once, at defaultBpm', () => {
    const { document, window, env } = setup();
    const { show } = boot(env);
    const lastMs = walkOn(window, show);
    const before = pictureOf(document.elements.stage);
    assert.deepEqual([show.dancing, show.tier], [false, 0]);

    window.listeners.keydown(press({ key: '2' }));
    assert.deepEqual(
      [show.dancing, show.tier],
      [true, 2],
      'not heard the moment the key went down',
    );
    for (const punk of show.punks) {
      assert.ok(dancesOf(2).includes(punk.loop), `${punk.id} does ${punk.loop}`);
      assert.equal(punk.index, 0, `${punk.id} did not open on its first frame`);
    }

    // The next frame draws without ticking, and the ticks then come every
    // eighth note at the default 140 bpm: 28 in six seconds, where the
    // between-song pace would give 6.
    const counter = countTicks(show);
    window.runFrame(lastMs + 1);
    assert.equal(counter.ticks, 0, 'ticked before the first frame was drawn');
    assert.notEqual(pictureOf(document.elements.stage), before, 'the dance was not drawn');
    for (let elapsedMs = lastMs + 6; elapsedMs <= lastMs + 6001; elapsedMs += 5) {
      window.runFrame(elapsedMs);
    }
    assert.ok(Math.abs(counter.ticks - 28) <= 1, `${counter.ticks} ticks in 6 s`);
  });

  it('C23: 0 while music plays is a break, the moment the key is handled', async () => {
    const { stack, document, window, env } = setup();
    const { director, show } = boot(env);
    await click(document);
    walkOn(window, show);
    push(stack, drums(120, WARM_S, RATE));
    assert.equal(show.dancing, true, 'the drums were not heard');
    assert.ok(director.tier >= 1);

    window.listeners.keydown(press({ key: '0' }));
    assert.deepEqual([show.dancing, show.tier], [false, 0]);
    for (const punk of show.punks) {
      if (punk.state === 'stage') {
        const scene = punk.loop === 'sleep' || LOOP_ENERGY[punk.loop] === 0;
        assert.ok(scene, `${punk.id} does ${punk.loop} in a forced break`);
      }
    }
    // The director still has its own opinion underneath.
    assert.ok(director.tier >= 1, 'the director was told about the forced break');
    assert.match(document.elements.label.textContent, /^music/, "the label is not the detector's");
  });

  it('C23: a plain key only, and d still works while a tier is forced', () => {
    const { document, window, env } = setup();
    const { show } = boot(env);
    walkOn(window, show);
    for (const other of [
      press({ key: '2', ctrlKey: true }),
      press({ key: '2', metaKey: true }),
      press({ key: '2', altKey: true }),
      press({ key: '2', repeat: true }),
      press({ key: '4' }),
      press({ key: 'Digit2' }),
    ]) {
      window.listeners.keydown(other);
      assert.deepEqual([show.dancing, show.tier], [false, 0], JSON.stringify(other));
    }
    window.listeners.keydown(press({ key: '3' }));
    assert.deepEqual([show.dancing, show.tier], [true, 3]);
    assert.equal(document.elements.overlay.hidden, true);
    window.listeners.keydown(press({}));
    assert.equal(document.elements.overlay.hidden, false, 'd stopped working');
    assert.deepEqual([show.dancing, show.tier], [true, 3], 'd changed the tier');
    window.listeners.keydown(press({}));
    assert.equal(document.elements.overlay.hidden, true);
  });

  it('C23: forcing the tier they are in changes nothing on stage, and restarts the clock', () => {
    const { window, env } = setup();
    const { show } = boot(env);
    walkOn(window, show);
    window.runFrame(100000);
    window.listeners.keydown(press({ key: '1' }));
    const dancing = show.punks.map((punk) => [punk.loop, punk.index]);
    window.runFrame(115000);
    window.listeners.keydown(press({ key: '1' }));
    assert.deepEqual(
      show.punks.map((punk) => [punk.loop, punk.index]),
      dancing,
      'the same tier again started a new dance',
    );
    window.runFrame(130000);
    assert.deepEqual([show.dancing, show.tier], [true, 1], 'the first deadline was kept');
    window.runFrame(144999);
    assert.deepEqual([show.dancing, show.tier], [true, 1]);
    window.runFrame(145000);
    assert.deepEqual([show.dancing, show.tier], [false, 0]);
  });

  it('C23: expiry on the animation clock, whoever it moves opening on its first frame', () => {
    const { document, window, env } = setup();
    const { show } = boot(env);
    walkOn(window, show);
    window.runFrame(1000);
    window.listeners.keydown(press({ key: '3' }));
    assert.deepEqual([show.dancing, show.tier], [true, 3]);
    window.runFrame(30999);
    assert.deepEqual([show.dancing, show.tier], [true, 3], 'gone a millisecond early');

    const counter = countTicks(show);
    const before = pictureOf(document.elements.stage);
    window.runFrame(31000);
    assert.deepEqual([show.dancing, show.tier], [false, 0], 'still forced at the deadline');
    assert.equal(counter.ticks, 0, 'ticked on the frame it fell back, instead of drawing');
    assert.notEqual(pictureOf(document.elements.stage), before, 'the scenes were not drawn');
    for (const punk of show.punks) {
      if (punk.state === 'stage') {
        assert.equal(punk.index, 0, `${punk.id} did not open on its first frame`);
      }
    }

    // A tab that comes back from the background after the deadline: the
    // override ends on that first frame, however late it is.
    window.runFrame(40000);
    window.listeners.keydown(press({ key: '2' }));
    assert.deepEqual([show.dancing, show.tier], [true, 2]);
    window.runFrame(200000);
    assert.deepEqual([show.dancing, show.tier], [false, 0]);
  });

  it('C23: underneath, events still count: the label, the tempo, and the tier at expiry', async () => {
    const { stack, document, window, env } = setup();
    const { director, show } = boot(env);
    await click(document);
    const lastMs = walkOn(window, show);
    window.listeners.keydown(press({ key: '1' }));
    assert.deepEqual([show.dancing, show.tier], [true, 1]);

    push(stack, drums(120, WARM_S, RATE));
    assert.match(
      document.elements.label.textContent,
      /^music \(\d+ bpm\)$/,
      'the label went quiet',
    );
    assert.ok(director.tier >= 1, 'the director did not hear the drums');
    assert.deepEqual([show.dancing, show.tier], [true, 1], 'the drums overrode the key');

    // The dance follows the tempo heard, 120, not the default 140: 24 ticks
    // in six seconds, where 140 would give 28.
    const counter = countTicks(show);
    window.runFrame(lastMs + 1);
    for (let elapsedMs = lastMs + 6; elapsedMs <= lastMs + 6001; elapsedMs += 5) {
      window.runFrame(elapsedMs);
    }
    assert.ok(Math.abs(counter.ticks - 24) <= 1, `${counter.ticks} ticks in 6 s`);

    // Thirty seconds after the press, the director's own tier is what they hear.
    window.runFrame(lastMs + 30000);
    assert.equal(show.dancing, true);
    assert.equal(show.tier, director.tier, 'the show did not fall back to the director');

    // Its settled tier, not the one the room is asking for: a second of
    // quieter drums asks for less, and the settle has not followed it yet.
    push(stack, scaleToDb(drums(120, 1, RATE), -36));
    window.runFrame(lastMs + 30500);
    assert.ok(director.asked < director.tier, `asked ${director.asked}, settled ${director.tier}`);
    assert.equal(show.tier, director.tier, 'the show followed the room before the director did');
    assert.notEqual(show.tier, director.asked);
  });

  it('C23: the overlay says forced and the seconds left, and the label never does', async () => {
    const { stack, document, window, env } = setup({ search: '?debug=1' });
    boot(env);
    await click(document);
    push(stack, drums(120, 3, RATE));
    assert.match(firstLine(document), /^state\s+break\s+tier 0$/);

    window.runFrame(1000);
    window.listeners.keydown(press({ key: '2' }));
    assert.equal(firstLine(document), 'state    break   tier 2 (forced, 30 s left)');
    assert.equal(document.elements.label.textContent, 'break');

    // The countdown moves with the audio events that refresh the overlay.
    window.runFrame(12500);
    push(stack, drums(120, 0.2, RATE));
    assert.equal(firstLine(document), 'state    break   tier 2 (forced, 19 s left)');
    window.runFrame(30999);
    push(stack, drums(120, 0.2, RATE));
    assert.equal(firstLine(document), 'state    break   tier 2 (forced, 1 s left)');
    // Hidden and shown again, it still says so.
    window.listeners.keydown(press({}));
    window.listeners.keydown(press({}));
    assert.equal(firstLine(document), 'state    break   tier 2 (forced, 1 s left)');
    window.runFrame(31000);
    push(stack, drums(120, 0.2, RATE));
    assert.match(
      firstLine(document),
      /^state\s+break\s+tier 0$/,
      'still forced after the deadline',
    );
    assert.equal(document.elements.label.textContent, 'break');

    // Hidden, nothing is written to it, by a key any more than by an event.
    const plain = setup();
    const booted = boot(plain.env);
    await click(plain.document);
    push(plain.stack, drums(120, 3, RATE));
    plain.window.listeners.keydown(press({ key: '2' }));
    assert.deepEqual([booted.show.dancing, booted.show.tier], [true, 2]);
    assert.equal(plain.document.elements.overlay.textContent, '');
  });

  it('C16: r forgets what it has heard, and leaves the microphone and the tuning alone', async () => {
    // Chance says no to everything, so the break it falls into moves nobody:
    // what this test watches is the reset, not the deal.
    const { stack, document, window, env } = setup({
      search: '?debug=1&pulseEnter=0.4',
      random: () => 0.99,
    });
    const { director, show } = boot(env);
    await click(document);
    const lastMs = walkOn(window, show);
    push(stack, drums(120, WARM_S, RATE));
    assert.equal(show.dancing, true, 'the drums were never heard');
    const contexts = stack.log.contexts.length;
    const home = show.punks.map((punk) => [punk.state, punk.x]);

    window.listeners.keydown(press({ key: 'r' }));
    assert.deepEqual([show.dancing, show.tier, director.tier], [false, 0, 0], 'still dancing');
    assert.equal(document.elements.label.textContent, 'break');
    // The microphone is not restarted and the punks are not sent to the wings.
    assert.equal(stack.log.contexts.length, contexts, 'capture was restarted');
    assert.deepEqual(
      show.punks.map((punk) => [punk.state, punk.x]),
      home,
      'the punks were sent back to the wings',
    );

    // It has to hear the drums all over again, from nothing.
    push(stack, drums(120, 5, RATE));
    assert.equal(document.elements.label.textContent, 'break', 'it remembered the song');
    assert.match(firstLine(document), /^state\s+break\s+tier 0$/);
    assert.match(
      document.elements.overlay.textContent,
      /^dance\s+140\.0 bpm \(default\)$/m,
      'the dance tempo was kept',
    );
    // The tuning of the URL is the tuning of the URL.
    assert.match(document.elements.overlay.textContent, /^pulse\s+0\.\d{3}\s+need 0\.4 to start/m);
    push(stack, drums(120, WARM_S, RATE));
    assert.equal(show.dancing, true, 'it never heard the drums again');
  });

  it('C16: a plain r only, and it does not disturb a forced tier or the overlay', () => {
    const { document, window, env } = setup({ search: '?debug=1' });
    const { show } = boot(env);
    walkOn(window, show);
    window.listeners.keydown(press({ key: '2' }));
    assert.deepEqual([show.dancing, show.tier], [true, 2]);
    const untouched = document.elements.label.textContent;
    for (const other of [
      press({ key: 'r', ctrlKey: true }),
      press({ key: 'r', metaKey: true }),
      press({ key: 'r', altKey: true }),
      press({ key: 'r', repeat: true }),
    ]) {
      window.listeners.keydown(other);
      assert.equal(document.elements.label.textContent, untouched, JSON.stringify(other));
    }
    // A forced tier is not something it has heard, so it survives.
    window.listeners.keydown(press({ key: 'R' }));
    assert.equal(document.elements.label.textContent, 'break');
    assert.deepEqual([show.dancing, show.tier], [true, 2], 'the forced tier was reset');
    assert.equal(document.elements.overlay.hidden, false, 'the overlay was hidden');
  });

  it('unit: ?debug=1 also shows the repository link', () => {
    const { document, env } = setup({ search: '?debug=1' });
    boot(env);
    assert.equal(document.elements.repo.hidden, false);
  });

  it('C12: the worklet module URL is relative to the app and points at a real file', async () => {
    const { stack, document, env } = setup();
    boot(env);
    await click(document);
    const [url] = stack.log.modules;
    assert.ok(url instanceof URL);
    assert.ok(url.pathname.endsWith('/src/audio/worklet.js'));
    assert.ok(existsSync(fileURLToPath(url)));
  });

  it('unit: a click starts capture, hides the button, and shows break', async () => {
    const { stack, document, env } = setup();
    boot(env);
    await click(document);
    assert.equal(stack.log.contexts.length, 1);
    assert.equal(document.elements.start.hidden, true);
    assert.equal(document.elements.label.textContent, 'break');
  });

  it('unit: the word turns to music once the gate is sure, not before', async () => {
    const { stack, document, env } = setup();
    boot(env);
    await click(document);
    // Five seconds of the clearest drums there are: not yet. The default is break.
    push(stack, drums(120, 5, RATE));
    assert.equal(document.elements.label.textContent, 'break');
    push(stack, drums(120, WARM_S, RATE));
    assert.match(document.elements.label.textContent, /^music/);
  });

  it('unit: quiet frames keep the word at break', async () => {
    const { stack, document, env } = setup();
    boot(env);
    await click(document);
    push(stack, silence(4, RATE));
    assert.equal(document.elements.label.textContent, 'break');
  });

  it('unit: URL parameters reach the classifier', async () => {
    const { stack, document, env } = setup({ search: '?musicOverFloorDb=60&breakUnderFloorDb=59' });
    boot(env);
    await click(document);
    push(stack, drums(120, 4, RATE));
    assert.equal(document.elements.label.textContent, 'break', 'nothing is 60 dB over the room');
  });

  it('unit: the overlay shows live values only with ?debug=1', async () => {
    const debug = setup({ search: '?debug=1' });
    boot(debug.env);
    assert.equal(debug.document.elements.overlay.hidden, false);
    await click(debug.document);
    assert.equal(debug.document.elements.overlay.textContent, '');
    push(debug.stack, drums(120, 3, RATE));
    assert.match(
      debug.document.elements.overlay.textContent,
      /^state\s+(music|break)\s+tier \d\nlevel\s+-\d/,
    );

    const plain = setup();
    boot(plain.env);
    await click(plain.document);
    push(plain.stack, drums(120, 3, RATE));
    assert.equal(plain.document.elements.overlay.textContent, '');
  });

  it('unit: a denied microphone shows the message and the button again', async () => {
    const { stack, document, env } = setup();
    stack.control.rejectMedia = namedError('NotAllowedError', 'Permission denied');
    boot(env);
    await click(document);
    assert.equal(document.elements.start.hidden, false);
    assert.match(document.elements.label.textContent, /denied/);
  });

  it('unit: another failure shows its message', async () => {
    const { stack, document, env } = setup();
    stack.control.rejectModule = new Error('cannot load module');
    boot(env);
    await click(document);
    assert.equal(document.elements.start.hidden, false);
    assert.equal(document.elements.label.textContent, 'error: cannot load module');
  });

  it('unit: a page without the expected elements fails loudly', () => {
    const { env } = setup({ missing: ['start'] });
    assert.throws(() => boot(env), /missing element #start/);
  });
});
