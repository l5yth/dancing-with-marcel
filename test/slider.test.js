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
 * @file The floor ceiling slider on the page, with fakes (SPEC S1, S3 to S5;
 * ACCEPTANCE C24). It moves `floorMaxDb` while the page runs, through the
 * same `configWith` as the URL; it is debug text, shown and hidden with the
 * overlay; `r` keeps it and a reload does not.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { boot } from '../src/app.js';
import { click, press, push, RATE, setup, WARM_S } from './helpers/app.js';
import { drums, room, scaleToDb } from './helpers/synth.js';

/**
 * Move the slider the way a hand on it does: a new value, then the `input`
 * event a range input fires.
 *
 * @param {any} document The fake page.
 * @param {string} value The slider's new value, as a range input holds it.
 * @returns {void}
 */
function slide(document, value) {
  const slider = document.elements['ceiling-slider'];
  slider.value = value;
  slider.listeners.input();
}

/**
 * Keep every event the director hears from here on: all of them pass through
 * it, forced tier or not, which makes it the place to watch the floor from.
 *
 * @param {import('../src/classify/scene.js').SceneDirector} director The director.
 * @returns {PipelineEvent[]} The events, as they arrive.
 */
function listen(director) {
  /** @type {PipelineEvent[]} */
  const heard = [];
  const update = director.update.bind(director);
  director.update = (event) => {
    heard.push(event);
    update(event);
  };
  return heard;
}

/**
 * The overlay's level line, where the floor, `(max)` and `need` are.
 *
 * @param {any} document The fake page.
 * @returns {string} The line.
 */
function levelLine(document) {
  return document.elements.overlay.textContent.split('\n')[1] ?? '';
}

/**
 * A minute of a room at -20 dB: with nothing to stop it, the floor climbs
 * from -60 at half a decibel a second, well past -45, and so shows a ceiling.
 *
 * @param {number} seconds How long.
 * @returns {Float32Array} The samples.
 */
const loudRoom = (seconds) => scaleToDb(room(seconds, RATE), -20);

/**
 * The loudest floor among some events.
 *
 * @param {PipelineEvent[]} events The events.
 * @returns {number} The floor, in dBFS.
 */
const highest = (events) => Math.max(...events.map((event) => event.floorDb));

describe('the floor ceiling slider', () => {
  it('C24: the slider runs from -79 to 0 in steps of 1, and opens at the ceiling in force', () => {
    const plain = setup();
    boot(plain.env);
    const slider = plain.document.elements['ceiling-slider'];
    assert.deepEqual([slider.min, slider.max, slider.step, slider.value], ['-79', '0', '1', '-25']);
    const low = setup({ search: '?floorMaxDb=-45' });
    boot(low.env);
    assert.equal(low.document.elements['ceiling-slider'].value, '-45');
    // A URL value between two steps: the thumb takes the nearer step, which
    // is the browser's doing and C24's Chromium test, and the label says the
    // value in force.
    const between = setup({ search: '?floorMaxDb=-45.3' });
    boot(between.env);
    assert.equal(between.document.elements['ceiling-db'].textContent, 'ceiling -45.3 dB');
  });

  it('C24: the slider is debug text, shown and hidden with the overlay and the link', async () => {
    for (const [search, opensShown] of /** @type {[string, boolean][]} */ ([
      ['', false],
      ['?debug=1', true],
    ])) {
      const { document, window, env } = setup({ search });
      boot(env);
      const { overlay, repo, ceiling } = document.elements;
      /**
       * Which of the debug text's three parts are shown.
       *
       * @returns {boolean[]} The overlay, the link, and the slider's row.
       */
      const shown = () => [!overlay.hidden, !repo.hidden, !ceiling.hidden];
      /**
       * The three parts all shown, or all hidden.
       *
       * @param {boolean} value Whether shown.
       * @returns {boolean[]} The same for each.
       */
      const all = (value) => [value, value, value];
      assert.deepEqual(shown(), all(opensShown), `opened with "${search}"`);
      window.listeners.keydown(press({}));
      assert.deepEqual(shown(), all(!opensShown), 'd did not take the slider with it');
      window.listeners.keydown(press({ key: 'D' }));
      assert.deepEqual(shown(), all(opensShown), 'a capital D did not take it back');
      for (const other of [
        press({ ctrlKey: true }),
        press({ metaKey: true }),
        press({ altKey: true }),
        press({ repeat: true }),
        press({ key: 'f' }),
        press({ key: 'Dead' }),
      ]) {
        window.listeners.keydown(other);
        assert.deepEqual(shown(), all(opensShown), JSON.stringify(other));
      }
      // Capture running does not change what is shown, only the pointer.
      await click(document);
      assert.deepEqual(shown(), all(opensShown), 'capture running moved it');
    }
  });

  it('C24: the label says the ceiling in force, the moment the slider moves', () => {
    const { document, env } = setup({ search: '?debug=1' });
    boot(env);
    /**
     * What the label beside the slider says.
     *
     * @returns {string} The label.
     */
    const text = () => document.elements['ceiling-db'].textContent;
    assert.equal(text(), 'ceiling -25.0 dB');
    // No audio yet, so no pipeline either: the label does not wait for one.
    slide(document, '-45');
    assert.equal(text(), 'ceiling -45.0 dB');
    // Both ends of the range are taken.
    slide(document, '-79');
    assert.equal(text(), 'ceiling -79.0 dB');
    slide(document, '0');
    assert.equal(text(), 'ceiling 0.0 dB');
  });

  it("C24: moving the slider changes the ceiling and nothing else of the URL's tuning", async () => {
    // The value goes to `configWith` with the rest of the configuration in
    // force. Handed over alone, every other value of the URL would fall back
    // to its default on the first move: the pulse bar here from 0.4 to 0.15,
    // and the bar over the floor from 20 dB to 12.
    const { stack, document, env } = setup({
      search: '?debug=1&pulseEnter=0.4&musicOverFloorDb=20&breakUnderFloorDb=10',
    });
    boot(env);
    await click(document);
    push(stack, loudRoom(3));
    // Under the floor, so the floor is the ceiling exactly and the two
    // numbers of the level line round alike.
    slide(document, '-70');
    push(stack, loudRoom(1));
    const lines = document.elements.overlay.textContent.split('\n');
    assert.match(lines[1], /floor -70\.0 dB \(max\)/, lines[1]);
    assert.match(lines[3], /need 0\.4 to start/, lines[3]);
    const bar = /floor (-?\d+\.\d) dB.*need (-?\d+\.\d) dB/.exec(lines[1]);
    assert.ok(bar !== null, lines[1]);
    assert.equal(Number(bar[2]) - Number(bar[1]), 20, lines[1]);
  });

  it('C24: moved before the microphone is allowed, it is in force from the first frame', async () => {
    /**
     * The floors of a loud room heard from a click on start.
     *
     * @param {string | null} ceiling Where the slider is moved first, if at all.
     * @returns {Promise<PipelineEvent[]>} Every event.
     */
    const hear = async (ceiling) => {
      const { stack, document, env } = setup();
      const { director } = boot(env);
      if (ceiling !== null) {
        slide(document, ceiling);
      }
      const heard = listen(director);
      await click(document);
      push(stack, loudRoom(60));
      return heard;
    };
    const free = await hear(null);
    assert.ok(
      highest(free) > -45,
      `the room left the floor at ${highest(free)}: it proves nothing`,
    );
    const capped = await hear('-45');
    assert.ok(capped.length > 0);
    assert.equal(highest(capped), -45, `the floor went to ${highest(capped)}`);
  });

  it('C24: moved while a song plays, the floor follows at once and the overlay says so', async () => {
    const { stack, document, env } = setup({ search: '?debug=1' });
    const { director } = boot(env);
    await click(document);
    push(stack, drums(120, WARM_S, RATE));
    assert.ok(director.tier >= 1, 'the drums were not heard as music');
    const playing = document.elements.label.textContent;
    assert.match(playing, /^music \(\d+ bpm\)$/, 'no tempo was locked');
    const heard = listen(director);
    slide(document, '-70');
    // One frame at a time, until the overlay is written again: that is its
    // next refresh, a tenth of a second of audio on, and it must say so then.
    const song = drums(120, 1, RATE);
    const before = document.elements.overlay.textContent;
    let frames = 0;
    while (document.elements.overlay.textContent === before) {
      assert.ok((frames + 1) * 512 <= song.length, 'the overlay was never written again');
      push(stack, song.subarray(frames * 512, (frames + 1) * 512));
      frames += 1;
    }
    const line = levelLine(document);
    assert.match(
      line,
      /floor -70\.0 dB \(max\)/,
      `at the next refresh, ${frames} frames on: ${line}`,
    );
    assert.match(line, /need -58\.0 dB/, line);
    push(stack, song.subarray(frames * 512));
    assert.ok(heard.length > frames);
    // The song holds the floor, over -70; the ceiling takes it down anyway.
    assert.equal(heard[0].floorDb, -70, 'the floor did not follow the ceiling down');
    assert.equal(highest(heard), -70);
    // And the song goes on, at its tempo: the move retunes the pipeline, it
    // does not build a new one that would have to hear the song again.
    const dropped = heard.find((event) => event.state !== 'music');
    assert.equal(dropped, undefined, `dropped at ${dropped?.time.toFixed(2)} s`);
    assert.equal(document.elements.label.textContent, playing);
  });

  it('C24: a value the slider cannot take changes nothing', async () => {
    // A range input never hands such a value over, and the handler does not
    // take its word for it: a value `configWith` refuses comes back as the
    // default, -25, which would undo the ceiling that had been set.
    const { stack, document, env } = setup({ search: '?debug=1' });
    const { director } = boot(env);
    slide(document, '-45');
    await click(document);
    push(stack, loudRoom(60));
    assert.match(levelLine(document), /floor -45\.0 dB \(max\)/, 'the room never reached -45');
    const heard = listen(director);
    // Out of the range, just out of it at either end, empty, not a number.
    for (const value of ['5', '-90', '-80', '0.5', '', 'abc']) {
      slide(document, value);
      const said = JSON.stringify(value);
      assert.equal(document.elements['ceiling-db'].textContent, 'ceiling -45.0 dB', said);
      push(stack, loudRoom(1));
      assert.match(levelLine(document), /floor -45\.0 dB \(max\)/, `after ${said}`);
    }
    assert.equal(highest(heard), -45, 'the floor went past the ceiling');
  });

  it('C24: r keeps what the slider set, and the fresh pipeline starts under it', async () => {
    const { stack, document, window, env } = setup({ search: '?debug=1' });
    const { director } = boot(env);
    await click(document);
    slide(document, '-45');
    push(stack, loudRoom(5));
    window.listeners.keydown(press({ key: 'r' }));
    const heard = listen(director);
    // A fresh floor starts at -60 and would climb past -45 in half a minute.
    push(stack, loudRoom(60));
    assert.equal(document.elements['ceiling-slider'].value, '-45');
    assert.equal(document.elements['ceiling-db'].textContent, 'ceiling -45.0 dB');
    assert.ok(heard.length > 0);
    assert.equal(highest(heard), -45, `after r the floor went to ${highest(heard)}`);
  });

  it('C24: the stylesheet draws the slider in both engines, and the markup hides its row', async () => {
    // Firefox is driven by no test here, so what it is told is held in the
    // source: the track and the thumb in the page's white, the thumb square
    // and flat, and Chromium's thumb told off its own appearance too. The row
    // is hidden in the markup, as the overlay and the link are, so a page
    // that is not debugging never shows it, not even before the script runs.
    const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
    /**
     * The declarations of the rule for one selector, by property.
     *
     * @param {string} selector The rule's whole selector.
     * @returns {Record<string, string>} Its declarations.
     */
    const rule = (selector) => {
      const at = css.indexOf(`${selector} {`);
      assert.ok(at >= 0, `no rule for ${selector}`);
      const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
      return Object.fromEntries(
        body
          .split(';')
          .map((declaration) => declaration.split(':').map((part) => part.trim()))
          .filter(([property]) => property !== ''),
      );
    };
    for (const track of ['::-webkit-slider-runnable-track', '::-moz-range-track']) {
      const style = rule(`#ceiling-slider${track}`);
      assert.deepEqual([style.height, style.background], ['2px', 'var(--fg)'], track);
    }
    for (const thumb of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
      const style = rule(`#ceiling-slider${thumb}`);
      assert.equal(style.background, 'var(--fg)', thumb);
      assert.equal(style.width, style.height, `${thumb} is not square`);
      assert.deepEqual([style.border, style['border-radius']], ['0', '0'], thumb);
    }
    assert.equal(rule('#ceiling-slider').appearance, 'none');
    assert.equal(rule('#ceiling-slider::-webkit-slider-thumb').appearance, 'none');
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /<label id="ceiling" hidden\b/);
  });

  it('C24: a reload opens at the ceiling of the URL, whatever the slider was moved to', () => {
    for (const [search, opens] of [
      ['', '-25'],
      ['?floorMaxDb=-45', '-45'],
    ]) {
      const first = setup({ search });
      boot(first.env);
      slide(first.document, '-60');
      assert.equal(first.document.elements['ceiling-db'].textContent, 'ceiling -60.0 dB');
      const again = setup({ search });
      boot(again.env);
      assert.equal(again.document.elements['ceiling-slider'].value, opens, search);
      assert.equal(again.document.elements['ceiling-db'].textContent, `ceiling ${opens}.0 dB`);
    }
  });

  it('C24: a key that writes the overlay before the next frame shows the floor the ceiling left', async () => {
    // Forty seconds of a loud room lift the floor to about -40; the ceiling
    // then goes to -50, and before another frame arrives `2` forces a tier
    // and `d` hides and shows the text, each writing the overlay at once.
    // The pipeline's floor is -50 already, and the overlay says so. With the
    // floor last heard it would read `floor -40.0 dB (max)   need -28.0 dB`,
    // a state the page was never in.
    const { stack, document, window, env } = setup({ search: '?debug=1' });
    boot(env);
    await click(document);
    push(stack, loudRoom(40));
    const lifted = /floor (-?\d+\.\d) dB/.exec(levelLine(document));
    assert.ok(lifted !== null && Number(lifted[1]) > -50, levelLine(document));
    slide(document, '-50');
    // The overlay is emptied before each key, so what is read after it is
    // what that key wrote, and not what the one before it left.
    for (const keys of [[press({ key: '2' })], [press({}), press({})]]) {
      document.elements.overlay.textContent = '';
      for (const key of keys) {
        window.listeners.keydown(key);
      }
      const line = levelLine(document);
      assert.match(
        line,
        /floor -50\.0 dB \(max\) {3}need -38\.0 dB/,
        `after ${keys.length}: ${line}`,
      );
    }
    // A ceiling raised again moves no floor at once: the next write shows the
    // floor where it is, under a ceiling it no longer touches.
    slide(document, '-20');
    document.elements.overlay.textContent = '';
    window.listeners.keydown(press({ key: '1' }));
    assert.match(levelLine(document), /floor -50\.0 dB {3}need -38\.0 dB/, levelLine(document));
  });

  it('C24: once the slider has moved, d, r and 2 still do what they do', () => {
    const { document, window, env } = setup({ search: '?debug=1' });
    const { show } = boot(env);
    slide(document, '-45');
    window.listeners.keydown(press({ key: '2' }));
    assert.deepEqual([show.dancing, show.tier], [true, 2], '2 did not force the tier');
    window.listeners.keydown(press({ key: 'r' }));
    assert.equal(document.elements.label.textContent, 'break', 'r did not forget');
    window.listeners.keydown(press({}));
    assert.deepEqual(
      [document.elements.overlay.hidden, document.elements.ceiling.hidden],
      [true, true],
      'd did not hide the debug text',
    );
  });
});
