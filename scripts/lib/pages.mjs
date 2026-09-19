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
 * @file Serve the repository under the GitHub Pages project path and fetch
 * every URL the page loads (ACCEPTANCE A8). A root-absolute or external URL
 * works on a local server and is dead on Friday; this catches it.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

/** URL prefix GitHub Pages uses for this project site. */
export const BASE_PATH = '/dancing-with-marcel/';

/**
 * @typedef {object} Result
 * @property {string} url Path (or full URL for an external reference) that was requested.
 * @property {number} status HTTP status; 0 for an external URL that was not fetched.
 * @property {string} type Content type; `external` for an external URL.
 */

/**
 * The part of an HTTP server the check uses.
 *
 * @typedef {object} StaticServer
 * @property {Function} address Where the server listens.
 * @property {Function} close Stop listening.
 * @property {Function} closeAllConnections Drop open connections.
 */

/**
 * Content types the static server sends, by file extension.
 *
 * @type {Record<string, string>}
 */
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Content type for a file, from its extension.
 *
 * @param {string} file File path.
 * @returns {string} A content type; `application/octet-stream` when unknown.
 */
export function contentType(file) {
  return CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
}

/**
 * Map a request path to a file under `root`, or `null` when the path is
 * outside the project prefix or escapes `root`.
 *
 * @param {string} root Absolute repository root, without a trailing separator.
 * @param {string} pathname Decoded request path.
 * @returns {string | null} Absolute file path, or `null`.
 */
export function resolveRequest(root, pathname) {
  if (!pathname.startsWith(BASE_PATH)) {
    return null;
  }
  let relative = pathname.slice(BASE_PATH.length);
  if (relative === '' || relative.endsWith('/')) {
    relative += 'index.html';
  }
  const file = normalize(join(root, relative));
  return file.startsWith(root + sep) ? file : null;
}

/**
 * Start a static server for `root`, answering only under {@link BASE_PATH}.
 *
 * @param {string} root Absolute repository root, without a trailing separator.
 * @returns {Promise<StaticServer>} The listening server, on a free port of 127.0.0.1.
 */
export function serve(root) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const file = resolveRequest(root, decodeURIComponent(url.pathname));
      if (file === null) {
        throw new Error('outside the project path');
      }
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': contentType(file) });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * URLs an HTML page loads: every `src` and `href`, minus fragments and data URIs.
 *
 * @param {string} html HTML source.
 * @returns {string[]} References as written.
 */
export function htmlReferences(html) {
  return [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => !ref.startsWith('#') && !ref.startsWith('data:'));
}

/**
 * URLs a stylesheet loads: `url(...)` and `@import`, minus data URIs.
 *
 * @param {string} css CSS source.
 * @returns {string[]} References as written.
 */
export function cssReferences(css) {
  return [...css.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1] ?? match[2])
    .filter((ref) => !ref.startsWith('data:'));
}

/**
 * Patterns that find module specifiers: static `import` and `export ... from`,
 * side-effect `import`, dynamic `import()`, and `new URL(..., import.meta.url)`.
 *
 * @type {RegExp[]}
 */
const MODULE_PATTERNS = [
  /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bnew URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
];

/**
 * Specifiers a JavaScript module loads.
 *
 * @param {string} source JavaScript source.
 * @returns {string[]} Specifiers as written.
 */
export function moduleReferences(source) {
  return MODULE_PATTERNS.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]),
  );
}

/**
 * References found in a response body, by content type.
 *
 * @param {string} type Content type.
 * @param {string} body Response body.
 * @returns {string[]} References as written; empty for other types.
 */
function referencesIn(type, body) {
  if (type.includes('html')) {
    return htmlReferences(body);
  }
  if (type.includes('javascript')) {
    return moduleReferences(body);
  }
  if (type.includes('css')) {
    return cssReferences(body);
  }
  return [];
}

/**
 * Fetch the page and everything it loads, following HTML, CSS, and module
 * references. An external URL is recorded, not fetched.
 *
 * @param {string} origin Origin of the server, for example `http://127.0.0.1:8080`.
 * @param {FetchFunction} [fetchFn] Fetch implementation.
 * @returns {Promise<Result[]>} One result per distinct URL, in discovery order.
 */
export async function crawl(origin, fetchFn = fetch) {
  /** @type {Result[]} */
  const results = [];
  const seen = new Set();
  const queue = [new URL(BASE_PATH, origin)];
  for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
    if (seen.has(url.href)) {
      continue;
    }
    seen.add(url.href);
    if (url.origin !== origin) {
      results.push({ url: url.href, status: 0, type: 'external' });
      continue;
    }
    const response = await fetchFn(url);
    const type = response.headers.get('content-type') ?? '';
    results.push({ url: url.pathname, status: response.status, type });
    if (response.status === 200) {
      for (const ref of referencesIn(type, await response.text())) {
        queue.push(new URL(ref, url));
      }
    }
  }
  return results;
}

/**
 * Turn results into human-readable problems.
 *
 * @param {Result[]} results Output of {@link crawl}.
 * @returns {string[]} One line per problem; empty when all is well.
 */
export function problemsIn(results) {
  /** @type {string[]} */
  const problems = [];
  for (const { url, status, type } of results) {
    if (type === 'external') {
      problems.push(`external URL: ${url}`);
    } else if (status !== 200) {
      problems.push(`${status} ${url}`);
    } else if (!url.startsWith(BASE_PATH)) {
      problems.push(`outside ${BASE_PATH}: ${url}`);
    } else if (/\.m?js$/.test(url) && !type.includes('javascript')) {
      problems.push(`not a JavaScript type (${type}): ${url}`);
    }
  }
  return problems;
}

/**
 * Serve the repository, crawl it, print the URLs, and report.
 *
 * @param {object} options Options.
 * @param {string} options.root Absolute repository root, without a trailing separator.
 * @param {LogFunction} [options.log] Output sink.
 * @returns {Promise<number>} Exit code: 0 when every URL is fine, 1 otherwise.
 */
export async function runPagesCheck({ root, log = console.log }) {
  const server = await serve(root);
  try {
    const address = /** @type {{port: number}} */ (server.address());
    const results = await crawl(`http://127.0.0.1:${address.port}`);
    for (const { status, url, type } of results) {
      log(`${status} ${url} ${type}`);
    }
    const problems = problemsIn(results);
    for (const problem of problems) {
      log(`problem: ${problem}`);
    }
    log(`pages: ${results.length} urls, ${problems.length} problems`);
    return problems.length === 0 ? 0 : 1;
  } finally {
    server.closeAllConnections();
    server.close();
  }
}
