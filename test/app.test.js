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
import { BREAK_LOOPS, DANCE_LOOPS } from '../src/classify/scene.js';
import { DEFAULTS } from '../src/config.js';
import {
  createAudioStack,
  createFakeDocument,
  createFakeTimers,
  createFakeWindow,
  namedError,
} from './helpers/fakes.js';
import { drums, silence } from './helpers/synth.js';

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

describe('app', () => {
  it('unit: the page starts idle: button shown, overlay and repository link hidden', () => {
    const { document, env } = setup();
    boot(env);
    assert.equal(document.elements.start.hidden, false);
    assert.equal(document.elements.overlay.hidden, true);
    assert.equal(document.elements.repo.hidden, true);
  });

  it('C16: Marcel performs from the moment the page opens, before the microphone', () => {
    const { document, window, env } = setup();
    boot(env);
    assert.ok(Number.parseFloat(document.elements.stage.style.fontSize) > 1, 'the stage is sized');
    assert.ok(window.runFrame(0), 'an animation frame was asked for');
    assert.ok(document.elements.stage.textContent.length > 1000, 'a frame is drawn');
    assert.equal(document.elements.panel.hidden, false, 'the start button is still offered');
  });

  it('C19: the grid is measured again when the shipped face lands', async () => {
    // The cell is measured once and kept. The font does change once: the
    // shipped face arrives after the first paint, and a grid sized against
    // whatever monospace the machine had would be the wrong shape all night.
    const { document, env } = setup();
    const { stage } = boot(env);
    assert.equal(document.created.length, 1, 'measured once to begin with');
    const before = document.elements.stage.style.fontSize;

    // A taller cell in the new face. Height, because the grid is height-bound
    // on any wide window: a wider cell would change nothing and prove nothing.
    document.cell.height = 132;
    await document.loadFonts();
    assert.equal(document.created.length, 2, 'the cell was never measured again');
    assert.notEqual(document.elements.stage.style.fontSize, before);
    assert.ok(stage.cell !== null, 'the stage is left without a measurement');
  });

  it('C19: a page whose browser has no font set still draws', () => {
    const { document, window, env } = setup();
    document.fonts = undefined;
    assert.doesNotThrow(() => boot(env));
    window.runFrame(0);
    assert.ok(document.elements.stage.textContent.length > 1000);
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

  it('C16: what he performs follows what is heard', async () => {
    const { stack, document, window, env } = setup();
    const { director } = boot(env);
    await click(document);
    window.runFrame(0);
    const beforeMusic = document.elements.stage.textContent;
    assert.ok(BREAK_LOOPS.includes(director.loop), 'between songs to begin with');

    push(stack, drums(120, 4, RATE));
    window.runFrame(16);
    assert.notEqual(document.elements.stage.textContent, beforeMusic, 'the scene changed');
    assert.equal(document.elements.label.textContent.startsWith('music'), true);
    assert.ok(DANCE_LOOPS.flat().includes(director.loop), 'and it is a dance');
  });

  it('C16: the beat drives the stage, not the between-song rate', async () => {
    // The wiring, not its effects: with `dancing` false, or the dance tempo
    // replaced by the default, or the frame rate left at breakFrameMs, the
    // frames below would not advance where an eighth note says they must.
    const { stack, document, window, env } = setup();
    boot(env);
    await click(document);
    // Long enough for the tempo to lock, so the dance tempo is the detected
    // one and not the default it would fall back to.
    push(stack, drums(120, 8, RATE));

    /**
     * The frame drawn at a moment.
     *
     * @param {number} elapsedMs When to paint.
     * @returns {string} What was drawn.
     */
    const at = (elapsedMs) => {
      window.runFrame(elapsedMs);
      return document.elements.stage.textContent;
    };
    // Read the tempo he settled on rather than assuming it.
    const shown = /music \((\d+) bpm\)/.exec(document.elements.label.textContent);
    assert.ok(shown !== null, `no tempo locked: ${document.elements.label.textContent}`);
    const danceBpm = Number(shown[1]);
    assert.ok(Math.abs(danceBpm - 120) <= 4, `${danceBpm} bpm for a 120 bpm fixture`);
    assert.notEqual(danceBpm, DEFAULTS.defaultBpm, 'the default would hide a broken wiring');
    const eighth = 60000 / danceBpm / 2;
    assert.equal(at(0), at(eighth - 20), 'the frame holds inside one eighth note');
    assert.notEqual(at(0), at(eighth + 20), 'and turns over at the next');
    assert.notEqual(at(eighth + 20), at(2 * eighth + 20), 'and keeps going');
  });

  it('C16: between songs he is not hurried along by the beat', async () => {
    const { stack, document, window, env } = setup();
    boot(env);
    await click(document);
    push(stack, silence(2, RATE));
    window.runFrame(0);
    const first = document.elements.stage.textContent;
    // Odd moments as well as even ones, so a frame rate gone wrong cannot land
    // back on the same frame of a two-frame loop by luck.
    for (const elapsedMs of [3, 501, 1100, 2399]) {
      window.runFrame(elapsedMs);
      assert.equal(
        document.elements.stage.textContent,
        first,
        `the frame moved at ${elapsedMs} ms, inside one break frame`,
      );
    }
  });

  it('C16: the overlay names the scene actually being performed', async () => {
    const { stack, document, env } = setup({ search: '?debug=1' });
    const { director } = boot(env);
    await click(document);
    push(stack, drums(120, 3, RATE));
    const shown = /^state\s+\w+\s+scene (\w+)$/m.exec(document.elements.overlay.textContent);
    assert.ok(shown !== null, document.elements.overlay.textContent);
    assert.equal(shown[1], director.loop, 'the overlay is reporting a different scene');
  });

  it('C16: the scene director is given the time that really passed', async () => {
    // A hold that never elapses would leave one dance running all night.
    // Chance has to vary, or every re-pick would land on the same loop and
    // prove nothing.
    let draw = 0;
    const { stack, document, env } = setup({
      search: '?sceneHoldMs=400',
      random: () => [0, 0.35, 0.7, 0.95][draw++ % 4],
    });
    const { director } = boot(env);
    await click(document);
    push(stack, drums(120, 2, RATE));
    assert.ok(director.heldMs > 0, 'no time reached the director');
    const first = director.loop;
    let changed = false;
    for (let round = 0; round < 12 && !changed; round += 1) {
      push(stack, drums(120, 0.5, RATE));
      changed = director.loop !== first;
    }
    assert.ok(changed, 'the hold never elapsed, so the scene never moved on');
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

  it('unit: music turns the word to music after musicEnterMs, not before', async () => {
    const { stack, document, env } = setup();
    boot(env);
    await click(document);
    push(stack, drums(120, 0.8, RATE));
    assert.equal(document.elements.label.textContent, 'break');
    push(stack, drums(120, 2, RATE));
    assert.equal(document.elements.label.textContent, 'music');
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
      /^state\s+music\s+scene \w+\nlevel\s+-\d/,
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
