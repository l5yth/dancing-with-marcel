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

// The worklet module runs in an AudioWorkletGlobalScope; fake the two names it needs.
const registered = [];
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = {
      posted: [],
      postMessage(data, transfer) {
        this.posted.push({ data, transfer });
      },
    };
  }
};
globalThis.registerProcessor = (name, processor) => {
  registered.push({ name, processor });
};
await import('../src/audio/worklet.js');

/**
 * Feed a ramp to a fresh processor in quanta of a given size.
 *
 * @param {number} total Total samples.
 * @param {number} quantum Samples per call to `process`.
 * @returns {{ processor: any, ramp: Float32Array }} The processor and the input.
 */
function feed(total, quantum) {
  const processor = new registered[0].processor();
  const ramp = Float32Array.from({ length: total }, (_, index) => index);
  for (let offset = 0; offset < total; offset += quantum) {
    assert.equal(processor.process([[ramp.subarray(offset, offset + quantum)]]), true);
  }
  return { processor, ramp };
}

describe('worklet', () => {
  it('C12: registers one processor named marcel-frames', () => {
    assert.equal(registered.length, 1);
    assert.equal(registered[0].name, 'marcel-frames');
  });

  it('C12: 128-sample quanta regroup into exact 512-sample frames with no drop or duplicate', () => {
    const { processor, ramp } = feed(10000, 128);
    const posted = processor.port.posted;
    assert.equal(posted.length, Math.floor(10000 / 512));
    for (const { data } of posted) {
      assert.equal(data.length, 512);
    }
    const joined = Float32Array.from(posted.flatMap(({ data }) => [...data]));
    assert.deepEqual(joined, ramp.subarray(0, posted.length * 512));
  });

  it('C12: quanta that do not divide 512 still regroup exactly', () => {
    const { processor, ramp } = feed(3000, 100);
    const posted = processor.port.posted;
    assert.equal(posted.length, Math.floor(3000 / 512));
    const joined = Float32Array.from(posted.flatMap(({ data }) => [...data]));
    assert.deepEqual(joined, ramp.subarray(0, posted.length * 512));
  });

  it('C12: each frame is posted with its buffer transferred', () => {
    const { processor } = feed(1024, 128);
    for (const { data, transfer } of processor.port.posted) {
      assert.equal(transfer[0], data.buffer);
    }
  });

  it('C12: a missing input is tolerated', () => {
    const processor = new registered[0].processor();
    assert.equal(processor.process([]), true);
    assert.equal(processor.process([[]]), true);
    assert.equal(processor.port.posted.length, 0);
  });
});
