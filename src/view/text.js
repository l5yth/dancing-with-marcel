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
 * @file Text shown on the page: the debug word, capture status messages, and
 * the `?debug=1` overlay. Placeholder wording; design is deferred (SPEC D10).
 */

/**
 * The debug word for a classifier state (SPEC D2). Bucket B4 adds the tempo.
 *
 * @param {State} state Classifier state.
 * @returns {string} `break` or `music`.
 */
export function debugLabel(state) {
  return state;
}

/**
 * Message for a capture status that is not `running`.
 *
 * @param {CaptureStatus} status Capture status.
 * @param {string} [detail] Failure message, when there is one.
 * @returns {string} The message; empty for `running`.
 */
export function statusText(status, detail = '') {
  switch (status) {
    case 'idle':
      return 'click start';
    case 'starting':
      return 'starting';
    case 'running':
      return '';
    case 'denied':
      return 'microphone access denied. click start to retry';
    default:
      return `error: ${detail}`;
  }
}

/**
 * Text of the `?debug=1` overlay.
 *
 * @param {number} levelDb Smoothed level in dBFS.
 * @param {State} state Classifier state.
 * @param {Config} config Active configuration.
 * @returns {string} Four lines: level, state, and the two switch rules.
 */
export function overlayText(levelDb, state, config) {
  return [
    `level ${levelDb.toFixed(1)} dB`,
    `state ${state}`,
    `music: at least ${config.musicDb} dB for ${config.musicEnterMs} ms`,
    `break: at most ${config.breakDb} dB for ${config.breakHoldMs} ms`,
  ].join('\n');
}
