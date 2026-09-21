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
import { PALETTE } from '../src/sprites/asciipunk.js';
import { collectCss, declarations, findViolations, stripComments } from './helpers/monochrome.js';

const read = (/** @type {string} */ path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * Every file under a directory whose name matches.
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

describe('monochrome', () => {
  it('A6: the shipped CSS uses only #000, #fff and the five accents, and the HTML no accent', () => {
    const sheets = filesUnder('src', /\.css$/);
    assert.ok(sheets.length >= 1);
    for (const path of sheets) {
      assert.deepEqual(findViolations(read(path), Object.values(PALETTE)), [], path);
    }
    assert.deepEqual(findViolations(collectCss(read('index.html'))), [], 'index.html');
  });

  it('A6: an accent reaches the page only as the class of its mask letter', () => {
    // One rule a letter, `.sheet .y { color: … }`, holding the sheet's own
    // value: a stylesheet that drifts from PALETTE, or spends an accent on
    // anything that is not a sprite's mask, fails here.
    const css = stripComments(read('src/style.css'));
    // Anchored to the start of a rule: `a:hover, .sheet .p { … }` would spend
    // the lipstick on a link and still hold the right value.
    const rules = [
      ...css.matchAll(/(?<=^|\})\s*\.sheet \.([a-z])\s*\{\s*color:\s*(#[0-9a-f]{6});\s*\}/g),
    ];
    assert.deepEqual(Object.fromEntries(rules.map((rule) => [rule[1], rule[2]])), { ...PALETTE });
    const accents = Object.values(PALETTE);
    const spent = declarations(css).filter(({ value }) =>
      accents.some((accent) => value.toLowerCase().includes(accent)),
    );
    assert.equal(spent.length, accents.length, 'an accent is used outside its mask class');
  });

  it('A6: an accent nobody vouches for is still a violation', () => {
    assert.equal(findViolations('p { color: #ffd21e; }').length, 1);
    assert.deepEqual(findViolations('p { color: #FFD21E; }', ['#ffd21e']), []);
    assert.equal(findViolations('p { color: #ffd21f; }', ['#ffd21e']).length, 1);
    assert.equal(findViolations('p { border-color: gold; }', ['#ffd21e']).length, 1);
  });

  it('A6: links are given the foreground color, since a browser would make them blue', () => {
    const css = stripComments(read('src/style.css'));
    assert.match(css, /(^|[\s,}])a\s*\{[^}]*color:\s*var\(--fg\)/);
  });

  it('A6: the shipped stylesheet actually defines both colors', () => {
    const css = stripComments(read('src/style.css'));
    assert.match(css, /--fg:\s*#fff/);
    assert.match(css, /--bg:\s*#000/);
  });

  it('A6: JavaScript never sets colors or effects', () => {
    const forbidden =
      /\.style\.(color|background|backgroundColor|border|borderColor|outline|fill|stroke|opacity|filter)|setProperty\(['"](color|background|border|outline|fill|stroke|opacity|filter)/;
    for (const path of filesUnder('src', /\.js$/)) {
      assert.doesNotMatch(read(path), forbidden, path);
    }
  });

  it('A6: the checker flags greys, alpha, gradients, shadows, and filters', () => {
    for (const css of [
      'p { color: #888; }',
      'p { color: #FFFFFE; }',
      'p { color: rgba(0, 0, 0, 0.5); }',
      'p { color: hsl(0 0% 50%); }',
      'p { background: linear-gradient(#000, #fff); }',
      'p { background: radial-gradient(#000, #fff); }',
      'p { opacity: 0.5; }',
      'p { filter: blur(2px); }',
      'p { box-shadow: 0 0 4px #fff; }',
      'p { text-shadow: 0 0 4px #fff; }',
      'p { color: gray; }',
      'p { border: 1px solid #ccc; }',
      'p { border-color: silver; }',
      'p { --accent: #123456; }',
      'p { -webkit-mask-image: none; }',
      'p { background: url(./photo.png); }',
    ]) {
      assert.equal(findViolations(css).length, 1, css);
    }
  });

  it('A6: the checker accepts black, white, variables, and non-color properties', () => {
    for (const css of [
      ':root { --fg: #fff; --bg: #000; }',
      ':root { --FG: #FFFFFF; }',
      'p { color: var(--fg); background: var(--bg); }',
      'p { color: WHITE; background: black; }',
      'p { border: 2px solid var(--fg); outline: 0; }',
      'p { background: transparent; color: currentColor; }',
      'body { font-family: ui-monospace, "DejaVu Sans Mono", monospace; }',
      'a:hover { text-decoration: underline; }',
      'p { --font: ui-monospace, monospace; }',
      '/* color: red */ p { margin: 0; }',
      '@font-face { font-family: marcel; src: url(./marcel.woff2); }',
    ]) {
      assert.deepEqual(findViolations(css), [], css);
    }
  });

  it('A6: style blocks and style attributes in HTML are checked', () => {
    const html = '<style>p { color: #888 }</style><p style="opacity: .5; color: #fff">x</p>';
    assert.equal(collectCss(html).length > 0, true);
    assert.equal(findViolations(collectCss(html)).length, 2);
    assert.equal(collectCss('<p>plain</p>'), '');
  });
});
