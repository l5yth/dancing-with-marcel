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
 * @file Text shown on the page: capture status messages and the `?debug=1`
 * overlay. The debug word itself comes from `classify/label.js`, which the
 * offline eval prints too. Placeholder wording; design is deferred (SPEC D10).
 */

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
 * Text of the `?debug=1` overlay: what the classifier saw and what it needs
 * to see, so a threshold can be retuned in the room without guessing.
 *
 * @param {PipelineEvent} event The latest decision.
 * @param {Readonly<Config>} config Active configuration.
 * @param {string} scene Loop Marcel is performing.
 * @returns {string} One line per measurement.
 */
export function overlayText(event, config, scene) {
  const bpm = event.bpm === null ? 'none' : `${Math.round(event.bpm)}`;
  return [
    `state    ${event.state}   scene ${scene}`,
    `level    ${event.levelDb.toFixed(1)} dB   floor ${event.floorDb.toFixed(1)} dB   need ${(event.floorDb + config.musicOverFloorDb).toFixed(1)} dB`,
    `flatness ${event.flatness.toFixed(2)}   need at most ${config.maxFlatness}`,
    `bass     ${event.bass.toFixed(2)}   need at least ${config.minBass}`,
    `onsets   ${event.onsets} of them, loudest ${event.flux.toFixed(2)}   need ${config.minOnsets} over ${config.minFlux}`,
    `tempo    ${bpm} bpm at ${event.confidence.toFixed(2)}   need ${config.tempoMinConfidence}`,
    `dance    ${event.danceBpm.toFixed(1)} bpm${event.locked ? '' : ' (default)'}`,
  ].join('\n');
}
