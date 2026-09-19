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
 * @file API-doc gate (SPEC D9). Biome cannot require JSDoc, so this fails on
 * any undocumented symbol in `jsdoc -X` output, on any top-level declaration in
 * `src/types/*.d.ts` without a doc comment, and on `tsc --checkJs --strict`
 * errors, which catch missing `@param` and `@returns` types.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Doclet kinds that must carry documentation. Class fields are handled separately. */
const DOCUMENTED_KINDS = new Set(['function', 'class', 'typedef', 'constant', 'namespace']);

/**
 * Where a doclet lives.
 *
 * @typedef {object} DocletMeta
 * @property {string} [path] Directory of the source file.
 * @property {string} [filename] Source file name.
 * @property {number} [lineno] Line number.
 */

/**
 * The subset of a JSDoc doclet that the check reads.
 *
 * @typedef {object} Doclet
 * @property {string} kind What the doclet documents.
 * @property {string} longname Fully qualified name.
 * @property {string} [memberof] Name of the owner, for members.
 * @property {string} [scope] `global`, `static`, `instance`, or `inner`.
 * @property {boolean} [undocumented] `true` when no doc comment was found.
 * @property {DocletMeta} [meta] Where the symbol lives.
 */

/**
 * A TypeScript declaration file.
 *
 * @typedef {object} TypeFile
 * @property {string} file Path, for messages.
 * @property {string} source Contents.
 */

/**
 * What the check reads from a finished child process.
 *
 * @typedef {object} SpawnResult
 * @property {number | null} status Exit code.
 * @property {string} stdout Standard output.
 * @property {string} stderr Standard error.
 */

/**
 * Process runner with the shape of `spawnSync`.
 *
 * @callback SpawnFunction
 * @param {string} command Executable to run.
 * @param {string[]} args Arguments.
 * @param {*} options Spawn options.
 * @returns {SpawnResult} What the child produced.
 */

/**
 * Output sink.
 *
 * @callback LogFunction
 * @param {string} line One line of output.
 * @returns {void}
 */

/**
 * Supplies the declaration files to check.
 *
 * @callback ReadTypes
 * @returns {TypeFile[]} The files.
 */

/**
 * Whether a symbol needs a doc comment: functions, classes, typedefs,
 * constants, namespaces, and class fields. Object-literal properties and
 * function-local symbols are not API.
 *
 * @param {Doclet} doclet A doclet.
 * @returns {boolean} `true` when the symbol must be documented.
 */
function needsDocs(doclet) {
  return (
    doclet.scope !== 'inner' &&
    !doclet.longname.includes('<anonymous>') &&
    (DOCUMENTED_KINDS.has(doclet.kind) || (doclet.kind === 'member' && doclet.scope === 'instance'))
  );
}

/**
 * List the symbols that lack a doc comment. JSDoc emits an undocumented twin
 * for every documented `export` and for every constructor of a documented
 * class, so a symbol counts as documented when any doclet with its name, or
 * with its class's name for a constructor, carries a comment.
 *
 * @param {Doclet[]} doclets Output of `jsdoc -X`.
 * @returns {string[]} One `file:line kind name` line per undocumented symbol.
 */
export function findUndocumented(doclets) {
  const fileOf = (/** @type {Doclet} */ doclet) =>
    `${doclet.meta?.path ?? ''}/${doclet.meta?.filename ?? ''}`;
  const documented = new Set(
    doclets
      .filter((doclet) => doclet.undocumented !== true)
      .map((doclet) => `${fileOf(doclet)}:${doclet.longname}`),
  );
  return doclets
    .filter((doclet) => {
      if (doclet.undocumented !== true || !needsDocs(doclet)) {
        return false;
      }
      const isConstructor = doclet.kind === 'class' && doclet.scope === 'instance';
      const owner = isConstructor ? (doclet.memberof ?? doclet.longname) : doclet.longname;
      return !documented.has(`${fileOf(doclet)}:${owner}`);
    })
    .map(
      (doclet) =>
        `${doclet.meta?.filename ?? '?'}:${doclet.meta?.lineno ?? 0} ${doclet.kind} ${doclet.longname}`,
    );
}

/**
 * List the top-level declarations in a `.d.ts` file that lack a doc comment
 * on the line above. Members inside a declaration are left to review.
 *
 * @param {TypeFile} typeFile One declaration file.
 * @returns {string[]} One `file:line declaration` line per undocumented declaration.
 */
export function findUndocumentedDeclarations({ file, source }) {
  const lines = source.split('\n');
  return lines.flatMap((line, index) =>
    /^(?:declare |export )*(?:type|interface|class|function|const|enum) \w+/.test(line) &&
    !/\*\/\s*$/.test(lines[index - 1] ?? '')
      ? [`${file}:${index + 1} ${line.trim()}`]
      : [],
  );
}

/**
 * Read every `.d.ts` file in a directory.
 *
 * @param {string} dir Directory to read.
 * @returns {TypeFile[]} The files.
 */
export function readTypeFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.d.ts'))
    .map((name) => ({ file: join(dir, name), source: readFileSync(join(dir, name), 'utf8') }));
}

/**
 * Run the documentation gate.
 *
 * @param {object} options Options.
 * @param {string} options.toolsDir Directory that holds the `jsdoc` and `tsc` executables.
 * @param {SpawnFunction} [options.spawn] Process runner.
 * @param {LogFunction} [options.log] Output sink.
 * @param {ReadTypes} [options.readTypes] Supplies the declaration files; defaults to `src/types`.
 * @returns {number} Exit code: 0 when nothing is undocumented and the types check, 1 otherwise.
 */
export function runDocsCheck({
  toolsDir,
  spawn = /** @type {SpawnFunction} */ (/** @type {unknown} */ (spawnSync)),
  log = console.log,
  readTypes = () => readTypeFiles('src/types'),
}) {
  const jsdoc = spawn(`${toolsDir}/jsdoc`, ['-c', 'jsdoc.json', '-X'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (jsdoc.status !== 0) {
    log(`jsdoc failed:\n${jsdoc.stderr}`);
    return 1;
  }
  const missing = [
    ...findUndocumented(JSON.parse(jsdoc.stdout)),
    ...readTypes().flatMap(findUndocumentedDeclarations),
  ];
  for (const line of missing) {
    log(`missing docs: ${line}`);
  }
  log(`undocumented: ${missing.length}`);
  const tsc = spawn(`${toolsDir}/tsc`, ['--noEmit', '-p', 'jsconfig.json'], { encoding: 'utf8' });
  if (tsc.status !== 0) {
    log(`tsc failed:\n${tsc.stdout}${tsc.stderr}`);
  }
  return missing.length === 0 && tsc.status === 0 ? 0 : 1;
}
