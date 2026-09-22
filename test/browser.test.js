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
import { dancesOf, STAGE } from '../src/classify/show.js';
import { PALETTE } from '../src/sprites/asciipunk.js';
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
    // Forty seconds of drums before the loop comes round: the gate defaults to
    // break and takes about fifteen of them to be sure (SPEC D7).
    audio: concat(room(2, RATE), drums(120, 40, RATE)),
    sampleRate: RATE,
    query,
    window,
  });
  open.push(session);
  return session;
}

describe('a real browser', { skip: BROWSER === null ? 'no Chromium on PATH' : false }, () => {
  it('C17: the page is white on black and the show runs before the microphone is allowed', async () => {
    // A quick pace between songs, so the walk on takes seconds and not half a minute.
    const session = await page({ query: '?breakFrameMs=100' });
    const look = await session.evaluate(
      `({ background: getComputedStyle(document.body).backgroundColor,
          color: getComputedStyle(document.body).color,
          rows: document.getElementById('stage').children.length,
          fontSize: Number.parseFloat(document.getElementById('stage').style.fontSize),
          panel: document.getElementById('panel').hidden })`,
    );
    assert.equal(look.background, 'rgb(0, 0, 0)');
    assert.equal(look.color, 'rgb(255, 255, 255)');
    assert.equal(look.rows, STAGE.rows, 'a line for every row of the stage');
    assert.ok(look.fontSize > 1, `font size ${look.fontSize}`);
    assert.equal(look.panel, false, 'the start button is offered');
    // Three punks of some ninety characters each, once they have walked on.
    const drawn = await until(
      async () =>
        Number(
          await session.evaluate(
            `document.getElementById('stage').textContent.replaceAll(/\\s/g, '').length`,
          ),
        ) > 200,
      15000,
    );
    assert.ok(drawn, 'nobody walked on');
  });

  it('C22: the stage fills the width, and every colour on it is white or one of the five accents', async () => {
    const session = await page({
      query: '?breakFrameMs=100',
      window: { width: 1280, height: 800 },
    });
    // Billy's bleached hair and Mo's lipstick are on the canvas once they are.
    const coloured = await until(
      async () =>
        Number(
          await session.evaluate(
            `new Set([...document.querySelectorAll('#stage span')].map((run) => run.className)).size`,
          ),
        ) >= 2,
      15000,
    );
    assert.ok(coloured, 'no accent ever reached the page');
    const look = await session.evaluate(
      `(() => {
         const stage = document.getElementById('stage');
         const box = stage.getBoundingClientRect();
         const runs = [...stage.querySelectorAll('*')];
         return { width: box.width, height: box.height,
                  colours: [...new Set([stage, ...runs].map((node) => getComputedStyle(node).color))],
                  classes: [...new Set(runs.map((run) => run.className).filter(Boolean))],
                  grounds: [...new Set(runs.map((node) => getComputedStyle(node).backgroundColor))] };
       })()`,
    );
    assert.ok(Math.abs(look.width - 1280) < 2, `the stage is ${look.width} wide in a 1280 window`);
    assert.ok(look.height < 400, `a band, not a page: ${look.height} tall`);
    const rgb = (/** @type {string} */ hex) =>
      `rgb(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;
    const allowed = ['rgb(255, 255, 255)', ...Object.values(PALETTE).map(rgb)];
    for (const colour of look.colours) {
      assert.ok(allowed.includes(colour), `${colour} is on the stage`);
    }
    assert.ok(look.colours.length >= 3, `only ${look.colours} drawn`);
    for (const name of look.classes) {
      assert.ok(name in PALETTE, `a run is classed ${name}`);
    }
    assert.deepEqual(look.grounds, ['rgba(0, 0, 0, 0)'], 'a run paints its own ground');
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

  it('C17: clicking start opens the microphone and they dance to what they hear', async () => {
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
        /^state\s+music\s+tier [123]$/m.test(
          String(await session.evaluate(`document.getElementById('overlay').textContent`)),
        ),
      35000,
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
    assert.match(overlay, /^state\s+music\s+tier [123]$/m);
    assert.match(overlay, /^level\s+-\d+\.\d dB\s+floor/m);
    assert.match(overlay, /^pulse\s+0\.\d{3}\s+need/m);
    assert.match(overlay, /^punks\s+billy \w+, mo \w+, spike \w+/m);

    const frames = new Set();
    for (let look = 0; look < 30; look += 1) {
      frames.add(await session.evaluate(`document.getElementById('stage').textContent`));
      await until(async () => false, 60);
    }
    assert.ok(frames.size > 1, 'they stood still');
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

  it('C22: the panel keeps off the punks: it ends above the first row any of them reaches', async () => {
    for (const window of [
      { width: 1280, height: 800 },
      { width: 1920, height: 1080 },
      { width: 1024, height: 768 },
    ]) {
      const session = await page({ window });
      const look = await session.evaluate(
        `(async () => {
           await document.fonts.ready;
           const stage = document.getElementById('stage').getBoundingClientRect();
           return { panel: document.getElementById('panel').getBoundingClientRect().bottom,
                    top: stage.top, row: stage.height / ${STAGE.rows} };
         })()`,
      );
      // A punk is 16 rows tall with its feet on the floor row, so the rows above are empty.
      const hair = look.top + (STAGE.floor - 15) * look.row;
      const shape = `${window.width}x${window.height}`;
      assert.ok(
        look.panel <= hair,
        `${shape}: the panel ends at ${look.panel}, hair begins at ${hair}`,
      );
    }
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

  it('C16: pressing d shows the debug text and pressing it again hides it', async () => {
    const session = await page();
    const shown = async () =>
      session.evaluate(
        `['overlay', 'repo'].map((id) => getComputedStyle(document.getElementById(id)).display !== 'none')`,
      );
    const press = async () => {
      for (const type of ['keyDown', 'keyUp']) {
        await session.send('Input.dispatchKeyEvent', {
          type,
          key: 'd',
          code: 'KeyD',
          text: type === 'keyDown' ? 'd' : undefined,
          windowsVirtualKeyCode: 68,
        });
      }
    };
    assert.deepEqual(await shown(), [false, false], 'the page opens without it');
    await press();
    assert.deepEqual(await shown(), [true, true], 'd did not show it');
    await press();
    assert.deepEqual(await shown(), [false, false], 'd did not hide it again');
    assert.deepEqual(session.logs, []);
  });

  it('C23: a real 2 key press forces a tier-2 dance, and the overlay says so', async () => {
    const session = await page({ query: '?debug=1&breakFrameMs=100' });
    await click(session, 'start');
    // Capture running, the overlay written, and everybody on stage: whoever
    // is still walking on when the key goes down would dance on arrival, which
    // is right, but not what this test is here to see. The fixture opens with
    // room noise, so the state is still break when the key goes down.
    const written = await until(
      async () =>
        /^state\s+break\s+tier 0\n[\s\S]*^punks\s+billy (?!walk)\w+, mo (?!walk)\w+, spike (?!walk)\w+$/m.test(
          String(await session.evaluate(`document.getElementById('overlay').textContent`)),
        ),
      15000,
    );
    assert.ok(written, 'the overlay never showed a state with everybody on stage');
    for (const type of ['keyDown', 'keyUp']) {
      await session.send('Input.dispatchKeyEvent', {
        type,
        key: '2',
        code: 'Digit2',
        text: type === 'keyDown' ? '2' : undefined,
        windowsVirtualKeyCode: 50,
      });
    }
    const forced = await until(
      async () =>
        /^state\s+break\s+tier 2 \(forced, (30|29|28) s left\)$/m.test(
          String(await session.evaluate(`document.getElementById('overlay').textContent`)),
        ),
      3000,
    );
    assert.ok(forced, 'the overlay never said the tier was forced');
    const overlay = String(
      await session.evaluate(`document.getElementById('overlay').textContent`),
    );
    const cast = /^punks\s+(.+)$/m.exec(overlay);
    assert.ok(cast !== null, overlay);
    for (const doing of cast[1].split(', ')) {
      const [, loop] = doing.split(' ');
      assert.ok(dancesOf(2).includes(loop), `${doing} is not a tier-2 dance`);
    }
    assert.deepEqual(session.logs, [], 'the console stayed quiet');
  });

  it('C16: a real r press forgets what it has heard', async () => {
    const session = await page({ query: '?debug=1&breakFrameMs=100' });
    await click(session, 'start');
    const overlay = () =>
      session.evaluate(`document.getElementById('overlay').textContent`).then(String);
    const heard = await until(async () => /^state\s+music/m.test(await overlay()), 35000);
    assert.ok(heard, 'the drums were never heard');

    for (const type of ['keyDown', 'keyUp']) {
      await session.send('Input.dispatchKeyEvent', {
        type,
        key: 'r',
        code: 'KeyR',
        text: type === 'keyDown' ? 'r' : undefined,
        windowsVirtualKeyCode: 82,
      });
    }
    // It is in a break again and the dance tempo is the default, both of which
    // it had left behind; the label follows within one hop.
    const forgotten = await until(
      async () => /^state\s+break[\s\S]*^dance\s+140\.0 bpm \(default\)$/m.test(await overlay()),
      3000,
    );
    assert.ok(forgotten, `r was not heard: ${await overlay()}`);
    assert.equal(await session.evaluate(`document.getElementById('label').textContent`), 'break');
    assert.deepEqual(session.logs, [], 'the console stayed quiet');
  });

  it('C18: the debug text is one block in the corner, on its own ground', async () => {
    const session = await page({ query: '?debug=1' });
    const look = await session.evaluate(
      `(() => {
         const read = (id) => {
           const style = getComputedStyle(document.getElementById(id));
           return { family: style.fontFamily, size: style.fontSize, ground: style.backgroundColor };
         };
         return { overlay: read('overlay'), repo: read('repo'),
                  cursor: { body: getComputedStyle(document.body).cursor,
                            panel: getComputedStyle(document.getElementById('panel')).cursor,
                            stage: getComputedStyle(document.getElementById('stage')).cursor } };
       })()`,
    );
    // Nothing on a projector wants a mouse pointer parked on it all evening,
    // and the start button still has to be hit.
    assert.equal(look.cursor.body, 'none', 'the pointer is on the projector');
    assert.equal(look.cursor.stage, 'none', 'the pointer is over the punks');
    assert.notEqual(look.cursor.panel, 'none', 'the start button cannot be aimed at');
    // The repository link is debug information too, so it is set like the rest
    // of it rather than in the body font at whatever size a link inherits.
    assert.equal(look.repo.family, look.overlay.family, 'the link is in another font');
    assert.equal(look.repo.size, look.overlay.size, 'the link is at another size');
    // Both lie over the art, so both need a ground of their own to stay legible.
    for (const [name, part] of Object.entries({ overlay: look.overlay, repo: look.repo })) {
      assert.equal(part.ground, 'rgb(0, 0, 0)', `${name} is transparent over the figure`);
    }
  });
});
