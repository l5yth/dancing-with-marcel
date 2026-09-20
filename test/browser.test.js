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
import { resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { click, findBrowser, openPage, until } from './helpers/browser.js';
import { concat, drums, room } from './helpers/synth.js';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RATE = 44100;
const BROWSER = findBrowser();

/** Sessions to close when the file is done, even if a test threw. */
const open = [];

after(() => Promise.all(open.map((session) => session.close())));

/**
 * Open the page with a microphone that hears a little room noise and then
 * drums, looping.
 *
 * @param {object} [options] Options.
 * @param {string} [options.query] Query string.
 * @param {{width: number, height: number}} [options.window] Window size.
 * @returns {Promise<any>} The session.
 */
async function page({ query = '', window } = {}) {
  const session = await openPage({
    browser: /** @type {string} */ (BROWSER),
    root: REPO,
    audio: concat(room(2, RATE), drums(120, 12, RATE)),
    sampleRate: RATE,
    query,
    window,
  });
  open.push(session);
  return session;
}

describe('a real browser', { skip: BROWSER === null ? 'no Chromium on PATH' : false }, () => {
  it('C17: the page is white on black and Marcel performs before the microphone is allowed', async () => {
    const session = await page();
    const look = await session.evaluate(
      `({ background: getComputedStyle(document.body).backgroundColor,
          color: getComputedStyle(document.body).color,
          drawn: document.getElementById('stage').textContent.length,
          fontSize: Number.parseFloat(document.getElementById('stage').style.fontSize),
          panel: document.getElementById('panel').hidden })`,
    );
    assert.equal(look.background, 'rgb(0, 0, 0)');
    assert.equal(look.color, 'rgb(255, 255, 255)');
    assert.ok(look.drawn > 1000, `only ${look.drawn} characters drawn`);
    assert.ok(look.fontSize > 1, `font size ${look.fontSize}`);
    assert.equal(look.panel, false, 'the start button is offered');
  });

  it('C17: the grid is fitted inside the window, in either orientation', async () => {
    for (const window of [
      { width: 1280, height: 800 },
      { width: 800, height: 1280 },
    ]) {
      const session = await page({ window });
      const box = await session.evaluate(
        `(() => { const r = document.getElementById('stage').getBoundingClientRect();
          return { width: r.width, height: r.height }; })()`,
      );
      const shape = `${window.width}x${window.height}`;
      assert.ok(box.width <= window.width + 1, `${shape}: ${box.width} wide`);
      assert.ok(box.height <= window.height + 1, `${shape}: ${box.height} tall`);
      const fills = box.width > window.width - 2 || box.height > window.height - 2;
      assert.ok(fills, `${shape}: ${box.width}x${box.height} leaves room on both axes`);
    }
  });

  it('C17: clicking start opens the microphone and he dances to what he hears', async () => {
    const session = await page({ query: '?debug=1' });
    assert.equal(
      await session.evaluate(`document.getElementById('label').textContent`),
      'click start',
    );

    await click(session, 'start');
    // The overlay is refreshed on its own cadence, so it is the slower of the
    // two to turn over; waiting for it means both have.
    const heard = await until(
      async () =>
        /^state\s+music\s+scene \w+$/m.test(
          String(await session.evaluate(`document.getElementById('overlay').textContent`)),
        ),
      20000,
    );
    assert.ok(heard, 'the drums were never heard');
    assert.match(
      String(await session.evaluate(`document.getElementById('label').textContent`)),
      /^music/,
    );

    // The worklet, the analyzer, and the classifier all really ran.
    const overlay = String(
      await session.evaluate(`document.getElementById('overlay').textContent`),
    );
    assert.match(overlay, /^state\s+music\s+scene \w+$/m);
    assert.match(overlay, /^level\s+-\d+\.\d dB\s+floor/m);
    assert.match(overlay, /^onsets\s+\d+ of them/m);

    const frames = new Set();
    for (let look = 0; look < 30; look += 1) {
      frames.add(await session.evaluate(`document.getElementById('stage').textContent.length`));
      await until(async () => false, 60);
    }
    assert.ok(frames.size > 1, 'he stood still');
    assert.deepEqual(session.logs, [], 'the console stayed quiet');
  });

  it('C19: the stage draws in the face the repository ships, and is sized for it', async () => {
    const session = await page();
    const look = await session.evaluate(
      `(async () => {
         await document.fonts.ready;
         const stage = document.getElementById('stage');
         return { family: getComputedStyle(stage).fontFamily,
                  loaded: document.fonts.check('16px "Courier Prime"'),
                  fetched: performance.getEntriesByType('resource')
                    .filter((entry) => entry.name.endsWith('.woff2'))
                    .map((entry) => entry.name),
                  width: stage.getBoundingClientRect().width,
                  height: stage.getBoundingClientRect().height };
       })()`,
    );
    // The face decides the picture: every glyph of the ramp is a different
    // brightness in Courier New, in DejaVu, and in the Courier Prime the art
    // was approved in, and the machine at the venue may have none of them.
    assert.match(look.family, /^["']?Courier Prime["']?,/, `stage font stack is ${look.family}`);
    // `fonts.check` answers true for a family nobody declared, so it cannot
    // tell a shipped face from a missing @font-face. What settles it is the
    // browser having gone and fetched the file.
    assert.equal(look.loaded, true, 'the shipped face never loaded');
    assert.ok(
      look.fetched.some((url) => url.endsWith('/src/courier-prime.woff2')),
      `the page never fetched the face: ${JSON.stringify(look.fetched)}`,
    );
    // The cell is measured once and cached, so a face that lands after the
    // first fit leaves the art sized against the wrong grid.
    assert.ok(look.width <= 1280 + 1 && look.height <= 800 + 1, 'the art overflows the window');
    assert.ok(
      Math.abs(look.height - 800) < 2 || Math.abs(look.width - 1280) < 2,
      `after the font landed the grid fills neither axis: ${look.width}x${look.height}`,
    );
  });

  it('C19: the start button is part of its panel', async () => {
    const session = await page();
    const size = await session.evaluate(
      `(() => {
         const px = (id) => Number.parseFloat(getComputedStyle(document.getElementById(id)).fontSize);
         return { label: px('label'), button: Number.parseFloat(
           getComputedStyle(document.querySelector('#panel button')).fontSize) };
       })()`,
    );
    // It inherited 16px from the body under an 86px label, and it is what
    // somebody has to hit on a projector with a trackpad.
    assert.ok(
      size.button >= size.label / 3,
      `label ${size.label}px over a ${size.button}px button`,
    );
  });

  it('C18: the debug text is one block in the corner, on its own ground', async () => {
    const session = await page({ query: '?debug=1' });
    const look = await session.evaluate(
      `(() => {
         const read = (id) => {
           const style = getComputedStyle(document.getElementById(id));
           return { family: style.fontFamily, size: style.fontSize, ground: style.backgroundColor };
         };
         return { overlay: read('overlay'), repo: read('repo') };
       })()`,
    );
    // The repository link is debug information too, so it is set like the rest
    // of it rather than in the body font at whatever size a link inherits.
    assert.equal(look.repo.family, look.overlay.family, 'the link is in another font');
    assert.equal(look.repo.size, look.overlay.size, 'the link is at another size');
    // Both lie over the art, so both need a ground of their own to stay legible.
    for (const [name, part] of Object.entries(look)) {
      assert.equal(part.ground, 'rgb(0, 0, 0)', `${name} is transparent over the figure`);
    }
  });
});
