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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BASE_PATH,
  contentType,
  crawl,
  cssReferences,
  htmlReferences,
  moduleReferences,
  problemsIn,
  resolveRequest,
  runPagesCheck,
  serve,
} from '../scripts/lib/pages.mjs';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** @type {string[]} */
const made = [];

after(() => Promise.all(made.map((dir) => rm(dir, { recursive: true, force: true }))));

/**
 * Write a throwaway site.
 *
 * @param {Record<string, string>} files Body by relative path.
 * @returns {Promise<string>} The site root.
 */
async function makeSite(files) {
  const root = await mkdtemp(join(tmpdir(), 'marcel-pages-'));
  made.push(root);
  for (const [name, body] of Object.entries(files)) {
    const file = join(root, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  return root;
}

/**
 * Run the pages check on a throwaway site.
 *
 * @param {Record<string, string>} files Body by relative path.
 * @returns {Promise<{ code: number, lines: string[] }>} Exit code and log.
 */
async function check(files) {
  const root = await makeSite(files);
  /** @type {string[]} */
  const lines = [];
  const code = await runPagesCheck({ root, log: (line) => lines.push(line) });
  return { code, lines };
}

describe('pages check', () => {
  it('A8: the base path is the GitHub Pages project path', () => {
    assert.equal(BASE_PATH, '/dancing-with-marcel/');
  });

  it('A8: contentType maps extensions and falls back to octet-stream', () => {
    assert.match(contentType('a.html'), /^text\/html/);
    assert.match(contentType('a.js'), /^text\/javascript/);
    assert.match(contentType('a.mjs'), /^text\/javascript/);
    assert.match(contentType('a.css'), /^text\/css/);
    assert.match(contentType('a.json'), /^application\/json/);
    assert.match(contentType('a.txt'), /^text\/plain/);
    assert.equal(contentType('a.bin'), 'application/octet-stream');
  });

  it('A8: resolveRequest maps paths under the prefix and refuses the rest', () => {
    const root = '/site';
    assert.equal(resolveRequest(root, '/dancing-with-marcel/'), '/site/index.html');
    assert.equal(resolveRequest(root, '/dancing-with-marcel/src/'), '/site/src/index.html');
    assert.equal(resolveRequest(root, '/dancing-with-marcel/src/main.js'), '/site/src/main.js');
    assert.equal(resolveRequest(root, '/src/main.js'), null);
    assert.equal(resolveRequest(root, '/dancing-with-marcel'), null);
    assert.equal(resolveRequest(root, '/dancing-with-marcel/../secret'), null);
    assert.equal(resolveRequest(root, '/dancing-with-marcel/src/../../etc/passwd'), null);
  });

  it('A8: htmlReferences finds src and href, minus fragments and data URIs', () => {
    const html =
      '<link href="./a.css"><script src="./b.js"></script><a href="#top">x</a><img src="data:image/png;base64,AA">';
    assert.deepEqual(htmlReferences(html), ['./a.css', './b.js']);
  });

  it('A8: cssReferences finds url() and @import, minus data URIs', () => {
    const css =
      'a { background: url(./a.png) } b { background: url("./b.png") } c { background: url(data:image/png;base64,AA) } @import "./c.css";';
    assert.deepEqual(cssReferences(css), ['./a.png', './b.png', './c.css']);
  });

  it('A8: moduleReferences finds every kind of specifier', () => {
    const source = [
      "import { a } from './a.js';",
      'import {',
      '  b,',
      "} from '../b.js';",
      "export { c } from './c.js';",
      "import './side-effect.js';",
      "const d = await import('./d.js');",
      "const w = new URL('./worklet.js', import.meta.url);",
      "const notAnImport = 'import from x';",
    ].join('\n');
    assert.deepEqual(moduleReferences(source).sort(), [
      '../b.js',
      './a.js',
      './c.js',
      './d.js',
      './side-effect.js',
      './worklet.js',
    ]);
  });

  it('A8: problemsIn names every kind of problem and stays quiet on a clean crawl', () => {
    assert.deepEqual(
      problemsIn([
        { url: '/dancing-with-marcel/', status: 200, type: 'text/html' },
        { url: '/dancing-with-marcel/a.js', status: 200, type: 'text/javascript' },
      ]),
      [],
    );
    assert.deepEqual(
      problemsIn([
        { url: 'https://example.com/x.js', status: 0, type: 'external' },
        { url: '/dancing-with-marcel/missing.js', status: 404, type: 'text/plain' },
        { url: '/elsewhere/a.css', status: 200, type: 'text/css' },
        { url: '/dancing-with-marcel/a.js', status: 200, type: 'text/plain' },
      ]),
      [
        'external URL: https://example.com/x.js',
        '404 /dancing-with-marcel/missing.js',
        'outside /dancing-with-marcel/: /elsewhere/a.css',
        'not a JavaScript type (text/plain): /dancing-with-marcel/a.js',
      ],
    );
  });

  it('A8: crawl tolerates a response without a content type', async () => {
    const fakeFetch = async () => new Response('body', { status: 200 });
    const results = await crawl('http://127.0.0.1:1', /** @type {typeof fetch} */ (fakeFetch));
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 200);
  });

  it('A8: the server answers 404 for directories, other prefixes, and bad encodings', async () => {
    const root = await makeSite({ 'index.html': '<p>hi</p>', 'src/a.js': 'export {};' });
    const server = await serve(root);
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    try {
      const status = async (/** @type {string} */ path) =>
        (await fetch(`http://127.0.0.1:${port}${path}`)).status;
      assert.equal(await status('/dancing-with-marcel/'), 200);
      assert.equal(await status('/dancing-with-marcel/src/a.js'), 200);
      assert.equal(await status('/dancing-with-marcel/src'), 404);
      assert.equal(await status('/src/a.js'), 404);
      assert.equal(await status('/dancing-with-marcel/%E0%A4%A'), 404);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it('A8: a site with only relative URLs passes and lists every URL it loaded', async () => {
    const { code, lines } = await check({
      'index.html':
        '<link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script>',
      'app.js':
        "import { x } from './lib.js';\nexport const w = new URL('./w.js', import.meta.url);",
      'lib.js': 'export const x = 1;',
      'w.js': 'export {};',
      'style.css': 'body { background: url(./bg.txt); }',
      'bg.txt': 'x',
    });
    assert.equal(code, 0);
    assert.equal(lines.at(-1), 'pages: 6 urls, 0 problems');
    for (const path of ['index.html', 'app.js', 'lib.js', 'w.js', 'style.css', 'bg.txt']) {
      const url = path === 'index.html' ? BASE_PATH : `${BASE_PATH}${path}`;
      assert.ok(
        lines.some((line) => line.startsWith(`200 ${url} `)),
        url,
      );
    }
  });

  it('A8: a URL referenced twice is fetched once', async () => {
    const { code, lines } = await check({
      'index.html': '<script src="./a.js"></script><script src="./b.js"></script>',
      'a.js': "import './shared.js';",
      'b.js': "import './shared.js';",
      'shared.js': 'export {};',
    });
    assert.equal(code, 0);
    assert.equal(lines.filter((line) => line.includes('/shared.js')).length, 1);
    assert.equal(lines.at(-1), 'pages: 4 urls, 0 problems');
  });

  it('A8: missing, root-absolute, and external references fail the check', async () => {
    const { code, lines } = await check({
      'index.html':
        '<script src="./missing.js"></script><script src="/root-absolute.js"></script><script src="https://example.com/x.js"></script>',
    });
    assert.equal(code, 1);
    assert.ok(lines.includes('problem: 404 /dancing-with-marcel/missing.js'));
    assert.ok(lines.includes('problem: 404 /root-absolute.js'));
    assert.ok(lines.includes('problem: external URL: https://example.com/x.js'));
    assert.equal(lines.at(-1), 'pages: 4 urls, 3 problems');
  });

  it('A8: the check:pages entry passes on this repository and reaches the worklet', () => {
    const result = spawnSync(process.execPath, [join(REPO, 'scripts/check-pages.mjs')], {
      cwd: REPO,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^200 \/dancing-with-marcel\/ text\/html/m);
    assert.match(result.stdout, /^200 \/dancing-with-marcel\/src\/main\.js text\/javascript/m);
    assert.match(
      result.stdout,
      /^200 \/dancing-with-marcel\/src\/audio\/worklet\.js text\/javascript/m,
    );
    assert.match(result.stdout, /^200 \/dancing-with-marcel\/src\/style\.css text\/css/m);
    assert.match(result.stdout, /^pages: \d+ urls, 0 problems$/m);
  });
});
