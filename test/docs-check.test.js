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
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  findUndocumented,
  findUndocumentedDeclarations,
  readTypeFiles,
  runDocsCheck,
  TYPE_DIRS,
} from '../scripts/lib/docs-check.mjs';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** @type {string[]} */
const made = [];

after(() => Promise.all(made.map((dir) => rm(dir, { recursive: true, force: true }))));

/**
 * A fake process runner that hands out canned results in order.
 *
 * @param {object[]} results Results to return, one per call.
 * @returns {{ spawn: any, calls: { command: string, args: string[] }[] }} The runner and its call log.
 */
function fakeSpawn(results) {
  const calls = [];
  const spawn = (/** @type {string} */ command, /** @type {string[]} */ args) => {
    calls.push({ command, args });
    return results.shift();
  };
  return { spawn, calls };
}

describe('docs check', () => {
  it('B3: findUndocumented lists undocumented API symbols and ignores twins and noise', () => {
    const at = (/** @type {string} */ filename, /** @type {number} */ lineno) => ({
      path: '/repo/src',
      filename,
      lineno,
    });
    const doclets = [
      // A documented function and the undocumented twin JSDoc emits for `export`.
      { kind: 'function', longname: 'a', scope: 'global', meta: at('x.js', 3) },
      { kind: 'function', longname: 'a', scope: 'global', undocumented: true, meta: at('x.js', 3) },
      // A function nobody documented.
      { kind: 'function', longname: 'b', scope: 'global', undocumented: true, meta: at('x.js', 9) },
      // Function-local symbol, anonymous callback, object-literal property, other kind.
      { kind: 'member', longname: 'c~d', scope: 'inner', undocumented: true, meta: at('x.js', 5) },
      {
        kind: 'function',
        longname: '<anonymous>~cb',
        scope: 'static',
        undocumented: true,
        meta: at('x.js', 6),
      },
      {
        kind: 'member',
        longname: 'T.key',
        scope: 'static',
        undocumented: true,
        meta: at('x.js', 7),
      },
      { kind: 'package', longname: 'package:undefined', undocumented: true },
      // A documented class: its constructor twin is fine, an undocumented field is not.
      { kind: 'class', longname: 'K', scope: 'global', meta: at('x.js', 20) },
      {
        kind: 'class',
        longname: 'K#K',
        memberof: 'K',
        scope: 'instance',
        undocumented: true,
        meta: at('x.js', 22),
      },
      {
        kind: 'member',
        longname: 'K#field',
        memberof: 'K',
        scope: 'instance',
        undocumented: true,
        meta: at('x.js', 23),
      },
      // An element write such as `this.ring[index] = x` is not a declaration.
      {
        kind: 'member',
        longname: 'K#ring[undefined]',
        memberof: 'K',
        scope: 'instance',
        undocumented: true,
        meta: at('x.js', 24),
      },
      // An undocumented class and its constructor, without location.
      { kind: 'class', longname: 'E', scope: 'global', undocumented: true },
      { kind: 'class', longname: 'E#E', scope: 'instance', undocumented: true },
      // The same name in another file is not documented by x.js.
      { kind: 'function', longname: 'a', scope: 'global', undocumented: true, meta: at('y.js', 1) },
    ];
    assert.deepEqual(findUndocumented(doclets), [
      'x.js:9 function b',
      'x.js:23 member K#field',
      '?:0 class E',
      '?:0 class E#E',
      'y.js:1 function a',
    ]);
  });

  it('B3: findUndocumentedDeclarations flags top-level declarations without a doc comment', () => {
    const source = [
      '// header',
      '',
      '/** Documented. */',
      'type A = string;',
      'type B = number;',
      '/** Documented interface. */',
      'interface C {',
      '  member: number;',
      '}',
      'declare class D {',
      '}',
      '/** Documented. */',
      'declare function f(): void;',
      'export const E = 1;',
    ].join('\n');
    assert.deepEqual(findUndocumentedDeclarations({ file: 'x.d.ts', source }), [
      'x.d.ts:5 type B = number;',
      'x.d.ts:10 declare class D {',
      'x.d.ts:14 export const E = 1;',
    ]);
  });

  it('B3: a declaration on the very first line has no doc comment above it', () => {
    assert.deepEqual(findUndocumentedDeclarations({ file: 'y.d.ts', source: 'type A = 1;' }), [
      'y.d.ts:1 type A = 1;',
    ]);
  });

  it('B3: readTypeFiles reads only the .d.ts files of the directories it is given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'marcel-types-'));
    made.push(dir);
    await writeFile(join(dir, 'a.d.ts'), 'type A = 1;');
    await writeFile(join(dir, 'b.txt'), 'ignored');
    await writeFile(join(dir, 'c.d.ts'), 'type C = 1;');
    const files = readTypeFiles([dir]).sort((left, right) => left.file.localeCompare(right.file));
    assert.deepEqual(files, [
      { file: join(dir, 'a.d.ts'), source: 'type A = 1;' },
      { file: join(dir, 'c.d.ts'), source: 'type C = 1;' },
    ]);
  });

  it('B3: the real declaration files of every type directory are documented', () => {
    assert.deepEqual(TYPE_DIRS, ['src/types', 'scripts/types']);
    const files = readTypeFiles(TYPE_DIRS.map((dir) => join(REPO, dir)));
    assert.ok(files.length >= 3);
    assert.deepEqual(files.flatMap(findUndocumentedDeclarations), []);
  });

  it('B3: runDocsCheck counts undocumented type declarations', () => {
    const { spawn } = fakeSpawn([
      { status: 0, stdout: '[]', stderr: '' },
      { status: 0, stdout: '', stderr: '' },
    ]);
    const lines = [];
    const code = runDocsCheck({
      toolsDir: 'tools',
      spawn,
      log: (line) => lines.push(line),
      readTypes: () => [{ file: 'src/types/x.d.ts', source: 'type T = 1;' }],
    });
    assert.equal(code, 1);
    assert.deepEqual(lines, ['missing docs: src/types/x.d.ts:1 type T = 1;', 'undocumented: 1']);
  });

  it('B3: runDocsCheck passes when nothing is undocumented and the types check', () => {
    const { spawn, calls } = fakeSpawn([
      { status: 0, stdout: '[]', stderr: '' },
      { status: 0, stdout: '', stderr: '' },
    ]);
    const lines = [];
    assert.equal(
      runDocsCheck({
        toolsDir: 'tools',
        spawn,
        log: (line) => lines.push(line),
        readTypes: () => [],
      }),
      0,
    );
    assert.deepEqual(lines, ['undocumented: 0']);
    assert.deepEqual(calls[0], { command: 'tools/jsdoc', args: ['-c', 'jsdoc.json', '-X'] });
    assert.deepEqual(calls[1], { command: 'tools/tsc', args: ['--noEmit', '-p', 'jsconfig.json'] });
  });

  it('B3: runDocsCheck fails and names every undocumented symbol', () => {
    const doclets = [
      {
        kind: 'function',
        longname: 'f',
        undocumented: true,
        scope: 'global',
        meta: { filename: 'a.js', lineno: 1 },
      },
    ];
    const { spawn } = fakeSpawn([
      { status: 0, stdout: JSON.stringify(doclets), stderr: '' },
      { status: 0, stdout: '', stderr: '' },
    ]);
    const lines = [];
    assert.equal(
      runDocsCheck({
        toolsDir: 'tools',
        spawn,
        log: (line) => lines.push(line),
        readTypes: () => [],
      }),
      1,
    );
    assert.deepEqual(lines, ['missing docs: a.js:1 function f', 'undocumented: 1']);
  });

  it('B3: runDocsCheck fails when jsdoc fails, without running tsc', () => {
    const { spawn, calls } = fakeSpawn([{ status: 1, stdout: '', stderr: 'boom' }]);
    const lines = [];
    assert.equal(
      runDocsCheck({
        toolsDir: 'tools',
        spawn,
        log: (line) => lines.push(line),
        readTypes: () => [],
      }),
      1,
    );
    assert.equal(calls.length, 1);
    assert.match(lines[0], /jsdoc failed:\nboom/);
  });

  it('B3: runDocsCheck fails when the types do not check', () => {
    const { spawn } = fakeSpawn([
      { status: 0, stdout: '[]', stderr: '' },
      { status: 2, stdout: 'error TS7006', stderr: 'more' },
    ]);
    const lines = [];
    assert.equal(
      runDocsCheck({
        toolsDir: 'tools',
        spawn,
        log: (line) => lines.push(line),
        readTypes: () => [],
      }),
      1,
    );
    assert.equal(lines[0], 'undocumented: 0');
    assert.match(lines[1], /tsc failed:\nerror TS7006more/);
  });

  it('B3: the docs:check entry runs the tools from MARCEL_TOOLS_DIR and reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'marcel-tools-'));
    made.push(dir);
    await writeFile(join(dir, 'jsdoc'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
    await writeFile(join(dir, 'tsc'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const result = spawnSync(process.execPath, [join(REPO, 'scripts/docs-check.mjs')], {
      cwd: REPO,
      env: { ...process.env, MARCEL_TOOLS_DIR: dir },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^undocumented: 0$/m);
  });
});
