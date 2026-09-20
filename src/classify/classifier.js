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
 * @file Music or break (SPEC D2, D7). Four questions decide it, and the room
 * itself answers the first one:
 *
 * 1. **Is it loud?** Not against a fixed level, but against an adaptive floor
 *    that learns the room while nothing musical is playing. A quiet flat and a
 *    loud party then need no separate tuning.
 * 2. **Is it tonal?** The *most tonal* audible moment of the last
 *    `timbreWindowMs` is at most `maxFlatness`: one clear moment in a second
 *    and a half is enough. Music passes because instruments have peaks, even
 *    when a cymbal or a shout makes most of the window flat; applause, hiss,
 *    and chatter never dip below about 0.75, so nothing in their window
 *    qualifies. Requiring *every* moment to be tonal would reject music, not
 *    noise. Only audible moments count, since silence between drum hits is
 *    flat by definition. The margin is about 0.15, which is why `maxFlatness`
 *    is tunable and why the rehearsal is the check that matters (SPEC R2).
 * 3. **Is something happening?** Repeated onsets, or bass. Either is enough, so
 *    a thin track full of strumming and a bass-heavy one both pass, including a
 *    guitar intro before the band comes in. Onsets are counted, not measured,
 *    because one loud attack starts a feedback squeal too. This was meant to be
 *    what tells a PA hum from music, and it is not: a hum is all bass, and at a
 *    low level it scores onsets out of its own noise. That is question 4's job.
 * 4. **Does the level move?** The audible level spreads at least
 *    `minLevelSwingDb` over the timbre window, from its 10th percentile to its
 *    90th. In a calm room the floor sinks most of the way to its clamp, and
 *    then a fridge clears the bar by more than ten decibels, is very tonal, and
 *    is all bass: yes to all three questions above. What a machine does not do
 *    is change. It is a spread and not a level, so unlike a fixed threshold it
 *    holds at any microphone gain. Staying asks for a third of what entering
 *    did, and while a song is playing a window too empty to read counts as
 *    moving; see `update`.
 *
 * The detected tempo deliberately takes no part in the decision. A steady tone
 * has a nearly constant onset envelope, which correlates with itself at every
 * lag and yields a confident tempo out of rounding noise; letting that vote
 * would hand the whine the very evidence it should fail on. Tempo decides how
 * fast Marcel dances, not whether he dances.
 *
 * The answers feed the hysteresis of SPEC D2: `musicEnterMs` of yes to start
 * dancing, `breakHoldMs` of no to stop. Pure: time advances only through the
 * frame durations it is fed (SPEC invariant 4).
 */

/** Level the floor starts at, in dBFS, before any audio has been heard. */
export const FLOOR_START_DB = -60;

/** Quietest the floor may go, in dBFS: below this, faint noise would look loud. */
export const FLOOR_MIN_DB = -80;

/** Loudest the floor may go, in dBFS: above this, nothing in the room would count as music. */
export const FLOOR_MAX_DB = -25;

/**
 * Share of the timbre window that must be audible before its spread is read:
 * below it, the onset of a steady sound would pass for movement.
 */
const MIN_AUDIBLE_SHARE = 0.5;

/**
 * Share of `minLevelSwingDb` that is enough to keep dancing. Entering asks for
 * all of it.
 */
const STAY_SWING_SHARE = 1 / 3;

/** Most hops a window may hold, whatever the frame length. */
const MAX_WINDOW_HOPS = 4096;

/**
 * Keep a value inside a range.
 *
 * @param {number} value The value.
 * @param {number} low Lowest allowed.
 * @param {number} high Highest allowed.
 * @returns {number} The value, clamped.
 */
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/** Decides break or music from the analyzer's frames. */
export class Classifier {
  /**
   * Create a classifier in the `break` state, with the floor at
   * {@link FLOOR_START_DB}.
   *
   * @param {Readonly<Config>} config Thresholds and timings.
   */
  constructor(config) {
    /**
     * Thresholds and timings.
     * @type {Readonly<Config>}
     */
    this.config = config;
    /**
     * Current state.
     * @type {State}
     */
    this.state = 'break';
    /**
     * Milliseconds the condition for leaving the current state has held.
     * @type {number}
     */
    this.heldMs = 0;
    /**
     * Learned level of the room, in dBFS.
     * @type {number}
     */
    this.floorDb = FLOOR_START_DB;
    /**
     * Loudest hop of the level window, in dBFS; `null` before the first frame.
     * @type {number | null}
     */
    this.levelDb = null;
    /**
     * Most tonal (lowest) flatness among the audible hops of the timbre window,
     * 1 when there are none.
     * @type {number}
     */
    this.flatness = 1;
    /**
     * Most bass among the audible hops of the timbre window, 0 when none.
     * @type {number}
     */
    this.bass = 0;
    /**
     * Strongest onset among the audible hops of the timbre window, 0 when none.
     * @type {number}
     */
    this.flux = 0;
    /**
     * How many audible hops of the timbre window carry an onset.
     * @type {number}
     */
    this.onsets = 0;
    /**
     * Spread of the audible level peak over the timbre window, from its 10th
     * to its 90th percentile in dB; 0 while less than half of it is audible.
     * @type {number}
     */
    this.swing = 0;
    /**
     * Whether the swing could be read: `false` while less than half the timbre
     * window is audible, as in the first moments after a stop.
     * @type {boolean}
     */
    this.swingKnown = false;
    /**
     * Whether the audio looks like music right now, before the hysteresis.
     * @type {boolean}
     */
    this.musicLike = false;
    /**
     * Level, flatness, and bass of each hop in the timbre window, oldest first.
     * @type {SpectrumFrame[]}
     */
    this.recent = [];
    /**
     * Level in dBFS of each hop in the timbre window, oldest first.
     * @type {number[]}
     */
    this.levels = [];
    /**
     * The level peak as it stood at each hop of the timbre window, oldest
     * first: what the swing is read from.
     * @type {number[]}
     */
    this.peaks = [];
  }

  /**
   * Feed one analysis frame.
   *
   * @param {AnalyzerFrame} frame What the analyzer measured.
   * @param {number} frameMs Duration of the audio the frame covers.
   * @returns {State} The state after this frame.
   */
  update(frame, frameMs) {
    const { musicOverFloorDb, breakUnderFloorDb, musicEnterMs, breakHoldMs } = this.config;
    this.remember(frame, frameMs);
    const dancing = this.state === 'music';
    // Which moments count as audible follows the threshold in force. While
    // dancing that is the lower one: read a quiet passage against the entry
    // threshold and its moments look like silence, silence reads as flat, and
    // the song ends on a bridge. This is what makes the two thresholds differ
    // beyond the memory of the timbre window.
    const audibleDb = this.floorDb + (dancing ? breakUnderFloorDb : musicOverFloorDb);
    this.measure(audibleDb);

    const tonal = this.flatness <= this.config.maxFlatness;
    const pulse = this.onsets >= this.config.minOnsets || this.bass >= this.config.minBass;
    // Staying needs less movement than entering did, like the two level
    // thresholds: a limiter leaves a record hovering around one bar, and one
    // bar for both dropped it twice in forty seconds. And while a song is
    // playing, a window too empty to read is not evidence of stillness: after
    // a stop the spread is unreadable for half a window, which turned a stop
    // of 1.5 s into a break 0.35 s after the band came back. To start dancing,
    // though, the evidence has to be there.
    const bar = this.config.minLevelSwingDb * (dancing ? STAY_SWING_SHARE : 1);
    const moves = this.swingKnown ? this.swing >= bar : dancing;
    // One threshold does both jobs: below it there is nothing audible to read a
    // timbre from, so a separate level test would be saying the same thing twice.
    this.musicLike = this.levelDb !== null && this.levelDb >= audibleDb && tonal && pulse && moves;

    if (!dancing) {
      this.heldMs = this.musicLike ? this.heldMs + frameMs : 0;
      if (this.heldMs >= musicEnterMs) {
        this.state = 'music';
        this.heldMs = 0;
      }
    } else {
      // Leaving needs less level than entering did, so a quiet passage in a
      // song does not flip the state back and forth: `audibleDb` above already
      // carries the lower threshold while dancing.
      this.heldMs = this.musicLike ? 0 : this.heldMs + frameMs;
      if (this.heldMs >= breakHoldMs) {
        this.state = 'break';
        this.heldMs = 0;
      }
    }
    this.adaptFloor(frameMs, dancing);
    return this.state;
  }

  /**
   * Add a frame to the windows and drop what has expired.
   *
   * @param {AnalyzerFrame} frame What the analyzer measured.
   * @param {number} frameMs Duration of the audio the frame covers.
   * @returns {void}
   */
  remember(frame, frameMs) {
    const hops = (/** @type {number} */ ms) => clamp(Math.round(ms / frameMs), 1, MAX_WINDOW_HOPS);
    this.recent.push({ flux: frame.flux, flatness: frame.flatness, bass: frame.bass });
    this.levels.push(frame.levelDb);
    const timbreHops = hops(this.config.timbreWindowMs);
    while (this.recent.length > timbreHops) {
      this.recent.shift();
      this.levels.shift();
    }
    const levelHops = Math.min(timbreHops, hops(this.config.levelWindowMs));
    this.levelDb = Math.max(...this.levels.slice(-levelHops));
    this.peaks.push(this.levelDb);
    while (this.peaks.length > timbreHops) {
      this.peaks.shift();
    }
  }

  /**
   * Read the timbre of the audible hops in the window.
   *
   * @param {number} audibleDb Level at or above which a hop counts as audible.
   * @returns {void}
   */
  measure(audibleDb) {
    let flatness = 1;
    let bass = 0;
    let flux = 0;
    let onsets = 0;
    let audible = false;
    for (let index = 0; index < this.recent.length; index += 1) {
      if (this.levels[index] >= audibleDb) {
        audible = true;
        flatness = Math.min(flatness, this.recent[index].flatness);
        bass = Math.max(bass, this.recent[index].bass);
        flux = Math.max(flux, this.recent[index].flux);
        if (this.recent[index].flux >= this.config.minFlux) {
          onsets += 1;
        }
      }
    }
    this.flatness = audible ? flatness : 1;
    this.bass = audible ? bass : 0;
    this.flux = audible ? flux : 0;
    this.onsets = onsets;
    const spread = this.spread(audibleDb);
    this.swingKnown = spread !== null;
    this.swing = spread ?? 0;
  }

  /**
   * How far the audible level spreads over the timbre window: the distance
   * from its 10th to its 90th percentile, in dB.
   *
   * It is read from the level peak and not from the raw level of each hop. A
   * 50 Hz hum has a 20 ms period and the level is read over an 11.6 ms hop, a
   * little over half of it, so the raw level beats against the hop: 4.0 dB
   * from its 10th percentile to its 90th while nothing is happening. The same
   * aliasing gives a hum a confident tempo. The peak over `levelWindowMs` is
   * the level the first question already trusts. On it a fridge spreads
   * 0.00 dB, and the calmest twentieth of the reference records 0.4 to 0.6.
   *
   * Percentiles and not a standard deviation, and only once half the window is
   * audible, because a sound that merely starts is not moving. The two hops
   * that straddle its onset sit between the old level and the new one, and one
   * such outlier holds a standard deviation up for the whole window: long
   * enough to be declared music, lock a tempo, and dance for two seconds to a
   * fridge switching on. Among half a window of audible hops those two are
   * under a thirtieth of the sample and fall outside the percentiles.
   *
   * @param {number} audibleDb Level at or above which a moment counts as audible.
   * @returns {number | null} The spread, or `null` while less than half the
   *   window is audible and there is nothing to read it from.
   */
  spread(audibleDb) {
    const audible = this.peaks.filter((peak) => peak >= audibleDb).sort((a, b) => a - b);
    if (audible.length < Math.max(2, this.peaks.length * MIN_AUDIBLE_SHARE)) {
      return null;
    }
    const at = (/** @type {number} */ share) => audible[Math.floor((audible.length - 1) * share)];
    return at(0.9) - at(0.1);
  }

  /**
   * Let the floor learn the room. It drops to a new quiet level at once and
   * climbs back slowly, and it holds still while a song is playing or the audio
   * looks like one, so neither a song under way nor a song that was already
   * playing when the page opened can pull the floor up behind it.
   *
   * Holding still only once the state had turned was tried on 2026-09-20 and
   * withdrawn the same day. It was meant to let a wrong first impression
   * correct itself, and it cannot: the state turns within a second and holds
   * the floor anyway. What it did do was chase every song through the 1.75 s
   * it takes to be sure of one, lift the bar 3 dB, and lose the quiet ones: a
   * band ten decibels over the room went from 97% music to never heard. The
   * fourth question is what keeps a machine out, and with it all four saying
   * yes is evidence enough to stop learning.
   *
   * @param {number} frameMs Duration of the audio the frame covers.
   * @param {boolean} dancing Whether a song was already playing this frame.
   * @returns {void}
   */
  adaptFloor(frameMs, dancing) {
    if (this.musicLike || dancing || this.levelDb === null) {
      return;
    }
    // A quieter room is taken at once and a louder one only at `rise` a frame,
    // which is one minimum: below the floor the target wins, above it the climb does.
    const rise = (this.config.floorRiseDbPerSec * frameMs) / 1000;
    this.floorDb = clamp(Math.min(this.levelDb, this.floorDb + rise), FLOOR_MIN_DB, FLOOR_MAX_DB);
  }
}
