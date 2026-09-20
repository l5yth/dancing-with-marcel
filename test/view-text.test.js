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
import { DEFAULTS } from '../src/config.js';
import { overlayText, statusText } from '../src/view/text.js';

describe('view text', () => {
  it('unit: every capture status that has something to say has a message', () => {
    // `running` is not among them: the type excludes it, because the label is
    // the classifier's from then on.
    assert.equal(statusText('idle'), 'click start');
    assert.equal(statusText('starting'), 'starting');
    assert.match(statusText('denied'), /denied.*retry/);
    assert.equal(statusText('error', 'no device'), 'error: no device');
    assert.equal(statusText('error'), 'error: ');
  });

  it('unit: the overlay shows every measurement next to the threshold it must clear', () => {
    /** @type {PipelineEvent} */
    const event = {
      time: 12,
      levelDb: -31.234,
      floorDb: -58.5,
      flatness: 0.42,
      bass: 0.71,
      flux: 1.23,
      onsets: 37,
      state: 'music',
      bpm: 179.6,
      confidence: 0.44,
      danceBpm: 179.6,
      locked: true,
    };
    const lines = overlayText(event, DEFAULTS, 'headbang').split('\n');
    assert.equal(lines[0], 'state    music   scene headbang');
    assert.match(lines[1], /^level\s+-31\.2 dB\s+floor -58\.5 dB\s+need -46\.5 dB$/);
    assert.match(lines[2], /^flatness 0\.42\s+need at most 0\.6$/);
    assert.match(lines[3], /^bass\s+0\.71\s+need at least 0\.15$/);
    assert.match(lines[4], /^onsets\s+37 of them, loudest 1\.23\s+need 4 over 0\.1$/);
    assert.match(lines[5], /^tempo\s+180 bpm at 0\.44\s+need 0\.3$/);
    assert.equal(lines[6], 'dance    179.6 bpm');
  });

  it('unit: the overlay says when no tempo has been found and the dance speed is a guess', () => {
    /** @type {PipelineEvent} */
    const event = {
      time: 1,
      levelDb: -60,
      floorDb: -60,
      flatness: 1,
      bass: 0,
      flux: 0,
      onsets: 0,
      state: 'break',
      bpm: null,
      confidence: 0,
      danceBpm: DEFAULTS.defaultBpm,
      locked: false,
    };
    const lines = overlayText(event, DEFAULTS, 'smoke').split('\n');
    assert.match(lines[0], /^state\s+break\s+scene smoke$/);
    assert.match(lines[5], /^tempo\s+none bpm at 0\.00/);
    assert.equal(lines[6], 'dance    140.0 bpm (default)');
  });
});
