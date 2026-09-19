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
 * @file AudioWorklet module (SPEC D6). Regroups the 128-sample render quanta
 * into fixed 512-sample frames and posts each frame to the main thread, so live
 * capture and the offline eval see identical framing. It imports nothing: not
 * every browser resolves imports inside worklet modules.
 */

/** Samples per frame posted to the main thread. */
const FRAME_SIZE = 512;

/** Collects mono input into fixed-size frames. */
class FrameProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /**
     * Frame being filled.
     * @type {Float32Array}
     */
    this.frame = new Float32Array(FRAME_SIZE);
    /**
     * Samples already in the frame being filled.
     * @type {number}
     */
    this.filled = 0;
  }

  /**
   * Consume one render quantum.
   *
   * @param {Float32Array[][]} inputs Input buses, each a list of channels.
   * @returns {boolean} Always `true`: keep the processor alive.
   */
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }
    let offset = 0;
    while (offset < channel.length) {
      const count = Math.min(FRAME_SIZE - this.filled, channel.length - offset);
      this.frame.set(channel.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === FRAME_SIZE) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(FRAME_SIZE);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('marcel-frames', FrameProcessor);
