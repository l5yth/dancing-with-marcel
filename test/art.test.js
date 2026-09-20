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
 * @file What the art has to be, as opposed to what it happens to look like
 * (SPEC D10). These read the generator's own output, so they hold whatever the
 * poses are changed to: the sheet is a lightness map, he stands on a line
 * rather than in a pool, the beer has its head at the top, and the generator
 * needs no patching as it loads.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { GENERATOR_URL, generator, marks, mean } from './helpers/art.js';

const gen = generator();

/**
 * Draw a pose with some of its properties overridden.
 *
 * @param {string} name Pose name.
 * @param {object} [changes] Properties to override.
 * @returns {string[]} The rows.
 */
function draw(name, changes = {}) {
  return gen.renderPose({ ...gen.POSES[name], ...changes });
}

/**
 * The cells one prop is responsible for: those that differ when the pose is
 * drawn without it. Differ, rather than appear from nothing, because a prop
 * held up to the mouth covers his head rather than empty stage.
 *
 * @param {string} name Pose name.
 * @param {object} without Properties that take the prop away.
 * @returns {{row: number, col: number, char: string, level: number}[]} The marks.
 */
function propMarks(name, without) {
  const bare = draw(name, without);
  return marks(gen.RAMP, draw(name)).filter(
    (mark) => (bare[mark.row]?.[mark.col] ?? ' ') !== mark.char,
  );
}

describe('the art', () => {
  it('C18: the sheet is a lightness map, so white on black is the picture and not its negative', () => {
    // The generator returned ink coverage, drawn for black ink on white paper.
    // Painted white on black that is a negative: the black leather jacket is
    // the brightest object on screen and the white tee is a hole in his chest.
    // A figure lit from one side spends most of its cells near the dark end of
    // the ramp and gathers the light into rims and highlights. A negative
    // spends them at the dense end.
    for (const name of ['idle_a', 'beer_hold']) {
      const found = marks(gen.RAMP, draw(name));
      const bright = found.filter((mark) => mark.level >= 0.75).length;
      const dim = found.filter((mark) => mark.level <= 0.25).length;
      assert.ok(
        bright < dim,
        `${name}: ${bright} cells at the dense end against ${dim} at the sparse end, which is a negative`,
      );
    }
  });

  it('C19: dark cloth is mass, not an empty outline', () => {
    // With no fill light a surface's lightness is capped by its albedo, and
    // leather is 0.11: a fully lit jacket landed on step 4 of a seventy-step
    // ramp and its shadow side on step 0. Only the rim escaped, so the jacket
    // was its own outline and the tee, the skin and the hair floated inside
    // it. idle_a put 69% of its marks in the lowest fifth of the ramp.
    for (const name of ['idle_a', 'beer_hold', 'pogo_air']) {
      const found = marks(gen.RAMP, draw(name));
      const sunk = found.filter((mark) => mark.level <= 0.2).length;
      assert.ok(
        sunk / found.length <= 0.3,
        `${name}: ${((100 * sunk) / found.length).toFixed(0)}% of the marks are in the lowest fifth of the ramp`,
      );
    }
  });

  it('C19: the contact line is as bright as it claims to be', () => {
    // Its ellipse was 0.012 tall against a cell of 0.0166, so supersampling
    // averaged it down: a tone of 0.10, which is a lightness of 0.90, drew at
    // 0.55. The comment said one thin bright line and the art drew a dashed
    // grey one.
    const lit = draw('idle_a');
    const bare = draw('idle_a', { shadow: 0 });
    const cells = marks(gen.RAMP, lit).filter(
      (mark) => (bare[mark.row]?.[mark.col] ?? ' ') !== mark.char,
    );
    assert.ok(cells.length >= 5, `only ${cells.length} cells of contact line`);
    // Its core, not its tips: it is an ellipse, so the ends taper by design.
    // Before the fix the whole thing topped out at 0.64 and averaged 0.55.
    const brightest = Math.max(...cells.map((mark) => mark.level));
    assert.ok(
      brightest >= 0.85,
      `the brightest cell of the contact line is ${brightest.toFixed(2)}`,
    );
    assert.ok(
      mean(cells) >= 0.7,
      `the contact line averages ${mean(cells).toFixed(2)}, so it is still a grey dash`,
    );
  });

  it('C18: the light is gathered, not painted along every pale edge', () => {
    // The generator used to force the silhouette of any pale material to an ink
    // outline, a device for separating pale objects from white paper. On black
    // it lights the edge of every patch of skin, shirt, and hair, and the
    // figure turns back into a bright outline drawing. Restoring it triples the
    // count below; the rim lights it was removed in favour of leave the
    // brightest cells a small minority.
    for (const name of ['idle_a', 'sing', 'sneer']) {
      const found = marks(gen.RAMP, draw(name));
      const hot = found.filter((mark) => mark.level >= 0.85).length;
      assert.ok(
        hot / found.length <= 0.05,
        `${name}: ${((100 * hot) / found.length).toFixed(1)}% of the marks are at the very top of the ramp`,
      );
    }
  });

  it('C18: he stands on a contact line, not in a pool of light', () => {
    // Lighting the sheet lights everything flat with it, the ground shadow
    // included, and a soft blob under his boots becomes the brightest thing on
    // stage. SPEC D10 refused to invert for exactly this reason.
    for (const name of ['idle_a', 'beer_hold']) {
      const lit = draw(name);
      const without = draw(name, { shadow: 0 });
      const ground = lit.filter(
        (row, index) => row.trim() !== '' && without[index].trim() === '',
      ).length;
      assert.ok(
        ground <= 1,
        `${name}: the shadow puts ${ground} rows below his boots, which is a pool and not a contact line`,
      );
    }
  });

  it('C18: the beer has its head at the top, whichever way the arm points', () => {
    // The prop was built along the forearm, so in beer_swig the neck pointed at
    // the ceiling and he drank from the base. Built along world up the head
    // stays on top in both frames, and being foam it is the brightest part.
    for (const name of ['beer_hold', 'beer_swig']) {
      const prop = propMarks(name, { bottle: null });
      assert.ok(prop.length > 40, `${name}: only ${prop.length} cells of beer to look at`);
      const rows = prop.map((mark) => mark.row);
      const top = Math.min(...rows);
      const bottom = Math.max(...rows);
      const third = (bottom - top) / 3;
      const head = mean(prop.filter((mark) => mark.row <= top + third));
      const body = mean(prop.filter((mark) => mark.row >= bottom - third));
      assert.ok(
        head > body,
        `${name}: the top reads ${head.toFixed(2)} against ${body.toFixed(2)} at the bottom, so the head is not on top`,
      );
    }
  });

  it('C18: the generator needs no repair as it loads', () => {
    // The cigarette material carried a tone but no albedo and was not marked
    // flat, so shading multiplied undefined and ten rows of the smoke frames
    // carried the literal text. The generator is this project's own source now,
    // so the fix belongs in it and not in whatever loads it.
    const source = readFileSync(GENERATOR_URL, 'utf8');
    assert.doesNotMatch(source, /mat\.alb == null && mat\.tone != null/, 'the repair moved in');
    for (const [name, pose] of Object.entries(gen.POSES)) {
      assert.ok(
        gen.renderPose(pose).every((row) => !row.includes('undefined')),
        `${name} draws the text undefined`,
      );
    }
  });
});
