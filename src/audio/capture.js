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
 * @file Click-gated microphone capture (SPEC D6), built to survive an evening
 * nobody is watching.
 *
 * Three things end a capture without saying so: the track ends when a device
 * is unplugged or taken by another program, the audio context is suspended
 * when the machine sleeps, and the browser blanks the screen. So the capture
 * restarts itself with a backoff, watches for frames that stop arriving, and
 * holds a wake lock that it takes again whenever the page is shown.
 *
 * Every browser dependency is injected, so the module runs against fakes in
 * unit tests.
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

/** How long to wait before the first retry, in milliseconds. */
export const FIRST_RETRY_MS = 1000;

/** How long the wait may grow to, in milliseconds. */
export const MAX_RETRY_MS = 10000;

/** How long frames may stop arriving before the capture is presumed dead. */
export const WATCHDOG_MS = 3000;

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
    /**
     * How long to wait before the next retry, in milliseconds.
     * @type {number}
     */
    this.retryMs = FIRST_RETRY_MS;
    /**
     * Handle of the retry or watchdog timer that is pending, or `null`.
     * @type {*}
     */
    this.timer = null;
    /**
     * The wake lock being held, or `null` when there is none.
     * @type {*}
     */
    this.wakeLock = null;
    /**
     * Whether the page has been asked to keep the screen awake.
     * @type {boolean}
     */
    this.watchingVisibility = false;
    /**
     * The audio context in use, or `null` when nothing is running.
     * @type {AudioContext | null}
     */
    this.context = null;
    /**
     * The microphone stream in use, or `null` when nothing is running.
     * @type {MediaStream | null}
     */
    this.stream = null;
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
    this.clearTimer();
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
      node.port.onmessage = (event) => {
        this.armWatchdog();
        this.deps.onFrame(event.data, sampleRate);
      };
      context.createMediaStreamSource(stream).connect(node);
      if (context.state === 'suspended') {
        await context.resume();
      }
      for (const track of stream.getTracks()) {
        track.onended = () => this.lost('the microphone was disconnected');
      }
      this.context = context;
      this.stream = stream;
      this.retryMs = FIRST_RETRY_MS;
      this.setStatus('running');
      this.armWatchdog();
      this.keepAwake();
    } catch (error) {
      this.release(stream, context);
      const failure = error instanceof Error ? error : new Error(String(error));
      if (failure.name === 'NotAllowedError') {
        // A refusal is the operator's decision, not a fault: do not retry over it.
        this.setStatus('denied', failure.message);
      } else {
        this.setStatus('error', failure.message);
        this.scheduleRetry();
      }
    }
  }

  /**
   * Let go of a stream and a context that are not going to be used.
   *
   * @param {MediaStream | null} stream The stream, if one was opened.
   * @param {AudioContext | null} context The context, if one was created.
   * @returns {void}
   */
  release(stream, context) {
    for (const track of stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    context?.close().catch(() => {
      // Already closed: nothing left to release.
    });
  }

  /**
   * The capture has stopped without saying so. Let go of it and try again.
   *
   * @param {string} why What went wrong, for the status message.
   * @returns {void}
   */
  lost(why) {
    if (this.status !== 'running') {
      return;
    }
    this.clearTimer();
    this.release(this.stream, this.context);
    this.stream = null;
    this.context = null;
    this.setStatus('error', why);
    this.scheduleRetry();
  }

  /**
   * Try again after a wait that doubles up to {@link MAX_RETRY_MS}, so a
   * microphone that is gone for the evening is not asked for every second.
   *
   * @returns {void}
   */
  scheduleRetry() {
    const wait = this.retryMs;
    this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs * 2);
    this.timer = this.deps.timers.setTimeout(() => {
      this.timer = null;
      this.start();
    }, wait);
  }

  /**
   * Restart the countdown that fires when frames stop arriving. Only while
   * capture is running: a frame still in flight when the microphone was lost
   * would otherwise take the retry's timer slot, and since `lost` returns at
   * once when the status is not `running`, nothing would ever be scheduled
   * again and the page would sit in `error` for the night.
   *
   * @returns {void}
   */
  armWatchdog() {
    if (this.status !== 'running') {
      return;
    }
    this.clearTimer();
    this.timer = this.deps.timers.setTimeout(
      () => this.lost('the microphone went quiet'),
      WATCHDOG_MS,
    );
  }

  /**
   * Cancel whichever timer is pending.
   *
   * @returns {void}
   */
  clearTimer() {
    if (this.timer !== null) {
      this.deps.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Ask the browser to keep the screen on, and ask again whenever the page is
   * shown, since a lock is dropped while the tab is hidden. A browser that
   * refuses, or has no wake lock at all, changes nothing else.
   *
   * @returns {void}
   */
  keepAwake() {
    const { wakeLock, visibility } = this.deps;
    if (wakeLock === undefined) {
      return;
    }
    const take = () => {
      if (visibility.hidden || this.status !== 'running') {
        return;
      }
      wakeLock
        .request('screen')
        .then((lock) => {
          this.wakeLock = lock;
        })
        .catch(() => {
          this.wakeLock = null;
        });
    };
    if (!this.watchingVisibility) {
      this.watchingVisibility = true;
      visibility.addEventListener('visibilitychange', take);
    }
    take();
  }
}
