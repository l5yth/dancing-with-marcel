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
      clipped: 0,
      floorDb: -58.5,
      flatness: 0.42,
      bass: 0.71,
      swing: 1.284,
      pulse: 0.2168,
      state: 'music',
      bpm: 179.6,
      confidence: 0.44,
      danceBpm: 179.6,
      locked: true,
    };
    const cast = 'billy headbang, mo pogo, spike off, cat';
    const lines = overlayText(event, DEFAULTS, 3, cast).split('\n');
    assert.equal(lines[0], 'state    music   tier 3');
    assert.match(lines[1], /^level\s+-31\.2 dB\s+floor -58\.5 dB\s+need -46\.5 dB$/);
    assert.doesNotMatch(lines[1], /CLIPPING/, 'a warning that is always there is no warning');
    assert.match(lines[2], /^swing\s+1\.28 dB\s+need at least 0\.1$/);
    // The question that decides, with both of its bars.
    assert.match(lines[3], /^pulse\s+0\.217\s+need 0\.15 to start, 0\.09 to stay$/);
    assert.match(lines[4], /^tempo\s+180 bpm at 0\.44\s+need 0\.15$/);
    // Still measured, no longer asked: a bar beside them would be a lie.
    assert.match(lines[5], /^timbre\s+flatness 0\.42\s+bass 0\.71\s+\(shown, not asked\)$/);
    assert.equal(lines[6], 'dance    179.6 bpm');
    // Three of them now, so who does what has a line of its own.
    assert.equal(lines[7], `punks    ${cast}`);
    assert.equal(lines.length, 8);
  });

  it('C20: the overlay warns when the input is clipping, and says how much', () => {
    // Nothing downstream can undo it: the peaks the onsets are read from are
    // flattened and the level stops reporting the room. The owner's first
    // song recording was 46% clipped and the page said nothing.
    /** @type {PipelineEvent} */
    const event = {
      time: 3,
      levelDb: -0.2,
      clipped: 0,
      floorDb: -40,
      flatness: 0.3,
      bass: 0.6,
      swing: 2,
      pulse: 0.3,
      state: 'music',
      bpm: 160,
      confidence: 0.5,
      danceBpm: 160,
      locked: true,
    };
    const level = (/** @type {number} */ clipped) =>
      overlayText({ ...event, clipped }, DEFAULTS, 3, 'cast').split('\n')[1];
    assert.doesNotMatch(level(0), /CLIPPING/);
    assert.match(level(0.46), /CLIPPING 46%, turn the gain down$/);
    assert.match(level(0.004), /CLIPPING 0%, turn the gain down$/, 'one pinned sample is clipping');
    assert.match(level(1), /CLIPPING 100%, turn the gain down$/);
    // The rest of the line is what it was.
    assert.match(level(0.46), /^level\s+-0\.2 dB\s+floor -40\.0 dB\s+need -28\.0 dB\s+CLIPPING/);
  });

  it('C23: the overlay says when a tier is forced, and for how many whole seconds', () => {
    /** @type {PipelineEvent} */
    const event = {
      time: 40,
      levelDb: -20,
      clipped: 0,
      floorDb: -60,
      flatness: 0.3,
      bass: 0.6,
      swing: 2,
      pulse: 0.3,
      state: 'music',
      bpm: 160,
      confidence: 0.5,
      danceBpm: 160,
      locked: true,
    };
    const line = (/** @type {Forced | null} */ forced) =>
      overlayText(
        event,
        DEFAULTS,
        forced?.tier ?? 3,
        'billy idle, mo sway, spike sneer',
        forced,
      ).split('\n')[0];
    assert.equal(line(null), 'state    music   tier 3');
    assert.equal(line({ tier: 1, leftMs: 30000 }), 'state    music   tier 1 (forced, 30 s left)');
    assert.equal(line({ tier: 1, leftMs: 28001 }), 'state    music   tier 1 (forced, 29 s left)');
    assert.equal(line({ tier: 0, leftMs: 1 }), 'state    music   tier 0 (forced, 1 s left)');
    assert.equal(line({ tier: 2, leftMs: 999 }), 'state    music   tier 2 (forced, 1 s left)');
    // Never 0 while it holds, and the other lines are as they were.
    assert.doesNotMatch(line({ tier: 2, leftMs: 1 }), /0 s left/);
    assert.equal(
      overlayText(event, DEFAULTS, 1, 'cast', { tier: 1, leftMs: 5000 })
        .split('\n')
        .slice(1)
        .join('\n'),
      overlayText(event, DEFAULTS, 1, 'cast').split('\n').slice(1).join('\n'),
    );
  });

  it('unit: the overlay says when no tempo has been found and the dance speed is a guess', () => {
    /** @type {PipelineEvent} */
    const event = {
      time: 1,
      levelDb: -60,
      clipped: 0,
      floorDb: -60,
      flatness: 1,
      bass: 0,
      swing: 0,
      pulse: 0,
      state: 'break',
      bpm: null,
      confidence: 0,
      danceBpm: DEFAULTS.defaultBpm,
      locked: false,
    };
    const lines = overlayText(event, DEFAULTS, 0, 'billy smoke, mo tv, spike lace').split('\n');
    assert.match(lines[0], /^state\s+break\s+tier 0$/);
    assert.match(lines[2], /^swing\s+0\.00 dB/);
    assert.match(lines[3], /^pulse\s+0\.000/);
    assert.match(lines[4], /^tempo\s+none bpm at 0\.00/);
    assert.equal(lines[6], 'dance    140.0 bpm (default)');
  });
});
