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
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Capture, CONSTRAINTS, PROCESSOR_NAME } from '../src/audio/capture.js';
import { createAudioStack, namedError } from './helpers/fakes.js';

/**
 * Build a capture on a fresh fake stack.
 *
 * @returns {object} The capture, the stack, and the recorded callbacks.
 */
function setup() {
  const stack = createAudioStack();
  const frames = [];
  const statuses = [];
  const capture = new Capture({
    mediaDevices: stack.mediaDevices,
    AudioContext: stack.AudioContext,
    AudioWorkletNode: stack.AudioWorkletNode,
    workletUrl: new URL('../src/audio/worklet.js', import.meta.url),
    onFrame: (frame, sampleRate) => frames.push({ frame, sampleRate }),
    onStatus: (status, detail) => statuses.push({ status, detail }),
  });
  return { stack, capture, frames, statuses };
}

describe('capture', () => {
  it('C12: constructing a capture touches no browser API', () => {
    const { stack, capture, statuses } = setup();
    assert.equal(capture.status, 'idle');
    assert.deepEqual(stack.log.order, []);
    assert.deepEqual(statuses, []);
  });

  it('C12: the context is created and the microphone requested inside the click, before any await', () => {
    const { stack, capture } = setup();
    const started = capture.start();
    // Only the synchronous part has run: the worklet loads after the permission answer.
    assert.deepEqual(stack.log.order, ['context', 'media']);
    return started;
  });

  it('C12: start asks for the microphone once with all voice processing off, mono', async () => {
    const { stack, capture, statuses } = setup();
    await capture.start();
    assert.deepEqual(stack.log.order, ['context', 'media', 'module']);
    assert.equal(stack.log.constraints.length, 1);
    assert.deepEqual(stack.log.constraints[0], {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    assert.deepEqual(
      statuses.map((entry) => entry.status),
      ['starting', 'running'],
    );
    assert.equal(capture.status, 'running');
  });

  it('C12: the constraints are frozen', () => {
    assert.ok(Object.isFrozen(CONSTRAINTS));
    assert.ok(Object.isFrozen(CONSTRAINTS.audio));
  });

  it('C12: a second start while starting or running creates no second capture', async () => {
    const { stack, capture } = setup();
    const first = capture.start();
    const second = capture.start();
    await Promise.all([first, second]);
    await capture.start();
    assert.equal(stack.log.contexts.length, 1);
    assert.equal(stack.log.constraints.length, 1);
    assert.equal(stack.log.nodes.length, 1);
  });

  it('C12: the node is a zero-output sink of the marcel-frames processor', async () => {
    const { stack, capture } = setup();
    await capture.start();
    const [node] = stack.log.nodes;
    assert.equal(node.name, PROCESSOR_NAME);
    assert.equal(PROCESSOR_NAME, 'marcel-frames');
    assert.deepEqual(node.options, { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
    assert.deepEqual(stack.log.sources[0].connected, [node]);
    assert.equal(stack.log.modules.length, 1);
  });

  it('C12: frames reach onFrame with the context sample rate', async () => {
    const { stack, capture, frames } = setup();
    await capture.start();
    const frame = new Float32Array(512);
    stack.log.nodes[0].port.onmessage({ data: frame });
    assert.equal(frames.length, 1);
    assert.equal(frames[0].frame, frame);
    assert.equal(frames[0].sampleRate, 48000);
  });

  it('C12: a suspended context is resumed', async () => {
    const { stack, capture } = setup();
    stack.control.initialState = 'suspended';
    await capture.start();
    assert.equal(stack.log.contexts[0].resumed, true);
    assert.equal(capture.status, 'running');
  });

  it('C12: a running context is not resumed', async () => {
    const { stack, capture } = setup();
    await capture.start();
    assert.equal(stack.log.contexts[0].resumed, false);
  });

  it('C12: NotAllowedError sets denied, releases the context, and a later start retries', async () => {
    const { stack, capture, statuses } = setup();
    stack.control.rejectMedia = namedError('NotAllowedError', 'Permission denied');
    await capture.start();
    assert.equal(capture.status, 'denied');
    assert.deepEqual(statuses.at(-1), { status: 'denied', detail: 'Permission denied' });
    assert.equal(stack.log.contexts[0].closed, true);
    assert.equal(stack.log.nodes.length, 0);

    stack.control.rejectMedia = null;
    await capture.start();
    assert.equal(capture.status, 'running');
    assert.equal(stack.log.contexts.length, 2);
  });

  it('C12: other failures set error with the message and stop the stream', async () => {
    const { stack, capture, statuses } = setup();
    stack.control.rejectModule = new Error('cannot load module');
    await capture.start();
    assert.equal(capture.status, 'error');
    assert.deepEqual(statuses.at(-1), { status: 'error', detail: 'cannot load module' });
    assert.equal(stack.log.streams[0].stopped, 1);
    assert.equal(stack.log.contexts[0].closed, true);
  });

  it('C12: a failing close does not hide the original failure', async () => {
    const { stack, capture, statuses } = setup();
    stack.control.closeThrows = true;
    stack.control.rejectMedia = new Error('no device');
    await capture.start();
    assert.deepEqual(statuses.at(-1), { status: 'error', detail: 'no device' });
  });

  it('C12: a non-Error rejection is reported as text', async () => {
    const { stack, capture, statuses } = setup();
    stack.control.rejectMedia = 'boom';
    await capture.start();
    assert.deepEqual(statuses.at(-1), { status: 'error', detail: 'boom' });
  });

  it('C12: the constraint literals are present in the source', () => {
    const source = readFileSync(new URL('../src/audio/capture.js', import.meta.url), 'utf8');
    for (const literal of [
      /echoCancellation:\s*false/,
      /noiseSuppression:\s*false/,
      /autoGainControl:\s*false/,
    ]) {
      assert.match(source, literal);
    }
  });
});
