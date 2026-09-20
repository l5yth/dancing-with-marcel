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
  /** Flattest spectrum that still counts as music, from 0 for a tone to 1 for noise. */
  maxFlatness: { default: 0.6, min: 0, max: 1 },
  /** Least bass that counts as a pulse, as a share of the energy. */
  minBass: { default: 0.15, min: 0, max: 1 },
  /** Onset strength at which a moment counts as an onset rather than a steady sound. */
  minFlux: { default: 0.1, min: 0, max: 10 },
  /** How many onsets the timbre window needs before the audio counts as moving. */
  minOnsets: { default: 4, min: 1, max: 200 },
  /**
   * How far the audible level must spread over the timbre window, from its
   * 10th to its 90th percentile, in dB. Music moves and a machine does not: a
   * fridge measures 0.00, and the calmest twentieth of the calmest record
   * measured 0.60. It is a spread and not a level, so it needs no setting for
   * the room or the microphone.
   */
  minLevelSwingDb: { default: 0.3, min: 0, max: 20 },
  /** How far back tonality and bass are read, in milliseconds. */
  timbreWindowMs: { default: 1500, min: 100, max: 10000 },
  /** How fast the room floor climbs back towards a louder room, in dB per second. */
  floorRiseDbPerSec: { default: 3, min: 0, max: 60 },
  /** Sustained music-like time needed to enter `music`, in milliseconds. */
  musicEnterMs: { default: 1000, min: 0, max: 60000 },
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
   * room about 0.13, all three read correctly. Speech scores 0.14, so this does
   * not tell music from noise and is not asked to: a tempo only settles inside
   * a music span, which noise never opens.
   */
  tempoMinConfidence: { default: 0.15, min: 0, max: 1 },
  /** Tempo Marcel dances at before any has been detected, in beats per minute. */
  defaultBpm: { default: 140, min: 40, max: 400 },
  /** How long a new tempo must hold before the dance follows it, in milliseconds. */
  bpmSettleMs: { default: 3000, min: 0, max: 60000 },
  /** How far over the music threshold counts as full energy, in dB. */
  driveRangeDb: { default: 18, min: 1, max: 60 },
  /** How long one dance scene is held before another of the same energy may follow, in milliseconds. */
  sceneHoldMs: { default: 12000, min: 0, max: 600000 },
  /** How long one frame of a between-song scene lasts, in milliseconds. */
  breakFrameMs: { default: 2400, min: 100, max: 60000 },
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
