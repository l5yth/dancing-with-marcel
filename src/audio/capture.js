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
 * @file Click-gated microphone capture (SPEC D6). Every browser dependency is
 * injected, so the module runs against fakes in unit tests. Resilience
 * (retry, watchdog, wake lock) arrives in bucket B5.
 */

/**
 * Microphone constraints: all browser voice processing off, mono. Echo
 * cancellation, noise suppression, and automatic gain distort music level and
 * tempo (SPEC D6).
 */
export const CONSTRAINTS = Object.freeze({
  audio: Object.freeze({
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  }),
});

/** Name under which `worklet.js` registers its processor. */
export const PROCESSOR_NAME = 'marcel-frames';

/** One microphone capture: an audio context, a stream, and a worklet node. */
export class Capture {
  /**
   * Create an idle capture. Nothing touches the browser until `start`.
   *
   * @param {CaptureDeps} deps Injected browser dependencies and callbacks.
   */
  constructor(deps) {
    /**
     * Injected browser dependencies and callbacks.
     * @type {CaptureDeps}
     */
    this.deps = deps;
    /**
     * Current lifecycle status.
     * @type {CaptureStatus}
     */
    this.status = 'idle';
  }

  /**
   * Record a status change and tell the caller.
   *
   * @param {CaptureStatus} status The new status.
   * @param {string} [detail] Failure message, when there is one.
   * @returns {void}
   */
  setStatus(status, detail) {
    this.status = status;
    this.deps.onStatus(status, detail);
  }

  /**
   * Start capturing. Call it from a click handler: the audio context is
   * created and the microphone requested synchronously, before the first
   * `await`, so the click counts as the user gesture the autoplay policy needs.
   * A call while starting or running does nothing. After `denied` or `error`
   * it may be called again to retry.
   *
   * @returns {Promise<void>} Resolves once the status is `running`, `denied`, or `error`.
   */
  async start() {
    if (this.status === 'starting' || this.status === 'running') {
      return;
    }
    this.setStatus('starting');
    /** @type {AudioContext | null} */
    let context = null;
    /** @type {MediaStream | null} */
    let stream = null;
    try {
      context = new this.deps.AudioContext();
      stream = await this.deps.mediaDevices.getUserMedia(CONSTRAINTS);
      await context.audioWorklet.addModule(this.deps.workletUrl);
      const node = new this.deps.AudioWorkletNode(context, PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
      });
      const { sampleRate } = context;
      node.port.onmessage = (event) => this.deps.onFrame(event.data, sampleRate);
      context.createMediaStreamSource(stream).connect(node);
      if (context.state === 'suspended') {
        await context.resume();
      }
      this.setStatus('running');
    } catch (error) {
      if (stream !== null) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      if (context !== null) {
        try {
          await context.close();
        } catch {
          // Already closed: nothing left to release.
        }
      }
      const failure = error instanceof Error ? error : new Error(String(error));
      this.setStatus(failure.name === 'NotAllowedError' ? 'denied' : 'error', failure.message);
    }
  }
}
