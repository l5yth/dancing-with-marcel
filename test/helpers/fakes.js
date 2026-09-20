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
 * @file Hand-written fakes of the browser audio stack and the page, for unit
 * tests (SPEC D9: no jsdom).
 */

/**
 * An error with a chosen name, like the DOMException a browser rejects with.
 *
 * @param {string} name Error name, for example `NotAllowedError`.
 * @param {string} message Error message.
 * @returns {Error} The error.
 */
export function namedError(name, message) {
  return Object.assign(new Error(message), { name });
}

/**
 * Build a fake audio stack. Fields of `control` are read at call time, so a
 * test can change them between calls.
 *
 * @returns {object} `control`, `log`, and the constructors and devices to inject.
 */
export function createAudioStack() {
  const control = {
    rejectMedia: /** @type {unknown} */ (null),
    rejectModule: /** @type {unknown} */ (null),
    closeThrows: false,
    initialState: 'running',
  };
  const log = {
    order: /** @type {string[]} */ ([]),
    contexts: /** @type {any[]} */ ([]),
    nodes: /** @type {any[]} */ ([]),
    streams: /** @type {any[]} */ ([]),
    sources: /** @type {any[]} */ ([]),
    constraints: /** @type {any[]} */ ([]),
    modules: /** @type {any[]} */ ([]),
  };

  class FakeAudioContext {
    constructor() {
      this.state = control.initialState;
      this.sampleRate = 48000;
      this.closed = false;
      this.resumed = false;
      this.audioWorklet = {
        addModule: async (/** @type {unknown} */ url) => {
          log.order.push('module');
          if (control.rejectModule) {
            throw control.rejectModule;
          }
          log.modules.push(url);
        },
      };
      log.order.push('context');
      log.contexts.push(this);
    }

    createMediaStreamSource(/** @type {unknown} */ stream) {
      const source = {
        stream,
        connected: /** @type {unknown[]} */ ([]),
        connect(/** @type {unknown} */ node) {
          this.connected.push(node);
        },
      };
      log.sources.push(source);
      return source;
    }

    async resume() {
      this.resumed = true;
      this.state = 'running';
    }

    async close() {
      if (control.closeThrows) {
        throw new Error('already closed');
      }
      this.closed = true;
    }
  }

  class FakeWorkletNode {
    constructor(
      /** @type {unknown} */ context,
      /** @type {string} */ name,
      /** @type {unknown} */ options,
    ) {
      this.context = context;
      this.name = name;
      this.options = options;
      this.port = { onmessage: /** @type {any} */ (null) };
      log.nodes.push(this);
    }
  }

  const mediaDevices = {
    async getUserMedia(/** @type {unknown} */ constraints) {
      log.order.push('media');
      log.constraints.push(constraints);
      if (control.rejectMedia) {
        throw control.rejectMedia;
      }
      const track = {
        onended: /** @type {null | (() => void)} */ (null),
        stopped: 0,
        stop() {
          this.stopped += 1;
        },
      };
      const stream = {
        track,
        get stopped() {
          return track.stopped;
        },
        getTracks() {
          return [track];
        },
      };
      log.streams.push(stream);
      return stream;
    },
  };

  return {
    control,
    log,
    mediaDevices,
    AudioContext: FakeAudioContext,
    AudioWorkletNode: FakeWorkletNode,
  };
}

/**
 * Timers a test drives by hand: nothing fires until the clock is advanced.
 *
 * @returns {any} The timers, plus `advance` and a list of what is pending.
 */
export function createFakeTimers() {
  /** @type {{at: number, run: () => void, handle: number}[]} */
  let pending = [];
  let now = 0;
  let next = 1;
  return {
    get pending() {
      return pending;
    },
    now: () => now,
    setTimeout(/** @type {() => void} */ run, /** @type {number} */ delayMs) {
      const handle = next++;
      pending.push({ at: now + delayMs, run, handle });
      return handle;
    },
    clearTimeout(/** @type {number} */ handle) {
      pending = pending.filter((timer) => timer.handle !== handle);
    },
    /**
     * Move the clock forward, running whatever comes due.
     *
     * @param {number} ms How far to move.
     * @returns {number} How many timers fired.
     */
    advance(ms) {
      now += ms;
      let fired = 0;
      for (let due = pending.filter((t) => t.at <= now); due.length > 0; ) {
        pending = pending.filter((timer) => !due.includes(timer));
        for (const timer of due) {
          timer.run();
          fired += 1;
        }
        due = pending.filter((timer) => timer.at <= now);
      }
      return fired;
    },
  };
}

/**
 * A page whose visibility a test controls, and a wake lock that records what
 * happened to it.
 *
 * @param {{hidden?: boolean, refuse?: boolean}} [options] Whether the page starts
 *   hidden, and whether the browser refuses the lock.
 * @returns {any} The visibility, the wake lock, and the locks it handed out.
 */
export function createFakeScreen({ hidden = false, refuse = false } = {}) {
  const locks = [];
  /** @type {(() => void)[]} */
  const listeners = [];
  return {
    locks,
    visibility: {
      hidden,
      addEventListener(/** @type {string} */ type, /** @type {() => void} */ listener) {
        if (type === 'visibilitychange') {
          listeners.push(listener);
        }
      },
    },
    wakeLock: {
      async request(/** @type {string} */ type) {
        if (refuse) {
          throw new Error('denied by the browser');
        }
        const lock = { type, released: false };
        locks.push(lock);
        return lock;
      },
    },
    /**
     * Show or hide the page, telling whoever is listening.
     *
     * @param {boolean} isHidden Whether the page is now hidden.
     * @returns {void}
     */
    setHidden(isHidden) {
      this.visibility.hidden = isHidden;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/**
 * A fake page with the three elements the app looks up.
 *
 * @param {object} [options] Options.
 * @param {string[]} [options.missing] Ids to leave out.
 * @returns {object} `elements` by id and a `getElementById` like the real one.
 */
export function createFakeDocument({ missing = [], cell = { width: 60, height: 88 } } = {}) {
  /** @type {Record<string, any>} */
  const elements = {};
  /**
   * A page element with the few fields the app and the stage touch.
   *
   * @param {string} id Element id.
   * @returns {any} The element.
   */
  const make = (id) => ({
    id,
    className: '',
    hidden: false,
    textContent: '',
    style: /** @type {Record<string, string>} */ ({}),
    listeners: /** @type {Record<string, () => unknown>} */ ({}),
    addEventListener(/** @type {string} */ type, /** @type {() => unknown} */ listener) {
      this.listeners[type] = listener;
    },
    remove() {
      this.removed = true;
    },
    getBoundingClientRect() {
      // The probe renders `cols` characters across and ten rows down, scaled
      // from the 100px the stage measures at.
      const size = Number.parseFloat(this.style.fontSize ?? '100') / 100;
      const cols = (this.textContent.split('\n')[0] ?? '').length;
      const lines = this.textContent === '' ? 0 : this.textContent.split('\n').length;
      return { width: cols * cell.width * size, height: lines * cell.height * size };
    },
  });
  for (const id of ['start', 'label', 'panel', 'overlay', 'repo', 'stage']) {
    if (!missing.includes(id)) {
      elements[id] = make(id);
    }
  }
  const created = [];
  return {
    elements,
    created,
    hidden: false,
    addEventListener(/** @type {string} */ _type, /** @type {() => void} */ _listener) {
      // The app passes the page to the capture as its visibility source.
    },
    body: {
      children: /** @type {any[]} */ ([]),
      appendChild(/** @type {any} */ node) {
        this.children.push(node);
      },
    },
    createElement(/** @type {string} */ tag) {
      const node = make(tag);
      created.push(node);
      return node;
    },
    getElementById: (/** @type {string} */ id) => elements[id] ?? null,
  };
}

/**
 * A fake browser window: a fixed viewport, collected listeners, and animation
 * frames that only run when a test asks for them.
 *
 * @param {{innerWidth?: number, innerHeight?: number}} [size] Viewport size.
 * @returns {any} The window, with `runFrame` to advance the animation.
 */
export function createFakeWindow({ innerWidth = 1920, innerHeight = 1080 } = {}) {
  /** @type {((elapsedMs: number) => void)[]} */
  const pending = [];
  return {
    innerWidth,
    innerHeight,
    listeners: /** @type {Record<string, () => void>} */ ({}),
    addEventListener(/** @type {string} */ type, /** @type {() => void} */ listener) {
      this.listeners[type] = listener;
    },
    requestAnimationFrame(/** @type {(elapsedMs: number) => void} */ callback) {
      pending.push(callback);
      return pending.length;
    },
    /**
     * Run the frame that is waiting, if any.
     *
     * @param {number} elapsedMs Timestamp to hand the callback.
     * @returns {boolean} Whether a frame ran.
     */
    runFrame(elapsedMs) {
      const next = pending.shift();
      next?.(elapsedMs);
      return next !== undefined;
    },
  };
}
