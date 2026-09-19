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
  /** Time constant of the level smoothing, in milliseconds. */
  smoothMs: { default: 250, min: 1, max: 10000 },
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
 * Read the tunables from a URL query string.
 *
 * A key is taken from its first occurrence. A value that is empty, not a
 * number, or outside its range is ignored. If the result would put `breakDb`
 * at or above `musicDb`, both level thresholds fall back to their defaults.
 *
 * @param {string} search The query string, with or without the leading `?`.
 * @returns {Readonly<Config>} A frozen configuration.
 */
export function parseConfig(search) {
  const params = new URLSearchParams(search);
  const config = { ...DEFAULTS };
  for (const key of KEYS) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') {
      continue;
    }
    const value = Number(raw);
    const [min, max] = RANGES[key];
    if (Number.isFinite(value) && value >= min && value <= max) {
      config[key] = value;
    }
  }
  if (config.breakDb >= config.musicDb) {
    config.breakDb = DEFAULTS.breakDb;
    config.musicDb = DEFAULTS.musicDb;
  }
  return Object.freeze(config);
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
