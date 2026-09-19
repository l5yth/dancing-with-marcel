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
 * @file Offline evaluation (SPEC D8): decode audio files with ffmpeg, run them
 * through the same pipeline the page uses, and print what Marcel would have
 * done. Tuning happens here, at home, instead of in the room. The analysis is
 * imported, never reimplemented, so a threshold tuned here means the same thing
 * live.
 */

import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { debugLabel } from '../../src/classify/label.js';
import { Pipeline } from '../../src/classify/pipeline.js';
import { configWith, DEFAULTS, RANGES } from '../../src/config.js';

/** Sample rate the audio is decoded to, in Hz. */
export const DECODE_RATE = 44100;

/**
 * A stretch of the run's timeline: one input file, or a gap inserted between two.
 *
 * @typedef {object} Segment
 * @property {'file' | 'gap'} kind What the stretch is.
 * @property {string} name File name without its directory, or `silence` for a gap.
 * @property {number} from Seconds at which the stretch starts.
 * @property {number} to Seconds at which it ends.
 */

/** How to call the program. */
export const USAGE = [
  'usage: npm run eval -- <file...> [--gap <seconds>] [--<tunable> <value>]',
  '',
  `  --gap <seconds>   silence inserted between files (default 0)`,
  `  tunables: ${Object.keys(DEFAULTS).join(', ')}`,
].join('\n');

/**
 * The ffmpeg arguments that decode one file to raw mono float samples.
 * `-vn` drops embedded cover art, which is a video stream and would otherwise
 * break the raw output.
 *
 * @param {string} file Path to the audio file.
 * @returns {string[]} The arguments.
 */
export function ffmpegArgs(file) {
  // biome-ignore format: one flag per line is harder to read than the command.
  return ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(DECODE_RATE), '-f', 'f32le', 'pipe:1'];
}

/**
 * Read the command line.
 *
 * @param {string[]} argv Arguments after the program name.
 * @returns {{files: string[], gap: number, config: Record<string, number>} | {error: string}}
 *   What to run, or why the line is wrong.
 */
export function parseArgs(argv) {
  /** @type {string[]} */
  const files = [];
  /** @type {Record<string, number>} */
  const config = {};
  let gap = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      files.push(argument);
      continue;
    }
    const name = argument.slice(2);
    const value = Number(argv[index + 1]);
    index += 1;
    if (!Number.isFinite(value)) {
      return { error: `--${name} needs a number` };
    }
    if (name === 'gap') {
      if (value < 0) {
        return { error: '--gap needs a number of seconds of at least 0' };
      }
      gap = value;
    } else if (name in DEFAULTS) {
      const [min, max] = RANGES[/** @type {ConfigKey} */ (name)];
      if (value < min || value > max) {
        return { error: `--${name} must be between ${min} and ${max}` };
      }
      config[name] = value;
    } else {
      return { error: `unknown option --${name}` };
    }
  }
  return files.length === 0 ? { error: 'no input files' } : { files, gap, config };
}

/**
 * Decode one file to mono samples at {@link DECODE_RATE}.
 *
 * @param {string} file Path to the audio file.
 * @param {SpawnFunction} spawn Process runner.
 * @returns {{samples: Float32Array} | {error: string}} The audio, or why it could not be read.
 */
export function decode(file, spawn) {
  const result = spawn('ffmpeg', ffmpegArgs(file), { maxBuffer: 1024 * 1024 * 1024 });
  if (result.status !== 0) {
    const reason = String(result.stderr ?? '')
      .trim()
      .split('\n')
      .slice(-3)
      .join('\n');
    return { error: reason === '' ? `ffmpeg exited ${result.status}` : reason };
  }
  // Copy, because a spawn buffer need not start on a four-byte boundary.
  const bytes = Uint8Array.prototype.slice.call(result.stdout);
  return { samples: new Float32Array(bytes.buffer, 0, bytes.length >> 2) };
}

/**
 * The stretches where the state stayed the same.
 *
 * @param {PipelineEvent[]} events Events in time order.
 * @returns {Span[]} One span per state change, in time order.
 */
export function spansOf(events) {
  /** @type {Span[]} */
  const spans = [];
  for (const event of events) {
    const label = debugLabel(event.state, event.locked ? event.danceBpm : null);
    const last = spans.at(-1);
    if (last === undefined || last.state !== event.state) {
      spans.push({ start: event.time, end: event.time, state: event.state, label });
    } else {
      last.end = event.time;
      last.label = label;
    }
  }
  return spans;
}

/**
 * Median of some numbers.
 *
 * @param {number[]} values The numbers.
 * @returns {number | null} The middle one once sorted, or `null` when there are none.
 */
export function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((one, other) => one - other);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Summarize a stretch of events.
 *
 * @param {PipelineEvent[]} events Events in time order.
 * @param {number} duration Seconds the stretch covers.
 * @returns {Stats} What Marcel did over it.
 */
export function statsOf(events, duration) {
  const music = events.filter((event) => event.state === 'music').length;
  const spans = spansOf(events);
  return {
    duration,
    music: events.length === 0 ? 0 : music / events.length,
    break: events.length === 0 ? 1 : 1 - music / events.length,
    transitions: Math.max(0, spans.length - 1),
    danceBpmMedian: median(
      events
        .filter((event) => event.state === 'music' && event.locked)
        .map((event) => event.danceBpm),
    ),
  };
}

/**
 * Format statistics as `key=value` pairs.
 *
 * @param {string} prefix Word the line starts with, such as `summary`.
 * @param {Record<string, string | number | null>} fields What to print.
 * @returns {string} The line.
 */
export function formatLine(prefix, fields) {
  const parts = Object.entries(fields).map(([key, value]) => {
    const text = typeof value === 'number' ? Number(value.toFixed(2)) : (value ?? 'none');
    return `${key}=${text}`;
  });
  return `${prefix}: ${parts.join(' ')}`;
}

/**
 * Decode every file, run them through one pipeline with the requested gaps
 * between them, and print the timeline and the summaries.
 *
 * @param {object} options Options.
 * @param {string[]} options.argv Arguments after the program name.
 * @param {SpawnFunction} [options.spawn] Process runner.
 * @param {LogFunction} [options.log] Where normal output goes.
 * @param {LogFunction} [options.error] Where failures go.
 * @param {Clock} [options.now] Millisecond clock, for the speed report.
 * @returns {number} Exit code: 0 on success, 1 on a failure, 2 on a bad command line.
 */
export function runEval({
  argv,
  spawn = /** @type {SpawnFunction} */ (/** @type {unknown} */ (spawnSync)),
  log = console.log,
  error = console.error,
  now = () => performance.now(),
}) {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    error(parsed.error);
    error(USAGE);
    return 2;
  }
  const config = configWith(parsed.config);
  const pipeline = new Pipeline({ config, sampleRate: DECODE_RATE });
  const gap = new Float32Array(Math.round(parsed.gap * DECODE_RATE));
  /** @type {PipelineEvent[]} */
  const all = [];
  /** @type {Segment[]} */
  const segments = [];
  let elapsed = 0;
  let analysisMs = 0;

  /**
   * Analyze one stretch of the timeline and record where it sits.
   *
   * @param {'file' | 'gap'} kind What the stretch is.
   * @param {string} name What to call it.
   * @param {Float32Array} samples Its audio.
   * @returns {void}
   */
  const consume = (kind, name, samples) => {
    const from = elapsed;
    const started = now();
    all.push(...pipeline.push(samples));
    analysisMs += now() - started;
    elapsed += samples.length / DECODE_RATE;
    segments.push({ kind, name, from, to: elapsed });
  };

  for (const file of parsed.files) {
    const decoded = decode(file, spawn);
    if ('error' in decoded) {
      error(`${file}: ${decoded.error}`);
      return 1;
    }
    if (segments.length > 0 && gap.length > 0) {
      consume('gap', 'silence', gap);
    }
    consume('file', basename(file), decoded.samples);
  }

  for (const segment of segments) {
    const events = all.filter((event) => event.time > segment.from && event.time <= segment.to);
    log(
      `${segment.kind}: ${segment.name} from=${segment.from.toFixed(2)} to=${segment.to.toFixed(2)}`,
    );
    for (const span of spansOf(events)) {
      log(`  ${span.start.toFixed(2).padStart(8)} ${span.label}`);
    }
    if (segment.kind === 'file') {
      log(
        formatLine('file-summary', {
          name: segment.name,
          ...statsOf(events, segment.to - segment.from),
        }),
      );
    }
  }
  log(
    formatLine('summary', {
      files: parsed.files.length,
      ...statsOf(all, elapsed),
      realtime: analysisMs === 0 ? 0 : elapsed / (analysisMs / 1000),
    }),
  );
  return 0;
}
