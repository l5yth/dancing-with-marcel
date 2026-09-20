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
import { browserTimers } from '../src/audio/timers.js';

describe('browser timers', () => {
  it('C12: a timer runs after its delay', async () => {
    const ran = await new Promise((resolve) => {
      browserTimers.setTimeout(() => resolve(true), 1);
    });
    assert.equal(ran, true);
  });

  it('C12: a cancelled timer never runs', async () => {
    let ran = false;
    const handle = browserTimers.setTimeout(() => {
      ran = true;
    }, 1);
    browserTimers.clearTimeout(handle);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(ran, false);
  });
});
