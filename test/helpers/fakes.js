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
      const stream = {
        stopped: 0,
        getTracks() {
          return [
            {
              stop() {
                stream.stopped += 1;
              },
            },
          ];
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
 * A fake page with the three elements the app looks up.
 *
 * @param {object} [options] Options.
 * @param {string[]} [options.missing] Ids to leave out.
 * @returns {object} `elements` by id and a `getElementById` like the real one.
 */
export function createFakeDocument({ missing = [] } = {}) {
  /** @type {Record<string, any>} */
  const elements = {};
  for (const id of ['start', 'label', 'overlay', 'repo']) {
    if (!missing.includes(id)) {
      elements[id] = {
        id,
        hidden: false,
        textContent: '',
        listeners: /** @type {Record<string, () => unknown>} */ ({}),
        addEventListener(/** @type {string} */ type, /** @type {() => unknown} */ listener) {
          this.listeners[type] = listener;
        },
      };
    }
  }
  return { elements, getElementById: (/** @type {string} */ id) => elements[id] ?? null };
}
