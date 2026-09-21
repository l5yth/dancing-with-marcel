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
 * @file The show (SPEC F3 to F6): who is on the stage, where, facing which
 * way, in which loop and on which frame of it. Three punks walk on from the
 * wings, dance to the energy tier the scene director hears, and between songs
 * are dealt a scene each, so that no two are smoking at once. One may fall
 * asleep, one may wander off, and an animal may cross the floor. A break that
 * goes on is dealt again every few minutes, so the stage keeps moving on a
 * night when no music is heard at all.
 *
 * It advances on a tick and has no clock of its own: the caller decides how
 * long a tick lasts, half a beat while music plays, and says so. It knows
 * nothing of the page either. Chance is injected, so every rule here can be
 * tested to the frame. Pure (SPEC invariant 4).
 */

import {
  EGGS,
  EXTRAS,
  FRAME_META,
  LOOP_ENERGY,
  LOOPS,
  mirror,
  SPRITES,
} from '../sprites/asciipunk.js';

/** The stage, in character cells: its size, the floor row, and where each punk stands. */
export const STAGE = Object.freeze({
  cols: 120,
  rows: 21,
  floor: 18,
  homes: Object.freeze({ billy: 24, mo: 60, spike: 96 }),
});

/**
 * Where each punk waits before the show. The one with furthest to go stands
 * nearest, so nobody walks through anybody.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const WINGS = Object.freeze({ billy: -28, mo: -10, spike: STAGE.cols + 10 });

/** The punk who stays through a break, so that the stage is never empty. */
export const ANCHOR_PUNK = 'mo';

/** A punk this close to the middle of the stage has no centre to face, in columns. */
export const CENTRE_COLS = 6;

/** Frames a dance is held before it may be swapped for another of its tier. */
export const DANCE_HOLD_FRAMES = 16;

/** Chance, on each frame past the hold, that the dance is swapped. */
export const SWAP_CHANCE = 0.5;

/** How far a drifting dance may wander from home before it turns round, in columns. */
export const DRIFT_COLS = 14;

/** How far past the edge of the stage a punk walks before it is gone, in columns. */
export const WINGS_COLS = 20;

/** How far outside the stage an animal starts and ends, in columns. */
export const ANIMAL_WINGS_COLS = 14;

/**
 * Columns the cat covers in a tick. It ambles while the ticks are slow, and
 * creeps when they come at every half beat, so that it crosses at a cat's pace
 * either way. The rabbit hops by the `dx` of its frames.
 */
export const CAT_COLS = Object.freeze({ break: 5, music: 1 });

/** Frames a punk stays dazed. */
export const DAZED_FRAMES = 8;

/** Chance of being dazed when the tier drops under a punk who was going all out. */
export const DAZED_CHANCE = 0.35;

/** The loops that can leave a punk dazed. */
const DAZING = new Set(['pogo', 'climax']);

/** Chance, for each punk who stays, of sleeping through the break. */
export const SLEEP_CHANCE = 0.15;

/** Chance that one of the outer punks walks off when a break begins. */
export const WANDER_CHANCE = 0.45;

/** Chance that an animal crosses the floor when a break begins. */
export const ANIMAL_CHANCE = 0.55;

/** Chance that the animal is the rabbit and not the cat. */
export const RABBIT_CHANCE = 0.25;

/**
 * How long a break goes on before its scenes are dealt again, in milliseconds:
 * somewhere between the two, drawn afresh every time.
 */
export const REFRESH_MS = Object.freeze({ min: 60000, max: 300000 });

/**
 * The between-song scenes a punk may be dealt.
 *
 * @type {LoopList}
 */
export const BREAK_LOOPS = Object.freeze(
  Object.keys(LOOPS).filter((loop) => LOOP_ENERGY[loop] === 0),
);

/**
 * The scenes that bring a television. Homes are 36 columns apart and a set
 * stands 17 columns in front of whoever watches it, so two neighbours facing
 * each other would put their sets on the same cells. One screen a deal.
 */
const SCREENS = new Set(['n64', 'tv']);

/**
 * The dances of a tier: loops of that energy that open on a dance frame, which
 * leaves out `walk`.
 *
 * @param {number} tier Energy tier, 1 to 3.
 * @returns {string[]} Loop names.
 */
export function dancesOf(tier) {
  return Object.keys(LOOPS).filter(
    (loop) => LOOP_ENERGY[loop] === tier && FRAME_META[LOOPS[loop][0]].group === 'dance',
  );
}

/**
 * Left-facing sprites, made once each.
 *
 * @type {Map<string, Sprite>}
 */
const MIRRORED = new Map();

/**
 * The sprite of a frame, facing the way it is asked.
 *
 * @param {Record<string, Sprite>} frames The frames of a punk, or the animals.
 * @param {string} owner Who they belong to, for the cache.
 * @param {string} frame Frame name.
 * @param {number} facing 1 for right, -1 for left.
 * @returns {Sprite} The sprite.
 */
function spriteOf(frames, owner, frame, facing) {
  if (facing > 0) {
    return frames[frame];
  }
  const key = `${owner}/${frame}`;
  let turned = MIRRORED.get(key);
  if (turned === undefined) {
    turned = mirror(frames[frame], FRAME_META[frame].width);
    MIRRORED.set(key, turned);
  }
  return turned;
}

/** Who is on the stage, and what each is doing. */
export class Show {
  /**
   * Set the stage between songs, with nobody on it: all three are in the wings
   * and walking on.
   *
   * @param {ShowOptions} [options] Where chance comes from, and how long a
   *   break goes on before it is dealt again.
   */
  constructor({
    random = Math.random,
    refreshMinMs = REFRESH_MS.min,
    refreshMaxMs = REFRESH_MS.max,
  } = {}) {
    /**
     * Where chance comes from.
     * @type {RandomSource}
     */
    this.random = random;
    /**
     * Shortest and longest a break goes on before it is dealt again, in milliseconds.
     * @type {{min: number, max: number}}
     */
    this.refresh = { min: refreshMinMs, max: Math.max(refreshMinMs, refreshMaxMs) };
    /**
     * How long the break has gone on since it was last dealt, in milliseconds.
     * @type {number}
     */
    this.breakMs = 0;
    /**
     * How long this deal lasts, in milliseconds.
     * @type {number}
     */
    this.refreshMs = 0;
    /**
     * Whether music is playing.
     * @type {boolean}
     */
    this.dancing = false;
    /**
     * Energy tier the punks dance to, 1 to 3; 0 between songs.
     * @type {number}
     */
    this.tier = 0;
    /**
     * The punks, left to right by home.
     * @type {PunkState[]}
     */
    this.punks = Object.entries(STAGE.homes).map(([id, home]) => ({
      id,
      home,
      x: WINGS[id],
      facing: WINGS[id] < home ? 1 : -1,
      loop: 'walk',
      frames: LOOPS.walk,
      index: 0,
      held: 0,
      state: 'enter',
      scene: BREAK_LOOPS[0],
    }));
    /**
     * The animal crossing the floor, if one is.
     * @type {AnimalState | null}
     */
    this.animal = null;
    this.deal();
    this.wind();
  }

  /**
   * Start the clock of a deal: draw how long it lasts.
   *
   * @returns {void}
   */
  wind() {
    this.breakMs = 0;
    this.refreshMs = this.refresh.min + this.random() * (this.refresh.max - this.refresh.min);
  }

  /**
   * Choose one of a list at random.
   *
   * @template T
   * @param {ReadonlyArray<T>} choices What to choose from.
   * @returns {T} The choice.
   */
  pick(choices) {
    return choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
  }

  /**
   * Hear what the scene director hears. Nothing happens unless it changed; when
   * it did, whoever was given something new to do is on its first frame, which
   * the caller should draw before the next tick moves it on.
   *
   * @param {boolean} dancing Whether music is playing.
   * @param {number} tier Energy tier while it is, 1 to 3.
   * @returns {boolean} Whether anything changed.
   */
  hear(dancing, tier) {
    const next = dancing ? Math.min(3, Math.max(1, tier)) : 0;
    if (next === this.tier) {
      return false;
    }
    const dropped = next < this.tier;
    this.dancing = dancing;
    this.tier = next;
    if (!dancing) {
      this.intermission();
      return true;
    }
    for (const punk of this.punks) {
      if (punk.state !== 'stage') {
        // In the wings, or on the way there: the music is on, come home.
        this.enter(punk);
      } else if (dropped && DAZING.has(punk.loop) && this.random() < DAZED_CHANCE) {
        this.perform(punk, 'dazed', EGGS.dazed);
        this.faceCentre(punk);
      } else {
        this.dance(punk);
      }
    }
    return true;
  }

  /**
   * A break begins, or has gone on long enough to be dealt again: deal the
   * scenes, and let chance send one punk to the wings, any of the others to
   * sleep, and an animal across the floor. Whoever wandered off last time
   * comes back, even from half way, and whoever slept wakes up, so that a deal
   * always changes something.
   *
   * @returns {void}
   */
  intermission() {
    this.deal();
    const onStage = this.punks.filter((punk) => punk.state === 'stage');
    const outer = onStage.filter((punk) => punk.id !== ANCHOR_PUNK);
    const leaver = outer.length > 0 && this.random() < WANDER_CHANCE ? this.pick(outer) : null;
    for (const punk of this.punks) {
      // In the wings, or still on the way there: a deal that fell while one
      // was leaving could otherwise send the other after it, and leave the
      // one in the middle alone.
      if (punk.state === 'off' || punk.state === 'exit') {
        this.enter(punk);
      }
    }
    for (const punk of onStage) {
      if (punk === leaver) {
        this.leave(punk);
      } else {
        if (punk.loop !== 'sleep' && this.random() < SLEEP_CHANCE) {
          punk.scene = 'sleep';
        }
        this.settle(punk);
      }
    }
    // One animal at a time: a cat already crossing is not sent back to start.
    if (this.animal === null && this.random() < ANIMAL_CHANCE) {
      const kind = this.random() < RABBIT_CHANCE ? 'rabbit' : 'cat';
      this.animal = { kind, frames: EGGS[kind], index: 0, x: -ANIMAL_WINGS_COLS };
    }
    this.wind();
  }

  /**
   * Deal the between-song scenes, one a punk, no two alike, nobody the scene
   * it is already in, and only one of them with a television.
   *
   * @returns {void}
   */
  deal() {
    const shuffled = [...BREAK_LOOPS];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.min(index, Math.floor(this.random() * (index + 1)));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    const screen = shuffled.find((scene) => SCREENS.has(scene));
    const deck = shuffled.filter((scene) => !SCREENS.has(scene) || scene === screen);
    for (const punk of this.punks) {
      // There are more scenes than punks, so the deck always holds another.
      const card = deck.findIndex((scene) => scene !== punk.loop);
      [punk.scene] = deck.splice(card, 1);
    }
  }

  /**
   * Put a punk into a loop from its first frame.
   *
   * @param {PunkState} punk The punk.
   * @param {string} loop Loop name.
   * @param {LoopList} frames The loop's frames.
   * @returns {void}
   */
  perform(punk, loop, frames) {
    punk.loop = loop;
    punk.frames = frames;
    punk.index = 0;
    punk.held = 0;
  }

  /**
   * Turn a punk to face the middle of the stage. One who stands there has no
   * middle to face, and picks a side.
   *
   * @param {PunkState} punk The punk.
   * @returns {void}
   */
  faceCentre(punk) {
    const offset = punk.x - STAGE.cols / 2;
    if (Math.abs(offset) > CENTRE_COLS) {
      punk.facing = offset < 0 ? 1 : -1;
    } else {
      punk.facing = this.random() < 0.5 ? 1 : -1;
    }
  }

  /**
   * Give a punk a dance of the current tier that is not the one it has. A
   * dance that drifts is going somewhere, and picks its own way to face.
   *
   * @param {PunkState} punk The punk.
   * @returns {void}
   */
  dance(punk) {
    if (this.strayed(punk)) {
      return;
    }
    const all = dancesOf(this.tier);
    const others = all.filter((loop) => loop !== punk.loop);
    const loop = this.pick(others.length > 0 ? others : all);
    this.perform(punk, loop, LOOPS[loop]);
    if (FRAME_META[LOOPS[loop][0]].dx > 0) {
      punk.facing = this.random() < 0.5 ? 1 : -1;
    } else {
      this.faceCentre(punk);
    }
  }

  /**
   * Put a punk into the between-song scene it was dealt.
   *
   * @param {PunkState} punk The punk.
   * @returns {void}
   */
  settle(punk) {
    if (this.strayed(punk)) {
      return;
    }
    const frames = punk.scene === 'sleep' ? EGGS.sleep : LOOPS[punk.scene];
    this.perform(punk, punk.scene, frames);
    this.faceCentre(punk);
  }

  /**
   * Send a punk home first if a drifting dance has left it somewhere else.
   * What it was about to be given waits until it arrives. Without this a punk
   * who has strutted stays where the strut left it, and sits down to watch TV
   * in its neighbour's lap.
   *
   * @param {PunkState} punk The punk.
   * @returns {boolean} Whether it was away from home, and is now walking there.
   */
  strayed(punk) {
    if (punk.x === punk.home) {
      return false;
    }
    this.enter(punk);
    return true;
  }

  /**
   * Walk a punk home from wherever it is. One who is there already has arrived.
   *
   * @param {PunkState} punk The punk.
   * @returns {void}
   */
  enter(punk) {
    if (punk.x === punk.home) {
      this.arrive(punk);
      return;
    }
    punk.state = 'enter';
    punk.facing = punk.x < punk.home ? 1 : -1;
    this.perform(punk, 'walk', LOOPS.walk);
  }

  /**
   * Stand a punk on its home and give it what the moment calls for.
   *
   * @param {PunkState} punk The punk.
   * @returns {void}
   */
  arrive(punk) {
    punk.x = punk.home;
    punk.state = 'stage';
    if (this.dancing) {
      this.dance(punk);
    } else {
      this.settle(punk);
    }
  }

  /**
   * Send a punk off to the wing on its side of the stage.
   *
   * @param {PunkState} punk The punk.
   * @returns {void}
   */
  leave(punk) {
    punk.state = 'exit';
    punk.facing = punk.home < STAGE.cols / 2 ? -1 : 1;
    this.perform(punk, 'walk', LOOPS.walk);
  }

  /**
   * Advance everyone by one frame. A break that has gone on long enough is
   * dealt again, which leaves whoever it moved on a first frame.
   *
   * @param {number} [ms] How long the tick lasted, in milliseconds. Left out,
   *   the break never grows older.
   * @returns {void}
   */
  tick(ms = 0) {
    for (const punk of this.punks) {
      if (punk.state !== 'off') {
        this.step(punk);
      }
    }
    const { animal } = this;
    if (animal !== null) {
      animal.index = (animal.index + 1) % animal.frames.length;
      animal.x += this.pace(animal);
      if (animal.x > STAGE.cols + ANIMAL_WINGS_COLS) {
        this.animal = null;
      }
    }
    if (!this.dancing) {
      this.breakMs += ms;
      if (this.breakMs >= this.refreshMs) {
        this.intermission();
      }
    }
  }

  /**
   * How far an animal moves on the frame it has just reached.
   *
   * @param {AnimalState} animal The animal.
   * @returns {number} Columns, to the right.
   */
  pace(animal) {
    if (animal.kind === 'rabbit') {
      return FRAME_META[animal.frames[animal.index]].dx;
    }
    return this.dancing ? CAT_COLS.music : CAT_COLS.break;
  }

  /**
   * Advance one punk by one frame: the next frame of its loop, the drift that
   * frame carries, and whatever that brings it to.
   *
   * @param {PunkState} punk The punk.
   * @returns {void}
   */
  step(punk) {
    punk.index = (punk.index + 1) % punk.frames.length;
    punk.held += 1;
    punk.x += FRAME_META[punk.frames[punk.index]].dx * punk.facing;

    if (punk.state === 'enter') {
      // A stride may carry it past: it stops on its home all the same.
      const home = punk.facing > 0 ? punk.x >= punk.home : punk.x <= punk.home;
      if (home) {
        this.arrive(punk);
      }
      return;
    }
    if (punk.state === 'exit') {
      if (punk.x < -WINGS_COLS || punk.x > STAGE.cols + WINGS_COLS) {
        punk.state = 'off';
      }
      return;
    }
    if (!this.dancing) {
      return;
    }
    if (punk.loop === 'dazed') {
      if (punk.held >= DAZED_FRAMES) {
        this.dance(punk);
      }
      return;
    }
    // A drifting dance turns for home before it leaves its patch.
    if (Math.abs(punk.x - punk.home) > DRIFT_COLS) {
      punk.facing = punk.x < punk.home ? 1 : -1;
    }
    if (punk.held >= DANCE_HOLD_FRAMES && this.random() < SWAP_CHANCE) {
      this.dance(punk);
    }
  }

  /**
   * Who is doing what, in words, for the debug overlay.
   *
   * @returns {string} Every punk and its loop, and the animal if one is crossing.
   */
  caption() {
    const cast = this.punks.map((punk) => `${punk.id} ${punk.state === 'off' ? 'off' : punk.loop}`);
    if (this.animal !== null) {
      cast.push(this.animal.kind);
    }
    return cast.join(', ');
  }

  /**
   * What to draw, back to front: each sprite facing the way its owner does and
   * placed by its feet, so that a change of frame never moves them.
   *
   * @returns {Placement[]} The sprites and where their top left corners go.
   */
  placements() {
    /** @type {Placement[]} */
    const placed = [];
    for (const punk of this.punks) {
      if (punk.state !== 'off') {
        const frame = punk.frames[punk.index];
        placed.push(this.place(SPRITES[punk.id], punk.id, frame, punk.facing, punk.x));
      }
    }
    if (this.animal !== null) {
      const { frames, index, x } = this.animal;
      placed.push(this.place(EXTRAS, 'animal', frames[index], 1, x));
    }
    return placed;
  }

  /**
   * Place one sprite with its feet on the floor.
   *
   * @param {Record<string, Sprite>} frames The frames of a punk, or the animals.
   * @param {string} owner Who they belong to.
   * @param {string} frame Frame name.
   * @param {number} facing 1 for right, -1 for left.
   * @param {number} x Column of the feet.
   * @returns {Placement} The sprite and where it goes.
   */
  place(frames, owner, frame, facing, x) {
    const { anchor, width } = FRAME_META[frame];
    const sprite = spriteOf(frames, owner, frame, facing);
    return {
      sprite,
      left: x - (facing > 0 ? anchor : width - 1 - anchor),
      top: STAGE.floor - (sprite.rows.length - 1),
    };
  }
}
