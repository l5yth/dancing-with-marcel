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
import { dirname, join, normalize } from 'node:path';
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

/**
 * Read a file of the repository.
 *
 * @param {string} path Path relative to the repository root.
 * @returns {string} Its contents.
 */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * The modules a file imports, as repository-relative paths.
 *
 * @param {string} path Path of the importing file.
 * @returns {string[]} Paths of the imported modules.
 */
function importsOf(path) {
  const source = read(path);
  return [...source.matchAll(/from\s+'(\.[^']+)'/g)]
    .map((match) => normalize(join(dirname(path), match[1])))
    .map((imported) => imported.split('\\').join('/'));
}

describe('sources', () => {
  // The coverage report lists only files a test loaded, so a module no test
  // reaches would slip past the 100% gate. A test need not name every module:
  // naming one that imports it is enough.
  it('B2: every source module is reached by a test, directly or through an import', () => {
    const modules = [...filesUnder('src', /\.js$/), ...filesUnder('scripts', /\.mjs$/)];
    // Enough of them that a search gone wrong, finding nothing, cannot pass.
    assert.ok(modules.length > 20, `only ${modules.length} modules found`);
    const tests = filesUnder('test', /\.js$/).map(read).join('\n');

    const reached = new Set(modules.filter((path) => tests.includes(path)));
    for (const path of [...reached]) {
      for (const imported of importsOf(path)) {
        reached.add(imported);
      }
    }
    // Follow imports until nothing new is reached.
    for (let grew = true; grew; ) {
      grew = false;
      for (const path of [...reached]) {
        for (const imported of importsOf(path)) {
          if (!reached.has(imported)) {
            reached.add(imported);
            grew = true;
          }
        }
      }
    }
    for (const path of modules) {
      assert.ok(reached.has(path), `no test reaches ${path}`);
    }
  });
});
