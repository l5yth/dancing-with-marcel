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
import {
  Capture,
  CONSTRAINTS,
  FIRST_RETRY_MS,
  MAX_RETRY_MS,
  PROCESSOR_NAME,
  WATCHDOG_MS,
} from '../src/audio/capture.js';
import {
  createAudioStack,
  createFakeScreen,
  createFakeTimers,
  namedError,
} from './helpers/fakes.js';

/**
 * Build a capture on a fresh fake stack.
 *
 * @returns {object} The capture, the stack, and the recorded callbacks.
 */
function setup({ screen = createFakeScreen() } = {}) {
  const stack = createAudioStack();
  const timers = createFakeTimers();
  const frames = [];
  const statuses = [];
  const capture = new Capture({
    mediaDevices: stack.mediaDevices,
    AudioContext: stack.AudioContext,
    AudioWorkletNode: stack.AudioWorkletNode,
    workletUrl: new URL('../src/audio/worklet.js', import.meta.url),
    timers,
    visibility: screen.visibility,
    wakeLock: screen.wakeLock,
    onFrame: (frame, sampleRate) => frames.push({ frame, sampleRate }),
    onStatus: (status, detail) => statuses.push({ status, detail }),
  });
  return { stack, capture, frames, statuses, timers, screen };
}

/**
 * Deliver one frame, as the worklet would.
 *
 * @param {any} stack The fake audio stack.
 * @returns {void}
 */
function deliver(stack) {
  stack.log.nodes.at(-1).port.onmessage({ data: new Float32Array(512) });
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

  it('C12: a track that ends restarts the capture after the first wait', async () => {
    const { stack, capture, timers, statuses } = setup();
    await capture.start();
    stack.log.streams[0].track.onended();
    assert.equal(capture.status, 'error');
    assert.deepEqual(statuses.at(-1), {
      status: 'error',
      detail: 'the microphone was disconnected',
    });
    assert.equal(stack.log.streams[0].stopped, 1, 'the dead stream is let go');

    assert.equal(stack.log.contexts.length, 1, 'nothing yet');
    timers.advance(FIRST_RETRY_MS);
    await Promise.resolve();
    assert.equal(stack.log.contexts.length, 2, 'it tried again');
  });

  it('C12: the wait doubles to a ceiling while the microphone stays away', async () => {
    const { stack, capture, timers } = setup();
    stack.control.rejectMedia = new Error('no device');
    await capture.start();
    /** @type {number[]} */
    const waits = [];
    for (let round = 0; round < 8; round += 1) {
      const pending = timers.pending.at(-1);
      waits.push(pending.at - timers.now());
      timers.advance(pending.at - timers.now());
      await Promise.resolve();
      await Promise.resolve();
    }
    assert.deepEqual(waits.slice(0, 5), [1000, 2000, 4000, 8000, 10000]);
    assert.ok(waits.every((wait) => wait <= MAX_RETRY_MS));
  });

  it('C12: a retry that works resets the wait', async () => {
    const { stack, capture, timers } = setup();
    stack.control.rejectMedia = new Error('no device');
    await capture.start();
    timers.advance(FIRST_RETRY_MS);
    await Promise.resolve();
    assert.ok(capture.retryMs > FIRST_RETRY_MS);

    stack.control.rejectMedia = null;
    timers.advance(MAX_RETRY_MS);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(capture.status, 'running');
    assert.equal(capture.retryMs, FIRST_RETRY_MS);
  });

  it('C12: frames that stop arriving restart the capture, and frames that keep coming do not', async () => {
    assert.equal(WATCHDOG_MS, 3000, 'SPEC D6 states three seconds without frames');
    const { stack, capture, timers } = setup();
    await capture.start();
    for (let elapsed = 0; elapsed < WATCHDOG_MS * 3; elapsed += WATCHDOG_MS / 2) {
      deliver(stack);
      timers.advance(WATCHDOG_MS / 2);
    }
    assert.equal(capture.status, 'running', 'a fed capture is left alone');

    timers.advance(WATCHDOG_MS);
    assert.equal(capture.status, 'error');
    assert.equal(capture.deps.onStatus.length, 2);
    timers.advance(FIRST_RETRY_MS);
    await Promise.resolve();
    assert.equal(stack.log.contexts.length, 2);
  });

  it('C12: a capture that has already been lost is not lost twice', async () => {
    const { stack, capture, statuses } = setup();
    await capture.start();
    stack.log.streams[0].track.onended();
    const after = statuses.length;
    capture.lost('again');
    assert.equal(statuses.length, after, 'nothing more was said');
    assert.equal(stack.log.streams[0].stopped, 1, 'and the stream was stopped once');
  });

  it('C12: a refusal is not retried, since it was the operator saying no', async () => {
    const { stack, capture, timers } = setup();
    stack.control.rejectMedia = namedError('NotAllowedError', 'Permission denied');
    await capture.start();
    assert.equal(timers.pending.length, 0);
    timers.advance(MAX_RETRY_MS * 10);
    assert.equal(stack.log.contexts.length, 1);
  });

  it('C12: the screen is kept awake, and the lock taken again when the page returns', async () => {
    const screen = createFakeScreen();
    const { capture } = setup({ screen });
    await capture.start();
    await Promise.resolve();
    assert.equal(screen.locks.length, 1);
    assert.equal(screen.locks[0].type, 'screen');

    screen.setHidden(true);
    await Promise.resolve();
    assert.equal(screen.locks.length, 1, 'no point asking while hidden');

    screen.setHidden(false);
    await Promise.resolve();
    assert.equal(screen.locks.length, 2, 'asked again on the way back');
  });

  it('C12: a browser that refuses the lock, or has none, still captures', async () => {
    const refused = setup({ screen: createFakeScreen({ refuse: true }) });
    await refused.capture.start();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(refused.capture.status, 'running');
    assert.equal(refused.capture.wakeLock, null);

    const stack = createAudioStack();
    const bare = new Capture({
      mediaDevices: stack.mediaDevices,
      AudioContext: stack.AudioContext,
      AudioWorkletNode: stack.AudioWorkletNode,
      workletUrl: new URL('../src/audio/worklet.js', import.meta.url),
      timers: createFakeTimers(),
      visibility: createFakeScreen().visibility,
      onFrame: () => {},
      onStatus: () => {},
    });
    await bare.start();
    assert.equal(bare.status, 'running');
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

  it('C12: a frame in flight when the microphone is lost does not cancel the retry', async () => {
    // The watchdog and the retry share one timer slot. A frame delivered after
    // the track ended used to re-arm the watchdog over the pending retry, and
    // since `lost` returns at once when the status is not `running`, the
    // watchdog fired into nothing and the page sat in `error` for the night.
    const { stack, timers, capture } = setup();
    await capture.start();
    const [node] = stack.log.nodes;
    const [stream] = stack.log.streams;
    assert.equal(capture.status, 'running');
    stream.getTracks()[0].onended();
    assert.equal(capture.status, 'error');
    const due = timers.pending.map((timer) => timer.at);
    assert.equal(due.length, 1, 'no retry was scheduled');

    // The straggler: one frame the worklet had already posted.
    node.port.onmessage({ data: new Float32Array(512) });
    assert.deepEqual(
      timers.pending.map((timer) => timer.at),
      due,
      'the straggler took the retry slot',
    );
    timers.advance(due[0]);
    await Promise.resolve();
    assert.ok(stack.log.contexts.length >= 2, 'it never tried again');
  });
});
