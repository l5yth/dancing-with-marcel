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
import { after, describe, it } from 'node:test';
import { createAudioStack, createFakeDocument } from './helpers/fakes.js';

// The entry module reads browser globals; give it fakes before it loads.
const stack = createAudioStack();
const page = createFakeDocument();
const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: stack.mediaDevices },
  configurable: true,
  writable: true,
});
Object.assign(globalThis, {
  document: page,
  location: { search: '' },
  AudioContext: stack.AudioContext,
  AudioWorkletNode: stack.AudioWorkletNode,
});

await import('../src/main.js');

after(() => {
  if (savedNavigator) {
    Object.defineProperty(globalThis, 'navigator', savedNavigator);
  }
  for (const name of ['document', 'location', 'AudioContext', 'AudioWorkletNode']) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('main', () => {
  it('unit: importing the entry module boots the app against the page globals', () => {
    assert.equal(typeof page.elements.start.listeners.click, 'function');
    assert.equal(page.elements.overlay.hidden, true);
  });
});
