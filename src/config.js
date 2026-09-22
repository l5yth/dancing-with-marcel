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
 * @file Tunable thresholds (SPEC D8). One table holds every default and range;
 * URL query parameters override it. Invalid or unknown parameters are ignored
 * and nothing is persisted.
 */

/**
 * The parameter table: default and allowed range of every tunable.
 *
 * @type {Record<ConfigKey, {default: number, min: number, max: number}>}
 */
const PARAMS = {
  /** How far above the room floor audio must sit to count as music, in dB. */
  musicOverFloorDb: { default: 12, min: 0, max: 60 },
  /** How far above the room floor music must stay to keep dancing, in dB. */
  breakUnderFloorDb: { default: 8, min: 0, max: 60 },
  /**
   * Pulse evidence needed to start dancing: the median tempo confidence of the
   * last `pulseWindow` seconds. This is the question that decides. Measured on
   * the owner's recordings: a rumbling room and a voice have a median of 0.07
   * to 0.08 and never pass 0.11, and in three minutes of them no streak
   * reaches this bar; a punk song through a phone speaker sits at 0.12 with
   * streaks of five seconds over it; records played clean sit at 0.20 to
   * 0.27. Lower it and the punks start sooner and are fooled sooner.
   */
  pulseEnter: { default: 0.15, min: 0, max: 1 },
  /** Pulse evidence that keeps them dancing; under it for `pulseLeaveMs`, they stop. */
  pulseLeave: { default: 0.09, min: 0, max: 1 },
  /**
   * How long the pulse may stay under `pulseLeave` before they stop, in
   * milliseconds. Long, because the pulse of a real song dips for seconds at a
   * time; it is also most of how long they dance on into talking that follows
   * a song with no silence between them, which measures 23 to 24 s.
   */
  pulseLeaveMs: { default: 10000, min: 0, max: 120000 },
  /** How many one-second tempo confidences the pulse evidence is the median of. */
  pulseWindow: { default: 8, min: 1, max: 60 },
  /**
   * How far the audible level must spread over the timbre window, from its
   * 10th to its 90th percentile, in dB. A veto on machines, which do not
   * change: a fridge measures 0.00 to 0.03 and a record through a hard limiter
   * 0.15 and up. It is a spread and not a level, so it needs no setting for
   * the room or the microphone. 0 switches the question off.
   */
  minLevelSwingDb: { default: 0.1, min: 0, max: 20 },
  /** How far back tonality and bass are read, in milliseconds. */
  timbreWindowMs: { default: 1500, min: 100, max: 10000 },
  /**
   * How fast the room floor climbs back towards a louder room, in dB per
   * second. Slow, because being sure of a song takes about ten seconds and the
   * floor must not have climbed to meet it by then: at 3 dB/s it had, and the
   * song was sat out. Not slower, because a loud room the page opens on has to
   * be learned before its odd confident second can start a dance: at 0.2 dB/s
   * a rumbling room danced at 62 s.
   */
  floorRiseDbPerSec: { default: 0.5, min: 0, max: 60 },
  /**
   * How far back the room level is read to find the floor, in milliseconds.
   * Longer than a song, so that a song the gate never took, or a long intro
   * with no beat, cannot outvote the room around it; short enough that a room
   * which really is louder is learned within a few minutes.
   */
  floorWindowMs: { default: 180000, min: 10000, max: 900000 },
  /**
   * Which of the last few minutes the floor sits under, from 0 for the
   * quietest second to 1 for the loudest. A fifth, so a room that is quiet
   * most of the time is read at its quiet, and one loud second in five does
   * not lift it.
   */
  floorPercentile: { default: 0.2, min: 0, max: 1 },
  /** Sustained music-like time needed to enter `music`, in milliseconds. */
  musicEnterMs: { default: 3000, min: 0, max: 60000 },
  /** Sustained break-like time needed to leave `music`, in milliseconds. */
  breakHoldMs: { default: 2000, min: 0, max: 60000 },
  /** How far back the level looks for its loudest hop, in milliseconds. */
  levelWindowMs: { default: 400, min: 10, max: 10000 },
  /** Slowest tempo the estimator reports, in beats per minute. */
  bpmMin: { default: 95, min: 40, max: 200 },
  /** Fastest tempo the estimator reports, in beats per minute. */
  bpmMax: { default: 190, min: 60, max: 400 },
  /**
   * Tempo confidence below which no tempo is shown, from 0 to 1. A drum machine
   * scores 0.97, a record about 0.2, and a record through a phone speaker in a
   * room about 0.13, all three read correctly. A voice reaches 0.19 for a
   * moment, so this does not tell music from noise and is not asked to: a
   * tempo only settles inside a music span, which noise never opens.
   */
  tempoMinConfidence: { default: 0.15, min: 0, max: 1 },
  /** Tempo the punks dance at before any has been detected, in beats per minute. */
  defaultBpm: { default: 140, min: 40, max: 400 },
  /** How long a new tempo must hold before the dance follows it, in milliseconds. */
  bpmSettleMs: { default: 3000, min: 0, max: 60000 },
  /** How far over the music threshold counts as full energy, in dB. */
  driveRangeDb: { default: 18, min: 1, max: 60 },
  /**
   * How long the room must ask for another energy tier before the punks follow
   * it, in milliseconds. A song that sits on the line between two tiers
   * crosses it twice a second, and every crossing would start all three on a
   * new dance.
   */
  tierSettleMs: { default: 2000, min: 0, max: 60000 },
  /** How long one frame lasts between songs, in milliseconds. */
  breakFrameMs: { default: 900, min: 100, max: 60000 },
  /** Shortest a break goes on before its scenes are dealt again, in milliseconds. */
  breakRefreshMinMs: { default: 60000, min: 1000, max: 3600000 },
  /** Longest a break goes on before its scenes are dealt again, in milliseconds. */
  breakRefreshMaxMs: { default: 300000, min: 1000, max: 3600000 },
};

/** Names of all tunables, in table order. */
const KEYS = /** @type {ConfigKey[]} */ (Object.keys(PARAMS));

/** Default value of every tunable. */
export const DEFAULTS = Object.freeze(
  /** @type {Record<ConfigKey, number>} */ (
    Object.fromEntries(KEYS.map((key) => [key, PARAMS[key].default]))
  ),
);

/** Allowed `[min, max]` of every tunable, both inclusive. */
export const RANGES = Object.freeze(
  /** @type {Record<ConfigKey, Array<number>>} */ (
    Object.fromEntries(KEYS.map((key) => [key, Object.freeze([PARAMS[key].min, PARAMS[key].max])]))
  ),
);

/**
 * Apply overrides to the defaults.
 *
 * A value that is not a number or lies outside its range is ignored, and so is
 * an unknown key. A pair that contradicts itself falls back to both defaults:
 * `breakUnderFloorDb` at or above `musicOverFloorDb` would make the state flap,
 * `levelWindowMs` beyond `timbreWindowMs` would read a level the timbre window
 * cannot cover, and `bpmMin` at or above `bpmMax` leaves the tempo estimator no
 * range to search. Every way of tuning goes through here, so the URL and the
 * offline eval agree.
 *
 * @param {Record<string, number>} overrides Values to change, by tunable name.
 * @returns {Readonly<Config>} A frozen configuration.
 */
export function configWith(overrides) {
  const config = { ...DEFAULTS };
  for (const key of KEYS) {
    const value = overrides[key];
    const [min, max] = RANGES[key];
    if (Number.isFinite(value) && value >= min && value <= max) {
      config[key] = value;
    }
  }
  if (config.breakUnderFloorDb >= config.musicOverFloorDb) {
    config.breakUnderFloorDb = DEFAULTS.breakUnderFloorDb;
    config.musicOverFloorDb = DEFAULTS.musicOverFloorDb;
  }
  if (config.levelWindowMs > config.timbreWindowMs) {
    config.levelWindowMs = DEFAULTS.levelWindowMs;
    config.timbreWindowMs = DEFAULTS.timbreWindowMs;
  }
  if (config.bpmMin >= config.bpmMax) {
    config.bpmMin = DEFAULTS.bpmMin;
    config.bpmMax = DEFAULTS.bpmMax;
  }
  // A leave bar over the enter bar would start a song and drop it `pulseLeaveMs`
  // later, over and over, since the evidence that started it is under the bar
  // that keeps it.
  if (config.pulseLeave > config.pulseEnter) {
    config.pulseLeave = DEFAULTS.pulseLeave;
    config.pulseEnter = DEFAULTS.pulseEnter;
  }
  return Object.freeze(config);
}

/**
 * Read the tunables from a URL query string. A key is taken from its first
 * occurrence; the rules of {@link configWith} then apply.
 *
 * @param {string} search The query string, with or without the leading `?`.
 * @returns {Readonly<Config>} A frozen configuration.
 */
export function parseConfig(search) {
  const params = new URLSearchParams(search);
  /** @type {Record<string, number>} */
  const overrides = {};
  for (const key of KEYS) {
    const raw = params.get(key);
    if (raw !== null && raw.trim() !== '') {
      overrides[key] = Number(raw);
    }
  }
  return configWith(overrides);
}

/**
 * Whether the debug overlay is requested (`?debug=1`).
 *
 * @param {string} search The query string, with or without the leading `?`.
 * @returns {boolean} `true` when `debug` is exactly `1`.
 */
export function isDebug(search) {
  return new URLSearchParams(search).get('debug') === '1';
}
