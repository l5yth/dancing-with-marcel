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
  /** Level at or above which audio counts as music-like, in dBFS. */
  musicDb: { default: -40, min: -100, max: 0 },
  /** Level at or below which audio counts as break-like, in dBFS. */
  breakDb: { default: -50, min: -100, max: 0 },
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
  /** Tempo confidence below which no tempo is shown, from 0 to 1. */
  tempoMinConfidence: { default: 0.3, min: 0, max: 1 },
  /** Tempo Marcel dances at before any has been detected, in beats per minute. */
  defaultBpm: { default: 140, min: 40, max: 400 },
  /** How long a new tempo must hold before the dance follows it, in milliseconds. */
  bpmSettleMs: { default: 3000, min: 0, max: 60000 },
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
 * `breakDb` at or above `musicDb` would make the state flap, and `bpmMin` at or
 * above `bpmMax` leaves the tempo estimator no range to search. Every way of
 * tuning goes through here, so the URL and the offline eval agree.
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
  if (config.breakDb >= config.musicDb) {
    config.breakDb = DEFAULTS.breakDb;
    config.musicDb = DEFAULTS.musicDb;
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
