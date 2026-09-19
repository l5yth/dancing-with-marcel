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
import { debugLabel, overlayText, statusText } from '../src/view/text.js';

describe('view text', () => {
  it('unit: the debug word is the state', () => {
    assert.equal(debugLabel('break'), 'break');
    assert.equal(debugLabel('music'), 'music');
  });

  it('unit: every capture status has a message', () => {
    assert.equal(statusText('idle'), 'click start');
    assert.equal(statusText('starting'), 'starting');
    assert.equal(statusText('running'), '');
    assert.match(statusText('denied'), /denied.*retry/);
    assert.equal(statusText('error', 'no device'), 'error: no device');
    assert.equal(statusText('error'), 'error: ');
  });

  it('unit: the overlay shows level, state, and both switch rules', () => {
    assert.equal(
      overlayText(-31.234, 'music', DEFAULTS),
      [
        'level -31.2 dB',
        'state music',
        'music: at least -40 dB for 1000 ms',
        'break: at most -50 dB for 2000 ms',
      ].join('\n'),
    );
  });
});
