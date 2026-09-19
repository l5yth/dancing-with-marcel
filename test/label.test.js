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
import { debugLabel } from '../src/classify/label.js';

describe('debugLabel', () => {
  it('unit: a break is just the word', () => {
    assert.equal(debugLabel('break'), 'break');
    assert.equal(debugLabel('break', 180), 'break');
  });

  it('unit: music without a locked tempo is just the word', () => {
    assert.equal(debugLabel('music'), 'music');
    assert.equal(debugLabel('music', null), 'music');
  });

  it('unit: music with a tempo carries the rounded number', () => {
    assert.equal(debugLabel('music', 120), 'music (120 bpm)');
    assert.equal(debugLabel('music', 179.6), 'music (180 bpm)');
    assert.match(debugLabel('music', 137.4), /^music \(\d+ bpm\)$/);
  });
});
