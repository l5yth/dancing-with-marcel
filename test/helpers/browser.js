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
 * @file Drives a real Chromium over the DevTools protocol, with a WAV file
 * standing in for the microphone. This is the only test that exercises the
 * AudioWorklet, the permission flow, the page's own stylesheet, and the
 * project base path together; everything else runs against fakes.
 *
 * Test-only, and skipped wherever Chromium is missing.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '../../scripts/lib/pages.mjs';
import { wavBytes } from './wav.js';

/** Chromium binaries to look for, in order. */
const BROWSERS = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];

/** How long to wait for Chromium to announce its debugging port. */
const START_TIMEOUT_MS = 30000;

/**
 * The Chromium on this machine, if there is one.
 *
 * @returns {string | null} The command, or `null` when none is installed.
 */
export function findBrowser() {
  for (const command of BROWSERS) {
    if (spawnSync('command', ['-v', command], { shell: true }).status === 0) {
      return command;
    }
  }
  return null;
}

/**
 * Wait a moment.
 *
 * @param {number} ms How long.
 * @returns {Promise<void>} Resolves after that long.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What an open page offers a test.
 *
 * @typedef {object} Session
 * @property {string[]} logs Console errors and uncaught exceptions, as they arrive.
 * @property {(expression: string) => Promise<any>} evaluate Run JavaScript in the page.
 * @property {(method: string, params?: object) => Promise<any>} send Send a DevTools command.
 * @property {WebSocket | null} socket The connection, once there is one.
 * @property {() => Promise<void>} close Stop the browser and the server, and tidy up.
 */

/**
 * Serve the repository, start Chromium with a WAV for a microphone, and open
 * the page. The caller must `close()` whatever this returns.
 *
 * @param {object} options Options.
 * @param {string} options.browser Chromium command, from {@link findBrowser}.
 * @param {string} options.root Absolute repository root.
 * @param {Float32Array} options.audio What the microphone will hear, on a loop.
 * @param {number} options.sampleRate Sample rate of that audio, in Hz.
 * @param {string} [options.query] Query string to open the page with.
 * @param {{width: number, height: number}} [options.window] Window size, in pixels.
 * @returns {Promise<Session>} The open session.
 */
export async function openPage({
  browser,
  root,
  audio,
  sampleRate,
  query = '',
  window = { width: 1280, height: 800 },
}) {
  const dir = await mkdtemp(join(tmpdir(), 'marcel-browser-'));
  const wav = join(dir, 'mic.wav');
  await writeFile(wav, wavBytes(audio, sampleRate));
  const server = await serve(root);
  const { port } = /** @type {{port: number}} */ (server.address());
  const chrome = spawn(
    browser,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0',
      `--user-data-dir=${join(dir, 'profile')}`,
      `--window-size=${window.width},${window.height}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  /** @type {Session} */
  const session = {
    logs: [],
    async close() {
      session.socket?.close();
      chrome.kill();
      server.closeAllConnections();
      server.close();
      await sleep(200);
      await rm(dir, { recursive: true, force: true });
    },
    evaluate: async (expression) => {
      const answer = await session.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return answer.result.result.value;
    },
    send: () => Promise.reject(new Error('not connected')),
    socket: null,
  };

  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let said = '';
      const timer = setTimeout(
        () => reject(new Error(`${browser} never started:\n${said}`)),
        START_TIMEOUT_MS,
      );
      chrome.stderr.on('data', (chunk) => {
        said += chunk;
        const found = /DevTools listening on (ws:\/\/\S+)/.exec(said);
        if (found !== null) {
          clearTimeout(timer);
          resolve(found[1]);
        }
      });
    });
    const debugPort = new URL(wsUrl).port;
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const page = targets.find((/** @type {{type: string}} */ target) => target.type === 'page');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    session.socket = socket;
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));

    let nextId = 1;
    /** @type {Map<number, (answer: any) => void>} */
    const waiting = new Map();
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data));
      if (data.id !== undefined) {
        waiting.get(data.id)?.(data);
        waiting.delete(data.id);
      } else if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') {
        session.logs.push(data.params.entry.text);
      } else if (data.method === 'Runtime.exceptionThrown') {
        session.logs.push(String(data.params.exceptionDetails.text));
      }
    });
    session.send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = nextId++;
        waiting.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: window.width,
      height: window.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await session.send('Page.navigate', {
      url: `http://127.0.0.1:${port}/dancing-with-marcel/${query}`,
    });
    await until(() => session.evaluate('document.readyState === "complete"'), 10000);
    return session;
  } catch (failure) {
    await session.close();
    throw failure;
  }
}

/**
 * Click an element of the page, as a person would: a real mouse event, so the
 * browser counts it as the gesture the microphone needs.
 *
 * @param {Session} session The open session.
 * @param {string} id Element id.
 * @returns {Promise<void>} Resolves once the click has been delivered.
 */
export async function click(session, id) {
  const [x, y] = await session.evaluate(
    `(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
  );
  for (const type of ['mousePressed', 'mouseReleased']) {
    await session.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

/**
 * Wait for something on the page to become true.
 *
 * @param {() => Promise<unknown>} check What to poll.
 * @param {number} timeoutMs How long to keep trying.
 * @param {number} [everyMs] How often to try.
 * @returns {Promise<boolean>} Whether it became true in time.
 */
export async function until(check, timeoutMs, everyMs = 100) {
  for (let waited = 0; waited < timeoutMs; waited += everyMs) {
    if (await check()) {
      return true;
    }
    await sleep(everyMs);
  }
  return false;
}
