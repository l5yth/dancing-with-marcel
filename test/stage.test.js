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
import { describe, it } from 'node:test';
import { FRAME_META, FRAMES, LOOPS, SHEET } from '../src/sprites/index.js';
import { frameAt, frameText, Stage } from '../src/view/stage.js';
import { generator } from './helpers/art.js';
import { createFakeDocument } from './helpers/fakes.js';

/** The ramp the design project draws with: lightest first, darkest last. */
const RAMP = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

/**
 * A stage over a fake page.
 *
 * @param {{width?: number, height?: number}} [cell] Size of a character cell at 100px.
 * @returns {{stage: Stage, document: any}} The stage and the page it draws into.
 */
function setup(cell) {
  const document = createFakeDocument(cell ? { cell } : undefined);
  const stage = new Stage({ element: document.elements.stage, document });
  return { stage, document };
}

describe('sprite sheet', () => {
  it('C16: every frame sits on the same grid and carries the design metadata', () => {
    // Exactly these two: a cell shape here would be a second opinion on the
    // font, and `fit` measures the real one.
    assert.deepEqual(SHEET, { cols: 168, rows: 128 });
    assert.equal(Object.keys(FRAMES).length, 32);
    for (const [name, rows] of Object.entries(FRAMES)) {
      assert.equal(rows.length, SHEET.rows, name);
      assert.ok(Math.max(...rows.map((row) => row.length)) <= SHEET.cols, name);
      const meta = FRAME_META[name];
      assert.ok(meta.group === 'dance' || meta.group === 'break', `${name}: ${meta.group}`);
      assert.ok(meta.energy >= 0 && meta.energy <= 3, name);
    }
  });

  it('C16: no frame contains the text undefined', () => {
    for (const [name, rows] of Object.entries(FRAMES)) {
      assert.ok(
        rows.every((row) => !row.includes('undefined')),
        `${name} carries a NaN tone`,
      );
    }
  });

  it('C16: the art uses only the ramp, so it renders in any monospace font', () => {
    const allowed = new Set(RAMP.split(''));
    for (const [name, rows] of Object.entries(FRAMES)) {
      for (const character of new Set(rows.join(''))) {
        assert.ok(allowed.has(character), `${name} uses ${JSON.stringify(character)}`);
      }
    }
  });

  it('C16: every loop names frames that exist, and every frame is used by a loop', () => {
    const used = new Set();
    for (const [loop, names] of Object.entries(LOOPS)) {
      assert.ok(names.length > 0, loop);
      for (const name of names) {
        assert.ok(name in FRAMES, `${loop} names a missing frame ${name}`);
        used.add(name);
      }
    }
    assert.deepEqual([...used].sort(), Object.keys(FRAMES).sort());
  });

  it('C16: the committed art is what the generator draws, frame for frame', () => {
    // SPEC D10: the generator is the source, not the exports. Without this,
    // a hand-edited sprite would pass every other check in this file.
    const gen = generator();
    assert.deepEqual(Object.keys(gen.POSES).sort(), Object.keys(FRAMES).sort());
    assert.deepEqual(gen.LOOPS, LOOPS);
    for (const [name, pose] of Object.entries(gen.POSES)) {
      assert.deepEqual(
        gen.renderPose(pose),
        FRAMES[name],
        `${name} is not what the generator draws`,
      );
    }
  });

  it('C16: a frame is drawn as rows joined by newlines, and cached', () => {
    const text = frameText('idle_a');
    assert.equal(text, FRAMES.idle_a.join('\n'));
    assert.equal(frameText('idle_a'), text);
  });

  it('C16: a loop cycles at the frame rate it is given', () => {
    assert.equal(frameAt('smoke', 0, 1000), 'smoke_drag');
    assert.equal(frameAt('smoke', 999, 1000), 'smoke_drag');
    assert.equal(frameAt('smoke', 1000, 1000), 'smoke_exhale');
    assert.equal(frameAt('smoke', 2000, 1000), 'smoke_drag');
    assert.equal(frameAt('n64', 99999, 1000), 'n64', 'a single-frame loop stands still');
    assert.equal(frameAt('windmill', -50, 1000), 'wind_1', 'before the clock starts');
  });
});

describe('stage', () => {
  it('C16: the grid is fitted to the window, whatever its shape', () => {
    for (const [width, height] of [
      [1920, 1080],
      [1080, 1920],
      [800, 600],
      [3840, 2160],
      [400, 4000],
    ]) {
      const { stage } = setup();
      const size = stage.fit(width, height);
      // A cell is 0.60 of the font size across and 0.88 down, as the fake reports.
      assert.ok(SHEET.cols * size * 0.6 <= width + 1e-9, `${width}x${height} too wide`);
      assert.ok(SHEET.rows * size * 0.88 <= height + 1e-9, `${width}x${height} too tall`);
      const fills =
        Math.abs(SHEET.cols * size * 0.6 - width) < 1e-6 ||
        Math.abs(SHEET.rows * size * 0.88 - height) < 1e-6;
      assert.ok(fills, `${width}x${height} leaves room on both axes`);
    }
  });

  it('C16: the cell is measured from the page, not assumed', () => {
    const wide = setup({ width: 120, height: 88 }).stage.fit(1920, 1080);
    const narrow = setup({ width: 60, height: 88 }).stage.fit(1920, 1080);
    assert.ok(wide < narrow, 'a wider font gets a smaller size');
  });

  it('C16: the probe is added to the page, read, removed, and measured once', () => {
    const { stage, document } = setup();
    stage.fit(1920, 1080);
    assert.equal(document.created.length, 1);
    assert.equal(document.created[0].removed, true);
    assert.equal(document.body.children.length, 1);
    stage.fit(1280, 720);
    assert.equal(document.created.length, 1, 'the font did not change');
  });

  it('C16: the probe carries the stage font, or it would measure the wrong grid', () => {
    const { stage, document } = setup();
    document.elements.stage.className = 'sheet';
    stage.fit(1920, 1080);
    assert.equal(document.created[0].className, 'sheet');
    assert.equal(document.created[0].style.fontSize, '100px');
  });

  it('C16: a tiny window still gets a usable font size', () => {
    const { stage } = setup();
    assert.ok(stage.fit(0, 0) >= 1);
  });

  it('C16: the box is the whole grid, so a right-trimmed frame does not shift him', () => {
    const { stage, document } = setup();
    const size = stage.fit(1920, 1080);
    const style = document.elements.stage.style;
    assert.equal(style.width, `${SHEET.cols * 0.6 * size}px`);
    assert.equal(style.height, `${SHEET.rows * 0.88 * size}px`);
  });

  it('C16: drawing writes the frame, and only when it changes', () => {
    const { stage, document } = setup();
    const moment = { loop: 'smoke', danceBpm: 140, dancing: false, breakFrameMs: 1000 };
    assert.equal(stage.draw({ ...moment, elapsedMs: 0 }), 'smoke_drag');
    assert.equal(document.elements.stage.textContent, frameText('smoke_drag'));
    document.elements.stage.textContent = 'touched';
    assert.equal(stage.draw({ ...moment, elapsedMs: 500 }), 'smoke_drag');
    assert.equal(document.elements.stage.textContent, 'touched', 'not written again');
    assert.equal(stage.draw({ ...moment, elapsedMs: 1000 }), 'smoke_exhale');
    assert.equal(document.elements.stage.textContent, frameText('smoke_exhale'));
  });

  it('C16: dancing steps two frames a beat, so a faster song dances faster', () => {
    /**
     * The frames drawn over one second, in order, with repeats collapsed.
     *
     * @param {number} danceBpm The tempo.
     * @returns {string[]} The frames actually drawn.
     */
    const drawnOver = (danceBpm) => {
      const { stage } = setup();
      /** @type {string[]} */
      const drawn = [];
      for (let ms = 0; ms < 1000; ms += 5) {
        const name = stage.draw({
          loop: 'windmill',
          elapsedMs: ms,
          danceBpm,
          dancing: true,
          breakFrameMs: 2400,
        });
        if (name !== drawn.at(-1)) {
          drawn.push(name);
        }
      }
      return drawn;
    };
    // Four eighth notes a second at 120, six at 180: the frames themselves
    // advance, and they advance in the loop's order.
    assert.deepEqual(drawnOver(120), ['wind_1', 'wind_2', 'wind_3', 'wind_4']);
    assert.deepEqual(drawnOver(180), ['wind_1', 'wind_2', 'wind_3', 'wind_4', 'wind_1', 'wind_2']);
  });

  it('C16: a between-song scene ignores the tempo and runs at its own rate', () => {
    // Measured from when the scene opened, not from when the page did: 180 bpm
    // would be an eighth note every 167 ms, and the scene holds for 2400.
    const { stage } = setup();
    const moment = { loop: 'smoke', danceBpm: 180, dancing: false, breakFrameMs: 2400 };
    assert.equal(stage.draw({ ...moment, elapsedMs: 900 }), 'smoke_drag', 'the scene opens');
    assert.equal(stage.draw({ ...moment, elapsedMs: 900 + 2399 }), 'smoke_drag', 'and holds');
    assert.equal(stage.draw({ ...moment, elapsedMs: 900 + 2400 }), 'smoke_exhale');
  });

  it('C18: a scene opens on its first frame, however long the page has been up', () => {
    // The loop used to be indexed by absolute time since the page loaded, so a
    // four-frame break could open on lace_boot instead of amp_lean and a dance
    // could start on its weakest beat.
    const { stage } = setup();
    const moment = { danceBpm: 180, dancing: false, breakFrameMs: 2400 };
    stage.draw({ loop: 'smoke', elapsedMs: 0, ...moment });
    const opened = stage.draw({ loop: 'backstage', elapsedMs: 7300, ...moment });
    assert.equal(opened, LOOPS.backstage[0], 'the scene opened part way through itself');
    // And it still runs from there, rather than snapping back to the clock.
    assert.equal(
      stage.draw({ loop: 'backstage', elapsedMs: 7300 + 2400, ...moment }),
      LOOPS.backstage[1],
    );
  });
});
