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
 * @file Music or break (SPEC D2, D7). The default is break: he dances only on
 * sustained evidence of a pulse, and three questions have to agree.
 *
 * 1. **Is anything there?** The level peak sits over an adaptive floor that
 *    learns the room, so a quiet flat and a loud party need no separate tuning.
 * 2. **Does the level move?** It spreads at least `minLevelSwingDb` over the
 *    timbre window. A veto on machines, which do not change: a fridge spreads
 *    0.00 to 0.03 dB and the most heavily limited record 0.15. It is what
 *    keeps out a mains hum, whose onset envelope aliases against
 *    the hop and scores a tempo confidence of 0.92.
 * 3. **Is there a pulse, and has there been for a while?** The median tempo
 *    confidence of the last `pulseWindow` seconds is at least `pulseEnter`.
 *    This is the question that decides. On the first real recordings the gate
 *    ever met, a rumbling room scored a median of 0.075 and never over 0.10,
 *    talking the same, and a punk song through a phone speaker 0.12 with
 *    stretches over 0.14. It needs no setting for the microphone, because an
 *    autocorrelation is normalised.
 *
 * Until 2026-09-20 there were two more questions, whether the sound was tonal
 * and whether it had onsets or bass, and the pulse took no part. They had only
 * ever met synthetic noise. A real room rumbles, which is a peaky spectrum and
 * so "tonal", nearly all bass, and restless; a real voice is harmonic, bassy
 * and lively. Both answered yes to everything and he danced to 94% of an empty
 * room. The two questions are gone; what they measured is still shown.
 *
 * Staying is easier than starting: a lower level, and `pulseLeave` instead of
 * `pulseEnter`. And leaving has two
 * clocks. When the sound stops, or stops moving, he stops after `breakHoldMs`.
 * When it goes on without a pulse, as talking straight after a song does, he
 * stops after `pulseLeaveMs`, which is long, because the pulse of a real song
 * dips for seconds at a time.
 *
 * Pure: time advances only through the frame durations it is fed (SPEC
 * invariant 4).
 */

/** Level the floor starts at, in dBFS, before any audio has been heard. */
export const FLOOR_START_DB = -60;

/** Quietest the floor may go, in dBFS: below this, faint noise would look loud. */
export const FLOOR_MIN_DB = -80;

/** Loudest the floor may go, in dBFS: above this, nothing in the room would count as music. */
export const FLOOR_MAX_DB = -25;

/** How often the tempo confidence is sampled into the pulse window, in milliseconds. */
export const PULSE_EVERY_MS = 1000;

/**
 * How long after the start the tempo confidence is not yet believed, in
 * milliseconds. The analyzer reads the tempo from eight seconds of onset
 * envelope and starts reporting at four. An autocorrelation over few beats
 * flatters whatever it is given: applause, a voice and a band all showed a
 * streak of "pulse" between the eighth and tenth second of their lives.
 */
export const PULSE_WARMUP_MS = 8000;

/**
 * Share of the timbre window that must be audible before its spread is read:
 * below it, the onset of a steady sound would pass for movement.
 */
const MIN_AUDIBLE_SHARE = 0.5;

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
     * Milliseconds the audio has looked like music, while in `break`.
     * @type {number}
     */
    this.heldMs = 0;
    /**
     * Milliseconds the sound has been gone or still, while in `music`.
     * @type {number}
     */
    this.quietMs = 0;
    /**
     * Milliseconds the pulse has been too faint to stay, while in `music`.
     * @type {number}
     */
    this.faintMs = 0;
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
     * 1 when there are none. Shown, not asked.
     * @type {number}
     */
    this.flatness = 1;
    /**
     * Most bass among the audible hops of the timbre window, 0 when none.
     * Shown, not asked.
     * @type {number}
     */
    this.bass = 0;
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
     * The pulse evidence: median tempo confidence of the pulse window, 0 until
     * half of it has been filled.
     * @type {number}
     */
    this.pulse = 0;
    /**
     * Tempo confidence sampled once every {@link PULSE_EVERY_MS}, oldest first.
     * @type {number[]}
     */
    this.confidences = [];
    /**
     * Milliseconds fed since the confidence was last sampled.
     * @type {number}
     */
    this.sinceSampleMs = 0;
    /**
     * Milliseconds fed since the start, for the warm-up.
     * @type {number}
     */
    this.fedMs = 0;
    /**
     * Whether the audio looks like music right now, before the hysteresis.
     * @type {boolean}
     */
    this.musicLike = false;
    /**
     * Flatness and bass of each hop in the timbre window, oldest first.
     * @type {TimbreHop[]}
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
    const { config } = this;
    this.remember(frame, frameMs);
    this.feel(frame, frameMs);
    const dancing = this.state === 'music';
    // Which moments count as audible follows the threshold in force: staying
    // needs less level than entering did, so a quiet passage is not a break.
    const audibleDb = this.floorDb + (dancing ? config.breakUnderFloorDb : config.musicOverFloorDb);
    this.measure(audibleDb);
    const audible = this.levelDb !== null && this.levelDb >= audibleDb;
    // A veto on machines and nothing finer: a fridge spreads 0.00 to 0.03 dB
    // and a record through a hard limiter 0.15 and up. While a song is
    // playing, a window too empty to read is not evidence of stillness: after
    // a stop the spread is unreadable for half a window. To start, the
    // evidence has to be there.
    const moves = this.swingKnown ? this.swing >= config.minLevelSwingDb : dancing;
    const alive = audible && moves;

    if (!dancing) {
      this.musicLike = alive && this.pulse >= config.pulseEnter;
      this.heldMs = this.musicLike ? this.heldMs + frameMs : 0;
      if (this.heldMs >= config.musicEnterMs) {
        this.enter('music');
      }
    } else {
      // Two clocks. The sound stopping is quick to see and quick to act on; a
      // pulse that has gone while the sound goes on is neither, because the
      // pulse of a real song dips for seconds at a time.
      this.musicLike = alive && this.pulse >= config.pulseLeave;
      this.quietMs = alive ? 0 : this.quietMs + frameMs;
      this.faintMs = this.pulse >= config.pulseLeave ? 0 : this.faintMs + frameMs;
      if (this.quietMs >= config.breakHoldMs || this.faintMs >= config.pulseLeaveMs) {
        this.enter('break');
      }
    }
    this.adaptFloor(frameMs, dancing);
    return this.state;
  }

  /**
   * Change state and start every clock again.
   *
   * @param {State} state The state to enter.
   * @returns {void}
   */
  enter(state) {
    this.state = state;
    this.heldMs = 0;
    this.quietMs = 0;
    this.faintMs = 0;
  }

  /**
   * Sample the tempo confidence once every {@link PULSE_EVERY_MS} and keep the
   * median of the last `pulseWindow` samples. A median and not a mean, because
   * a room throws the odd confident second and a song the odd empty one. A
   * frame with no tempo counts as no confidence, so a steady sound, which has
   * none, drains the window instead of leaving a song's evidence standing.
   *
   * @param {AnalyzerFrame} frame What the analyzer measured.
   * @param {number} frameMs Duration of the audio the frame covers.
   * @returns {void}
   */
  feel(frame, frameMs) {
    this.fedMs += frameMs;
    this.sinceSampleMs += frameMs;
    if (this.sinceSampleMs < PULSE_EVERY_MS) {
      return;
    }
    this.sinceSampleMs -= PULSE_EVERY_MS;
    const believed = frame.tempo !== null && this.fedMs >= PULSE_WARMUP_MS;
    this.confidences.push(believed ? /** @type {TempoEstimate} */ (frame.tempo).confidence : 0);
    while (this.confidences.length > this.config.pulseWindow) {
      this.confidences.shift();
    }
    const sorted = this.confidences.slice().sort((a, b) => a - b);
    this.pulse =
      sorted.length * 2 >= this.config.pulseWindow ? sorted[Math.floor(sorted.length / 2)] : 0;
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
    this.recent.push({ flatness: frame.flatness, bass: frame.bass });
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
   * Read the audible hops of the window: how far their level spreads, which is
   * asked, and their timbre, which is only shown.
   *
   * @param {number} audibleDb Level at or above which a hop counts as audible.
   * @returns {void}
   */
  measure(audibleDb) {
    let flatness = 1;
    let bass = 0;
    for (let index = 0; index < this.recent.length; index += 1) {
      if (this.levels[index] >= audibleDb) {
        flatness = Math.min(flatness, this.recent[index].flatness);
        bass = Math.max(bass, this.recent[index].bass);
      }
    }
    this.flatness = flatness;
    this.bass = bass;
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
