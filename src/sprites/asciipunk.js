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
 * @file ASCIIpunk sprite sheet. Three punks, one shared body, 16 rows tall,
 * drawn for Courier Prime at line-height 0.88em, white on black. Every frame
 * faces right; `mirror()` turns it left. Colour is a parallel mask: a letter
 * per coloured cell, looked up in PALETTE. Same table shape as the sheet it
 * replaced, Marcel's (FRAME_META.energy, LOOPS), plus SPRITES[punk][frame]
 * because there are three dancers.
 *
 *   ROWS        16
 *   PALETTE     mask letter -> colour
 *   PUNKS       punk id -> who they are
 *   SPRITES     punk id -> frame name -> { rows, mask }   (right-facing)
 *   EXTRAS      frame name -> { rows, mask }              (cat, rabbit)
 *   FRAME_META  frame name -> { group, energy, anchor, width, dx, head }
 *   LOOPS       loop name -> frame names   (dance + break, safe for a director)
 *   EGGS        loop name -> frame names   (easter eggs, pick on purpose)
 *   LOOP_ENERGY loop name -> 0..3
 *   mirror(sprite, width) -> sprite facing left
 *
 * anchor = column of the feet (place a punk by it so switching frames never
 * jitters). dx = columns to move per frame in the facing direction. Frames
 * that leave the ground (pogo_air) simply have blank rows at the bottom.
 *
 * In this source `@` stands for the backslash inside the art, so no escape
 * sequence ever has to parse.
 */

/** Rows in every punk sprite: each is bottom-aligned into this many. */
export const ROWS = 16;

/**
 * Mask letter to colour. These five and white are every colour on the page
 * (SPEC Invariant 5).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PALETTE = Object.freeze({
  y: '#ffd21e', // bleached hair
  r: '#ff3b1f', // cigarette ember, amp LED, blood, Spike's dyed tips
  a: '#f7a325', // beer
  g: '#5cff6a', // TV / N64 screen glow
  p: '#ff2e88', // lipstick
});

/**
 * Who the three punks are. They share one body and differ in hair and lips.
 *
 * @type {Readonly<Record<string, Punk>>}
 */
export const PUNKS = Object.freeze({
  billy: { name: 'Billy', hair: 'bleached brush spikes', bleached: true, lipstick: false },
  mo: { name: 'Mo', hair: 'mohawk', bleached: false, lipstick: true },
  spike: { name: 'Spike', hair: 'liberty spikes', bleached: false, lipstick: false, tips: true },
});

/**
 * Put the backslashes back: the art is written with `@` in their place.
 *
 * @param {string} s A line of art.
 * @returns {string} The line as it is drawn.
 */
const bs = (s) => s.replace(/@/g, '\\');

/*
 * Hair: 3 rows x 7 columns, the crown row included. Column 0 of the block
 * sits one column left of the head. Variants: n neutral, b thrown back,
 * f thrown forward, w wilted (needs hairspray), c facing the crowd.
 */
/**
 * Hair blocks, by punk and by variant.
 *
 * @type {Record<string, Record<string, string[]>>}
 */
const HAIR = {
  billy: {
    n: [` @|||/ `, ` ||||| `, ` .---. `],
    b: [`@@@@|  `, ` @@@@| `, ` .---. `],
    f: [`  |////`, ` |//// `, ` .---. `],
    w: [`       `, ` ,.,., `, ` .---. `],
    c: [` @|||/ `, ` ||||| `, ` .---. `],
  },
  mo: {
    n: [`  |||  `, `  |||  `, ` .|||. `],
    b: [` @@@   `, `  @@@  `, ` .|||. `],
    f: [`   /// `, `  ///  `, ` .|||. `],
    w: [`       `, `   .--.`, ` .---. `],
    c: [`   |   `, `  /|@  `, ` .-|-. `],
  },
  spike: {
    n: [`@  |  /`, ` @ | / `, ` .---. `],
    b: [`@ @ @  `, ` @ @ @ `, ` .---. `],
    f: [`  / / /`, ` / / / `, ` .---. `],
    w: [`       `, `  @|/  `, ` .---. `],
    c: [`@  |  /`, ` @ | / `, ` .---. `],
  },
};
for (const punk of Object.values(HAIR)) for (const k of Object.keys(punk)) punk[k] = punk[k].map(bs);

/*
 * Bodies. Bottom-aligned into 16 rows. `H` marks the head: the left edge of
 * the eye row; the hair block is stamped above it. mask rows are keyed by the
 * art row they colour.
 */
/**
 * Every body, by frame name, as `B` registers them.
 *
 * @type {Record<string, SpriteBody>}
 */
const BODIES = {};
/**
 * Register one body.
 *
 * @param {string} name Frame name.
 * @param {SpriteBodyMeta} meta Group, energy, hair variant, feet column, and drift.
 * @param {string} art The drawing, one line a row, `@` for a backslash.
 * @param {Record<number, string>} [mask] Colour mask rows, keyed by the art row they colour.
 * @returns {void}
 */
function B(name, meta, art, mask) {
  const lines = art.split('\n');
  if (lines[0] === '') lines.shift();
  if (lines[lines.length - 1] === '') lines.pop();
  BODIES[name] = { ...meta, rows: lines.map((l) => bs(l).replace(/\s+$/, '')), mask: mask ?? {} };
}

// ---- dance, energy 1 ------------------------------------------------------

B('idle_a', { group: 'dance', energy: 1, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

B('idle_b', { group: 'dance', energy: 1, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  | |
  | |
  | |_
  |___)
`);

B('sway_b', { group: 'dance', energy: 1, hair: 'b', anchor: 5 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  @ @
   @ @
    | |
    | |_
    |___)
`);

B('sway_f', { group: 'dance', energy: 1, hair: 'f', anchor: 3 }, `
   H  o|@
   |  ,-'
   '---'
  .----.
  |   /|@
  |  / | |
  |    | o
  '----'
    / /
   / /
  | |
  | |_
  |___)
`);

B('sneer', { group: 'dance', energy: 1, hair: 'c', anchor: 4 }, `
  Ho o|
  | ,-|
  '---'
 .-----.
/| @ / |@
|| @_/ ||
||  |  ||
o'-----'o
   | |
   | |
   | |
   | |
  _| |_
`);

B('walk_1', { group: 'move', energy: 1, hair: 'n', anchor: 3, dx: 2 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  / @
 /   @
 |_  |_
 |__)|__)
`);

B('walk_2', { group: 'move', energy: 1, hair: 'n', anchor: 3, dx: 2 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

// ---- dance, energy 2 ------------------------------------------------------

B('strut_1', { group: 'dance', energy: 2, hair: 'b', anchor: 3, dx: 2 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|---o
|  / |
|    |
'----'
  / @
 /   @
 |_  |_
 |__)|__)
`);

B('strut_2', { group: 'dance', energy: 2, hair: 'b', anchor: 7, dx: 2 }, `
     H  o|@
     |  ,-'
     '---'
    .----.
o---|   /|
    |  / |
    |    |
    '----'
      | |
      | |
      | |
      | |_
      |___)
`);

B('stomp_up', { group: 'dance', energy: 2, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  |'---.
  |    |
  |    |_
  |_   |__)
  |__)
`);

B('stomp_down', { group: 'dance', energy: 2, hair: 'f', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  |@
  | @
  |  @
  |_  |_
 ,|__)|__),
`);

B('twist_r', { group: 'dance', energy: 2, hair: 'f', anchor: 3 }, `
   H  o|@
   |  ,-'
   '---'
  .----.
  |   /|---o
  |  / |
  |    |
  '----'
    / /
   / /
  | |
  | |_
  |___)
`);

B('swing_b', { group: 'dance', energy: 2, hair: 'b', anchor: 9 }, `
     H  o|@
     |  ,-'
     '---'
    .----.
o---|   /|
    |  / |
    |    |
    '----'
      @ @
       @ @
        | |
        | |_
        |___)
`);

B('point', { group: 'dance', energy: 2, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|----->
|  / |
|    |
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

B('sing', { group: 'dance', energy: 2, hair: 'b', anchor: 3 }, `
 H  o|@
 |  O-'o
 '---' |
.----. |
|   /|(_)
|  / |/
|    |
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

// ---- dance, energy 3 ------------------------------------------------------

B('fist_up', { group: 'dance', energy: 3, hair: 'b', anchor: 4 }, `
o
|
| H  o|@
| |  O-'
| '---'
@.----.
 |   /|@
 |  / | |
 |    | o
 '----'
   | |
   | |
   | |
   | |_
   |___)
`);

B('fists_up', { group: 'dance', energy: 3, hair: 'c', anchor: 4 }, `
o       o
| Ho o| |
| | O-| |
| '---' |
@.-----./
 | @ / |
 | @_/ |
 |  |  |
 '-----'
   | |
   | |
   | |
   | |
  _| |_
`);

B('bang_down', { group: 'dance', energy: 3, hair: 'f', anchor: 3 }, `
  H  o|@
  |  ,-'
.-'---'
|   /|@
|  / | |
|    | o
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

B('bang_up', { group: 'dance', energy: 3, hair: 'b', anchor: 5 }, `
 H  o|@
 |  O-'
 '---'
  .----.
  |   /|@
  |  / | |
  |    | o
  '----'
    | |
    | |
    | |
    | |_
    |___)
`);

B('pogo_crouch', { group: 'dance', energy: 3, hair: 'n', anchor: 4 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | o
'----'
  @ @
   | |
   | |_
   |___)
`);

B('pogo_air', { group: 'dance', energy: 3, hair: 'f', anchor: 4 }, `
 H  o|@
 |  O-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  @ @
   | |_
   |___)


`);

B('kick', { group: 'dance', energy: 3, hair: 'b', anchor: 3 }, `
 H  o|@
 |  O-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  |'--------__)
  |
  |
  |_
  |__)
`);

B('wind_fwd', { group: 'dance', energy: 3, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|----o
|  / |
|    |
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

B('wind_back', { group: 'dance', energy: 3, hair: 'n', anchor: 7 }, `
     H  o|@
     |  ,-'
     '---'
    .----.
o---|   /|
    |  / |
    |    |
    '----'
      | |
      | |
      | |
      | |_
      |___)
`);

// ---- break, energy 0 ------------------------------------------------------

B('smoke_hold', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o--.
'----'
  | |
  | |
  | |
  | |_
  |___)
`, { 6: '          r' });

B('smoke_drag', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'-.
 '---'(_)
.----. |
|   /|/
|  / |
|    |
'----'
  | |
  | |
  | |
  | |_
  |___)
`, { 1: '        r' });

B('smoke_exhale', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
 H  o|@  O
 |  ,-'o
 '---'
.----.
|   /|@
|  / | |
|    | o--.
'----'
  | |
  | |
  | |
  | |_
  |___)
`, { 6: '          r' });

B('smoke_puff', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
          o
        O
 H  o|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o--.
'----'
  | |
  | |
  | |
  | |_
  |___)
`, { 8: '          r' });

B('beer_hold', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
 H  o|@
 |  ,-'
 '---'
.----.  .
|   /|@ |
|  / | [ ]
|    | (_)
'----'
  | |
  | |
  | |
  | |_
  |___)
`, { 3: '        a', 4: '        a', 5: '       aaa' });

B('beer_swig', { group: 'break', energy: 0, hair: 'b', anchor: 3 }, `
 H  o|@
 |  ,-'-[=]
 '---'(_)
.----. |
|   /|/
|  / |
|    |
'----'
  | |
  | |
  | |
  | |_
  |___)
`, { 1: '       aaaa' });

B('wilt', { group: 'break', energy: 0, hair: 'w', anchor: 3 }, `
 H  o|@
 |  .-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

B('hairspray_a', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
     ~~<[]
        []
 H  o|@ (_)
 |  ,-'/
 '---'/
.----'
|    |
|    |
|    |
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

B('hairspray_b', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
 H  -|@
 |  ,-'
 '---'
.----.
|   /|@
|  / | |
|    | o
'----'
  | |
  | |
  | |
  | |_
  |___)
`);

B('lace_a', { group: 'break', energy: 0, hair: 'f', anchor: 8 }, `
  H  o|@
  |  ,-'
  '---'
 .----.
 |   /|@
 |  / | @
 '----'  @
  '--.---.@
     |   |(_)
     |__)|__)
`);

B('lace_b', { group: 'break', energy: 0, hair: 'f', anchor: 8 }, `
  H  o|@
  |  ,-'
  '---'
 .----.
 |   /|@
 |  / | @
 '----' (_)
  '--.---.'
     |   |
     |__)|__)
`);

B('n64_a', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
 H  o|@             @ /
 |  ,-'          .-------.
 '---'           |:::::::|
.----.           |::.-.::|
|   /|           |::| |::|
|  / |-.         |::'-'::|
|    | '[o]~~~~~~|-------|
|    |______.    | o o   |
'----'______)    '-------'
`, {
  2: '                  ggggggg',
  3: '                  ggggggg',
  4: '                  ggggggg',
  5: '                  ggggggg',
});

B('n64_b', { group: 'break', energy: 0, hair: 'f', anchor: 3 }, `
 H  o|@             @ /
 |  ,-'          .-------.
 '---'           |:::::::|
.----.           |:::::::|
|   /|           |::.-.::|
|  / |-.         |::| |::|
|    | .[o]~~~~~~|-------|
|    |______.    | o o   |
'----'______)    '-------'
`, {
  2: '                  ggggggg',
  3: '                  ggggggg',
  4: '                  ggggggg',
  5: '                  ggggggg',
});

B('tv_a', { group: 'break', energy: 0, hair: 'n', anchor: 3 }, `
 H  o|@             @ /
 |  ,-'          .-------.
 '---'           |~::~~::|
.----.           |:~~::~:|
|   /|           |~::~:~~|
|  / |-.         |:~::~::|
|    | '[=]      |-------|
|    |______. |  | o o   |
'----'______)[ ]'-------'
`, {
  2: '                  ggggggg',
  3: '                  ggggggg',
  4: '                  ggggggg',
  5: '                  ggggggg',
  7: '              a',
  8: '             aaa',
});

B('tv_b', { group: 'break', energy: 0, hair: 'b', anchor: 3 }, `
 H  o|@             @ /
 |  O-'          .-------.
 '---'           |:~~::~:|
.----.           |~::~:~~|
|   /|           |:~::~::|
|  / |-.         |~::~~::|
|    | '[=]      |-------|
|    |______. |  | o o   |
'----'______)[ ]'-------'
`, {
  2: '                  ggggggg',
  3: '                  ggggggg',
  4: '                  ggggggg',
  5: '                  ggggggg',
  7: '              a',
  8: '             aaa',
});

B('amp_a', { group: 'break', energy: 0, hair: 'b', anchor: 13 }, `
         H  o|@
         |  ,-'
         '---'
        .----.
        |   /|@
.-------|  / | |
| * o o |    | o
|======='----'
|:::::::| @ @
|:::::::|  @ @
|:::::::|   | |
|:::::::|   | |_
'-------'   |___)
`, { 6: '  r' });

B('amp_b', { group: 'break', energy: 0, hair: 'b', anchor: 13 }, `
         H  -|@
         |  ,-'
         '---'
        .----.
        |   /|@
.-------|  / | |
| . o o |    | o
|======='----'
|:::::::| @ @
|:::::::|  @ @
|:::::::|   | |
|:::::::|   | |_
'-------'   |___)
`);

// ---- easter eggs ----------------------------------------------------------

B('sleep_a', { group: 'egg', energy: 0, hair: 'f', anchor: 12 }, `
.-------.
| * o o |
|=======| H  -|@      z
|:::::::| |  ,-'    Z
|:::::::| '---'
|:::::::|.----.
|:::::::||   /|-.
|:::::::||  / |______.
'-------''----'______)
`, { 1: '  r' });

B('sleep_b', { group: 'egg', energy: 0, hair: 'f', anchor: 12 }, `
.-------.
| * o o |             Z
|=======| H  -|@
|:::::::| |  ,-'   z
|:::::::| '---'
|:::::::|.----.
|:::::::||   /|-.
|:::::::||  / |______.
'-------''----'______)
`, { 1: '  r' });

B('dazed_a', { group: 'egg', energy: 0, hair: 'n', anchor: 3 }, `
*     *
 H  x|@
 |  o-'
 '---'.
.----.
|   /|@
|  / | |
|    | o
'----'
  / @
 /   @
 |_  |_
 |__)|__)
`, { 3: '      r' });

B('dazed_b', { group: 'egg', energy: 0, hair: 'n', anchor: 3 }, `
   *
 H  x|@ *
 |  o-'
 '---'.
.----.
|   /|@
|  / | |
|    | o
'----'
  / @
 /   @
 |_  |_
 |__)|__)
`, { 3: '      r' });

/* Not punks: the stray cat (3 rows, walks right, two columns a step) and the
 * rabbit (4 rows, hops right: sit, then a long bound). */
/**
 * The animals, by frame name.
 *
 * @type {Record<string, SpriteExtra>}
 */
const CAT = {
  cat_a: { group: 'egg', energy: 0, anchor: 6, dx: 2, rows: [`        /@_/@`, `  ,_____(o.o)`, `  |/  @|  |/`] },
  cat_b: { group: 'egg', energy: 0, anchor: 6, dx: 2, rows: [`        /@_/@`, `  ,_____(-.-)`, `   @|  |/ @|`] },
  rabbit_a: { group: 'egg', energy: 0, anchor: 3, dx: 0, rows: [`   (@(@`, `  ( -.-)`, `  (")_(")`] },
  rabbit_b: { group: 'egg', energy: 0, anchor: 3, dx: 4, rows: [`     (@(@`, `  ,-( o.o)`, ` ( @__,__)`, `  @_/  @_)`] },
};

// ---- compositing ------------------------------------------------------------

/** Characters of the mouth row that lipstick colours. */
const LIP_CHARS = new Set([',', '-', 'O', 'o']);

/**
 * An empty grid of `ROWS` rows.
 *
 * @returns {string[][]} The grid.
 */
function blankRows() {
  return Array.from({ length: ROWS }, () => []);
}

/**
 * Write one character into a grid, padding the row out to reach it.
 *
 * @param {string[][]} grid The grid.
 * @param {number} row Row to write in; outside the grid is ignored.
 * @param {number} col Column to write at; left of the grid is ignored.
 * @param {string} ch The character.
 * @returns {void}
 */
function put(grid, row, col, ch) {
  if (row < 0 || row >= ROWS || col < 0) return;
  const r = grid[row];
  while (r.length < col) r.push(' ');
  r[col] = ch;
}

/**
 * Join a grid into right-trimmed rows.
 *
 * @param {string[][]} grid The grid.
 * @returns {string[]} The rows.
 */
function trim(grid) {
  return grid.map((r) => r.join('').replace(/\s+$/, ''));
}

/**
 * Compose one frame for one punk: body art, hair block, colour mask.
 *
 * @param {string} punkId Key of PUNKS.
 * @param {string} name Body name.
 * @returns {ComposedSprite} Rows, mask, and where the head is.
 */
function compose(punkId, name) {
  const punk = PUNKS[punkId];
  const body = BODIES[name];
  const top = ROWS - body.rows.length;
  const art = blankRows();
  const mask = blankRows();
  /** @type {SpriteHead | null} */
  let head = null;
  body.rows.forEach((line, i) => {
    [...line].forEach((ch, col) => {
      if (ch === 'H') {
        head = { row: top + i, col };
        ch = '|';
      }
      if (ch !== ' ') put(art, top + i, col, ch);
    });
    const m = body.mask[i];
    if (m) [...m].forEach((ch, col) => ch !== ' ' && put(mask, top + i, col, ch));
  });
  if (head) {
    const block = HAIR[punkId][body.hair] ?? HAIR[punkId].n;
    block.forEach((line, i) => {
      // @ts-expect-error `head` is set inside the forEach above, which flow analysis cannot see.
      const row = head.row - 3 + i;
      [...line].forEach((ch, j) => {
        // @ts-expect-error `head` is set inside the forEach above, which flow analysis cannot see.
        const col = head.col - 1 + j;
        if (ch === ' ' || col < 0) return;
        const existing = art[row]?.[col];
        if (existing && existing !== ' ') return; // body occludes hair
        put(art, row, col, ch);
        if (punk.bleached) put(mask, row, col, 'y');
        // Spike: red-dyed tips, the top row of every spike
        if (punk.tips && i === 0) put(mask, row, col, 'r');
      });
    });
    if (punk.lipstick) {
      // @ts-expect-error `head` is set inside the forEach above, which flow analysis cannot see.
      const row = head.row + 1;
      // @ts-expect-error `head` is set inside the forEach above, which flow analysis cannot see.
      for (let col = head.col + 1; col <= head.col + 4; col++) {
        if (LIP_CHARS.has(art[row]?.[col])) put(mask, row, col, 'p');
      }
    }
  }
  return { rows: trim(art), mask: trim(mask), head };
}

/**
 * What each directional character becomes in a mirror.
 *
 * @type {Record<string, string>}
 */
const SWAP = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{' };

/**
 * The same sprite facing left. Width defaults to the widest row; pass
 * FRAME_META[name].width so mirrored frames of one loop share a box.
 *
 * @param {MirrorInput} sprite Right-facing sprite.
 * @param {number} [width] Grid width to flip around.
 * @returns {Sprite} Left-facing sprite.
 */
export function mirror(sprite, width) {
  const w = width ?? Math.max(...sprite.rows.map((r) => r.length));
  /** @type {RowsFlip} */
  const flip = (rows) =>
    rows.map((r) => [...r.padEnd(w)].reverse().map((c) => SWAP[c] ?? c).join('').replace(/\s+$/, ''));
  return { rows: flip(sprite.rows), mask: flip(sprite.mask ?? sprite.rows.map(() => '')) };
}

/**
 * Width of the widest row.
 *
 * @param {string[]} rows The rows.
 * @returns {number} The width, 0 for none.
 */
const widthOf = (rows) => Math.max(0, ...rows.map((r) => r.length));

/**
 * Punk id to frame name to sprite, as they are composed.
 *
 * @type {Record<string, Record<string, Sprite>>}
 */
const sprites = {};
/**
 * Frame name to what the frame is, as it is composed.
 *
 * @type {Record<string, SpriteMeta>}
 */
const meta = {};

for (const punkId of Object.keys(PUNKS)) {
  sprites[punkId] = {};
  for (const name of Object.keys(BODIES)) {
    const { rows, mask, head } = compose(punkId, name);
    sprites[punkId][name] = { rows, mask };
    /** The body being composed. */
    const b = BODIES[name];
    /** The box every punk's version of the frame fits in. */
    const width = Math.max(meta[name]?.width ?? 0, widthOf(rows));
    meta[name] = { group: b.group, energy: b.energy, anchor: b.anchor, width, dx: b.dx ?? 0, head, hair: b.hair };
  }
}
// twist_l is twist_r turned around, so the twist loop can face both ways.
for (const punkId of Object.keys(PUNKS)) {
  sprites[punkId].twist_l = mirror(sprites[punkId].twist_r, meta.twist_r.width);
}
meta.twist_l = { ...meta.twist_r, anchor: meta.twist_r.width - 1 - meta.twist_r.anchor, head: null, facing: 'l' };

/**
 * The animals, composed.
 *
 * @type {Record<string, Sprite>}
 */
const extras = {};
for (const [name, c] of Object.entries(CAT)) {
  /** The animal's art, as it is drawn. */
  const rows = c.rows.map((r) => bs(r).replace(/\s+$/, ''));
  extras[name] = { rows, mask: rows.map(() => '') };
  meta[name] = { group: c.group, energy: c.energy, anchor: c.anchor, width: widthOf(rows), dx: c.dx, head: null, rows: rows.length };
}

/** Punk id to frame name to sprite, every one facing right. */
export const SPRITES = Object.freeze(sprites);
/** The animals, by frame name: not punks, and not 16 rows. */
export const EXTRAS = Object.freeze(extras);
/** What each frame is: group, energy, feet column, width, drift, head, hair. */
export const FRAME_META = Object.freeze(meta);

/**
 * Dance and between-song loops. A director may pick any of these by energy.
 *
 * @type {Readonly<Record<string, string[]>>}
 */
export const LOOPS = Object.freeze({
  idle: ['idle_a', 'idle_b'],
  sway: ['sway_b', 'idle_a', 'sway_f', 'idle_b'],
  sneer: ['idle_a', 'idle_a', 'sneer', 'sneer'],
  walk: ['walk_1', 'walk_2'],
  strut: ['strut_1', 'strut_2'],
  stomp: ['stomp_up', 'stomp_down'],
  twist: ['twist_r', 'sneer', 'twist_l', 'sneer'],
  swing: ['swing_b', 'twist_r'],
  front: ['sing', 'point', 'sneer', 'sing'],
  headbang: ['bang_down', 'bang_up'],
  pogo: ['pogo_crouch', 'pogo_air'],
  fist: ['fist_up', 'idle_a'],
  windmill: ['fist_up', 'wind_fwd', 'idle_a', 'wind_back'],
  chorus: ['fists_up', 'bang_down', 'fist_up', 'bang_up'],
  climax: ['pogo_crouch', 'pogo_air', 'fists_up', 'kick'],
  kick: ['stomp_up', 'kick'],
  smoke: ['smoke_hold', 'smoke_drag', 'smoke_exhale', 'smoke_puff'],
  beer: ['beer_hold', 'beer_swig'],
  n64: ['n64_a', 'n64_b'],
  tv: ['tv_a', 'tv_b'],
  amp: ['amp_a', 'amp_b'],
  hairspray: ['wilt', 'hairspray_a', 'hairspray_a', 'hairspray_b'],
  lace: ['lace_a', 'lace_b'],
});

/**
 * Easter eggs: pick these on purpose, not by energy. `cat` and `rabbit` are in EXTRAS, not SPRITES.
 *
 * @type {Readonly<Record<string, string[]>>}
 */
export const EGGS = Object.freeze({
  sleep: ['sleep_a', 'sleep_b'],
  dazed: ['dazed_a', 'dazed_b'],
  cat: ['cat_a', 'cat_b'],
  rabbit: ['rabbit_a', 'rabbit_a', 'rabbit_b'],
});

/** Energy of a loop: its strongest frame, as in dancing-with-marcel. */
export const LOOP_ENERGY = Object.freeze(
  Object.fromEntries(Object.entries(LOOPS).map(([loop, frames]) => [loop, Math.max(...frames.map((f) => FRAME_META[f].energy))])),
);
