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
import { createAudioStack, createFakeDocument, namedError } from './helpers/fakes.js';

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
  const env = {
    document,
    location: { search },
    navigator: { mediaDevices: stack.mediaDevices },
    AudioContext: stack.AudioContext,
    AudioWorkletNode: stack.AudioWorkletNode,
  };
  return { stack, document, env };
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

/**
 * Post frames of a constant sample value, like the worklet would.
 *
 * @param {any} stack The fake audio stack.
 * @param {number} count Number of 512-sample frames.
 * @param {number} value Sample value; 0.5 is -6 dBFS, 0 is silence.
 */
function push(stack, count, value) {
  const { port } = stack.log.nodes[0];
  for (let index = 0; index < count; index += 1) {
    port.onmessage({ data: new Float32Array(512).fill(value) });
  }
}

describe('app', () => {
  it('unit: the page starts idle: button shown, overlay hidden', () => {
    const { document, env } = setup();
    boot(env);
    assert.equal(document.elements.start.hidden, false);
    assert.equal(document.elements.overlay.hidden, true);
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

  it('unit: loud frames turn the word to music after musicEnterMs, not before', async () => {
    const { stack, document, env } = setup();
    boot(env);
    await click(document);
    push(stack, 90, 0.5);
    assert.equal(document.elements.label.textContent, 'break');
    push(stack, 10, 0.5);
    assert.equal(document.elements.label.textContent, 'music');
  });

  it('unit: quiet frames keep the word at break', async () => {
    const { stack, document, env } = setup();
    boot(env);
    await click(document);
    push(stack, 300, 0);
    assert.equal(document.elements.label.textContent, 'break');
  });

  it('unit: URL parameters reach the gate', async () => {
    const { stack, document, env } = setup({ search: '?musicEnterMs=0' });
    boot(env);
    await click(document);
    push(stack, 1, 0.5);
    assert.equal(document.elements.label.textContent, 'music');
  });

  it('unit: the overlay shows live values only with ?debug=1', async () => {
    const debug = setup({ search: '?debug=1' });
    boot(debug.env);
    assert.equal(debug.document.elements.overlay.hidden, false);
    await click(debug.document);
    push(debug.stack, 9, 0.5);
    assert.equal(debug.document.elements.overlay.textContent, '');
    push(debug.stack, 1, 0.5);
    assert.match(debug.document.elements.overlay.textContent, /level -6\.0 dB\nstate break/);

    const plain = setup();
    boot(plain.env);
    await click(plain.document);
    push(plain.stack, 20, 0.5);
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
