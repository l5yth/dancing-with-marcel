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
function setup({ search = '', missing = [] } = {}) {
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
    random: () => 0,
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

  it('C16: the stage is refitted when the window changes shape', () => {
    const { document, window, env } = setup();
    boot(env);
    const before = document.elements.stage.style.fontSize;
    window.innerWidth = 640;
    window.innerHeight = 480;
    window.listeners.resize();
    assert.notEqual(document.elements.stage.style.fontSize, before);
  });

  it('C16: the panel gets out of the way once capture runs, unless debugging', async () => {
    const plain = setup();
    boot(plain.env);
    await click(plain.document);
    assert.equal(plain.document.elements.panel.hidden, true);

    const debug = setup({ search: '?debug=1' });
    boot(debug.env);
    await click(debug.document);
    assert.equal(debug.document.elements.panel.hidden, false);
  });

  it('C16: what he performs follows what is heard', async () => {
    const { stack, document, window, env } = setup();
    boot(env);
    await click(document);
    window.runFrame(0);
    const beforeMusic = document.elements.stage.textContent;
    push(stack, drums(120, 4, RATE));
    window.runFrame(16);
    assert.notEqual(document.elements.stage.textContent, beforeMusic, 'he started dancing');
    assert.equal(document.elements.label.textContent.startsWith('music'), true);
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
