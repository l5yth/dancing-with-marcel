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
 * @file The stage (SPEC F2, F3; ACCEPTANCE C16, C22): the grid fitted to the
 * window, and the show drawn into it as nodes, a class for every accent.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Show, STAGE } from '../src/classify/show.js';
import { PALETTE, SPRITES } from '../src/sprites/asciipunk.js';
import { Stage } from '../src/view/stage.js';
import { createFakeDocument, pictureOf } from './helpers/fakes.js';

/**
 * A stage over a fake page.
 *
 * @param {{width: number, height: number}} [cell] Size of a character cell at 100px.
 * @returns {{stage: Stage, document: any}} The stage and the page it draws into.
 */
function setup(cell) {
  const document = createFakeDocument(cell ? { cell } : undefined);
  const stage = new Stage({ element: document.elements.stage, document });
  return { stage, document };
}

/**
 * The probes a page has made to measure a cell.
 *
 * @param {any} document The fake page.
 * @returns {any[]} The probe elements.
 */
function probes(document) {
  return document.created.filter((/** @type {any} */ node) => node.id === 'pre');
}

describe('stage', () => {
  it('C16: the grid is fitted to the window, whatever its shape', () => {
    for (const [width, height] of [
      [1920, 1080],
      [1080, 1920],
      [800, 600],
      [3840, 2160],
      [4000, 400],
    ]) {
      const { stage } = setup();
      const size = stage.fit(width, height);
      // A cell is 0.60 of the font size across and 0.88 down, as the fake reports.
      assert.ok(STAGE.cols * size * 0.6 <= width + 1e-9, `${width}x${height} too wide`);
      assert.ok(STAGE.rows * size * 0.88 <= height + 1e-9, `${width}x${height} too tall`);
      const fills =
        Math.abs(STAGE.cols * size * 0.6 - width) < 1e-6 ||
        Math.abs(STAGE.rows * size * 0.88 - height) < 1e-6;
      assert.ok(fills, `${width}x${height} leaves room on both axes`);
    }
  });

  it('C22: on a projector the stage is bound by width, and sits as a band', () => {
    const { stage, document } = setup();
    const size = stage.fit(1920, 1080);
    assert.ok(Math.abs(STAGE.cols * size * 0.6 - 1920) < 1e-6, 'it does not fill the width');
    assert.ok(Number.parseFloat(document.elements.stage.style.height) < 1080 / 2);
  });

  it('C16: the cell is measured from the page, not assumed', () => {
    const wide = setup({ width: 120, height: 88 }).stage.fit(1920, 1080);
    const narrow = setup({ width: 60, height: 88 }).stage.fit(1920, 1080);
    assert.ok(wide < narrow, 'a wider font gets a smaller size');
  });

  it('C16: the probe is added to the page, read, removed, and measured once', () => {
    const { stage, document } = setup();
    stage.fit(1920, 1080);
    assert.equal(probes(document).length, 1);
    assert.equal(probes(document)[0].removed, true);
    assert.equal(document.body.children.length, 1);
    stage.fit(1280, 720);
    assert.equal(probes(document).length, 1, 'the font did not change');
  });

  it('C16: the probe carries the stage font, or it would measure the wrong grid', () => {
    const { stage, document } = setup();
    document.elements.stage.className = 'sheet';
    stage.fit(1920, 1080);
    const [probe] = probes(document);
    assert.equal(probe.className, 'sheet');
    assert.equal(probe.style.fontSize, '100px');
    assert.equal(probe.textContent.split('\n')[0].length, STAGE.cols);
  });

  it('C16: a tiny window still gets a usable font size', () => {
    const { stage } = setup();
    assert.ok(stage.fit(0, 0) >= 1);
  });

  it('C16: the box is the whole grid, so right-trimmed rows do not shift anybody', () => {
    const { stage, document } = setup();
    const size = stage.fit(1920, 1080);
    const style = document.elements.stage.style;
    assert.equal(style.width, `${STAGE.cols * 0.6 * size}px`);
    assert.equal(style.height, `${STAGE.rows * 0.88 * size}px`);
  });

  it('C22: the stage is a line for every row, and a blank row still holds one space', () => {
    const { stage, document } = setup();
    assert.equal(document.elements.stage.children.length, STAGE.rows);
    assert.equal(stage.draw([]), STAGE.rows);
    assert.equal(pictureOf(document.elements.stage), Array(STAGE.rows).fill(' ').join('\n'));
  });

  it('C22: a run carries the class of its mask letter, and a white run carries none', () => {
    const { stage, document } = setup();
    const show = new Show({ random: () => 0.99 });
    // Billy's bleached hair is the only colour on him.
    stage.draw([show.place(SPRITES.billy, 'billy', 'idle_a', 1, 24)]);
    const nodes = document.elements.stage.children.flatMap(
      (/** @type {any} */ line) => line.children,
    );
    const coloured = nodes.filter((/** @type {any} */ node) => node.nodeType !== 3);
    const white = nodes.filter((/** @type {any} */ node) => node.nodeType === 3);
    assert.ok(coloured.length > 0, 'nothing is coloured');
    assert.ok(white.length > 0, 'nothing is white');
    for (const node of coloured) {
      assert.equal(node.id, 'span');
      assert.equal(node.className, 'y');
      assert.ok(node.className in PALETTE);
      assert.notEqual(node.textContent.trim(), '');
    }
    for (const node of white) {
      assert.equal('className' in node, false, 'white is plain text');
    }
    // What is drawn is the sprite, row for row.
    const drawn = pictureOf(document.elements.stage).split('\n');
    for (const [at, row] of SPRITES.billy.idle_a.rows.entries()) {
      assert.equal(drawn[STAGE.floor - 15 + at].trim(), row.trim(), `row ${at}`);
    }
  });

  it('C22: only the rows that changed are built again', () => {
    const { stage, document } = setup();
    const show = new Show({ random: () => 0.99 });
    const cat = { sprite: { rows: ['=^.^='], mask: [''] }, left: 3, top: STAGE.floor };
    stage.draw([cat]);
    const lines = document.elements.stage.children;
    const before = lines.map((/** @type {any} */ line) => line.children);
    assert.equal(stage.draw([cat]), 0, 'the same picture was built again');
    assert.equal(stage.draw([{ ...cat, left: 4 }]), 1);
    for (const [at, line] of lines.entries()) {
      assert.equal(line.children === before[at], at !== STAGE.floor, `row ${at}`);
    }
    assert.equal(lines[STAGE.floor].textContent, '    =^.^=');
    assert.ok(stage.draw(show.placements()) >= 1, 'the cat is still there');
  });

  it('C22: the art arrives as text, never as markup', () => {
    const { stage, document } = setup();
    const sprite = { rows: ['<b>&amp;</b>'], mask: ['   rrrrr'] };
    stage.draw([{ sprite, left: 0, top: 0 }]);
    const [first, second, third] = document.elements.stage.children[0].children;
    assert.deepEqual([first.nodeType, first.textContent], [3, '<b>']);
    assert.deepEqual([second.className, second.textContent], ['r', '&amp;']);
    assert.deepEqual([third.nodeType, third.textContent], [3, '</b>']);
    // No module that ships writes markup at all.
    const shipped = readdirSync(new URL('../src/', import.meta.url), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.js'));
    assert.ok(shipped.length > 10);
    for (const name of shipped) {
      const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, name);
    }
  });
});
