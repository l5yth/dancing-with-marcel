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
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Files under a directory that match a pattern.
 *
 * @param {string} dir Directory relative to the repository root.
 * @param {RegExp} pattern File name pattern.
 * @returns {string[]} Paths relative to the repository root.
 */
function filesUnder(dir, pattern) {
  return readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true })
    .map(String)
    .filter((name) => pattern.test(name))
    .map((name) => `${dir}/${name}`);
}

describe('sources', () => {
  // The coverage report lists only files a test loaded, so a module no test
  // touches would slip past the 100% gate. This closes that hole.
  it('B2: every source module is imported or spawned by a test', () => {
    const modules = [...filesUnder('src', /\.js$/), ...filesUnder('scripts', /\.mjs$/)];
    assert.ok(modules.length > 0);
    const tests = filesUnder('test', /\.js$/)
      .map((path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
      .join('\n');
    for (const path of modules) {
      assert.ok(tests.includes(path), `no test references ${path}`);
    }
  });
});
