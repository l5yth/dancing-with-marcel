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

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DECODE_RATE,
  decode,
  ffmpegArgs,
  formatLine,
  median,
  parseArgs,
  runEval,
  spansOf,
  statsOf,
} from '../scripts/lib/eval.mjs';
import { concat, drums, room, silence } from './helpers/synth.js';
import { floatBytes, wavBytes } from './helpers/wav.js';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
/** @type {string[]} */
const made = [];

after(() => Promise.all(made.map((dir) => rm(dir, { recursive: true, force: true }))));

/**
 * A fake ffmpeg that returns the audio a test chose, per file.
 *
 * @param {Record<string, Float32Array | {status: number, stderr: string}>} byFile What each path decodes to.
 * @returns {{spawn: any, calls: string[][]}} The runner and the argument lists it saw.
 */
function fakeFfmpeg(byFile) {
  /** @type {string[][]} */
  const calls = [];
  const spawn = (/** @type {string} */ _command, /** @type {string[]} */ args) => {
    calls.push(args);
    const file = args[args.indexOf('-i') + 1];
    const answer = byFile[file];
    if (answer instanceof Float32Array) {
      return { status: 0, stdout: floatBytes(answer), stderr: '' };
    }
    return { status: answer.status, stdout: Buffer.alloc(0), stderr: answer.stderr };
  };
  return { spawn, calls };
}

/**
 * Run the eval against fake audio and collect its output.
 *
 * @param {string[]} argv Command line.
 * @param {Record<string, Float32Array | {status: number, stderr: string}>} byFile What each path decodes to.
 * @param {object} [options] Options.
 * @param {function(): number} [options.now] Clock.
 * @returns {{code: number, out: string[], err: string[], calls: string[][]}} What happened.
 */
function run(argv, byFile, { now } = {}) {
  const { spawn, calls } = fakeFfmpeg(byFile);
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];
  const code = runEval({
    argv,
    spawn,
    log: (line) => out.push(line),
    error: (line) => err.push(line),
    now,
  });
  return { code, out, err, calls };
}

/**
 * The `key=value` pairs of a line as an object.
 *
 * @param {string} line A `summary:` or `file-summary:` line.
 * @returns {Record<string, string>} The fields.
 */
function fields(line) {
  return Object.fromEntries(
    line
      .slice(line.indexOf(':') + 1)
      .trim()
      .split(' ')
      .map((pair) => pair.split('=')),
  );
}

describe('eval', () => {
  it('C13: the eval imports the analysis instead of reimplementing it', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(join(REPO, 'scripts/lib/eval.mjs'), 'utf8'),
    );
    assert.match(source, /from '\.\.\/\.\.\/src\/(dsp|classify)\//);
    assert.doesNotMatch(source, /\b(fft|autocorr|spectral)/i);
  });

  it('C13: no arguments prints the usage on stderr and exits 2', () => {
    const { code, out, err } = run([], {});
    assert.equal(code, 2);
    assert.deepEqual(out, []);
    assert.match(err.join('\n'), /no input files/);
    assert.match(err.join('\n'), /usage: npm run eval/);
  });

  it('C13: a bad option exits 2 and says what is wrong', () => {
    for (const [argv, message] of [
      [['a.mp3', '--gap', 'soon'], /--gap needs a number/],
      [['a.mp3', '--gap', '-1'], /--gap needs a number of seconds of at least 0/],
      [['a.mp3', '--bpmMax', '900'], /--bpmMax must be between 60 and 400/],
      [['a.mp3', '--nonsense', '1'], /unknown option --nonsense/],
    ]) {
      const { code, err } = run(/** @type {string[]} */ (argv), {});
      assert.equal(code, 2);
      assert.match(err[0], /** @type {RegExp} */ (message));
    }
  });

  it('C13: parseArgs reads files, the gap, and tunables', () => {
    assert.deepEqual(parseArgs(['a.mp3', 'b.mp3', '--gap', '6', '--bpmMax', '200']), {
      files: ['a.mp3', 'b.mp3'],
      gap: 6,
      config: { bpmMax: 200 },
    });
  });

  it('C13: ffmpeg is called with mono 44.1 kHz float output and no video', () => {
    const audio = drums(120, 12, DECODE_RATE);
    const { code, calls } = run(['song.mp3'], { 'song.mp3': audio });
    assert.equal(code, 0);
    assert.equal(calls.length, 1);
    const args = calls[0].join(' ');
    for (const flag of ['-vn', '-ac 1', `-ar ${DECODE_RATE}`, '-f f32le', 'pipe:1']) {
      assert.ok(args.includes(flag), `${flag} in ${args}`);
    }
    assert.deepEqual(ffmpegArgs('x.mp3').slice(0, 4), ['-v', 'error', '-i', 'x.mp3']);
  });

  it('C13: a failing ffmpeg exits 1 and prints the tail of its stderr', () => {
    const { code, err } = run(['missing.mp3'], {
      'missing.mp3': { status: 1, stderr: 'line one\nline two\nline three\nno such file' },
    });
    assert.equal(code, 1);
    assert.match(err[0], /missing\.mp3: .*no such file/s);
    assert.doesNotMatch(err[0], /line one/);
  });

  it('C13: a silent ffmpeg failure still reports its exit code', () => {
    const { spawn } = fakeFfmpeg({ 'x.mp3': { status: 3, stderr: '  ' } });
    const result = decode('x.mp3', spawn);
    assert.deepEqual(result, { error: 'ffmpeg exited 3' });
  });

  it('C13: a track prints its spans and a file-summary, and the run ends with a summary', () => {
    const audio = concat(room(3, DECODE_RATE), drums(160, 20, DECODE_RATE));
    const { code, out } = run(['punk.mp3'], { 'punk.mp3': audio });
    assert.equal(code, 0);
    assert.match(out[0], /^file: punk\.mp3 from=0\.00 to=23\.0\d$/);
    assert.match(out[1], /^\s+0\.02 break$/);
    assert.ok(
      out.some((line) => /^\s+\d+\.\d\d music \(\d+ bpm\)$/.test(line)),
      'a music span with a tempo',
    );
    const perFile = fields(out.find((line) => line.startsWith('file-summary:')));
    assert.equal(perFile.name, 'punk.mp3');
    assert.ok(Number(perFile.music) > 0.7, perFile.music);
    assert.ok(Math.abs(Number(perFile.danceBpmMedian) - 160) < 160 * 0.03, perFile.danceBpmMedian);

    const summary = out.at(-1);
    assert.match(summary, /^summary: /);
    for (const key of ['duration', 'music', 'break', 'transitions', 'danceBpmMedian', 'realtime']) {
      assert.ok(key in fields(summary), `${key} in ${summary}`);
    }
  });

  it('C13: --gap inserts exactly that much silence between files', () => {
    const song = drums(120, 10, DECODE_RATE);
    const byFile = { 'a.mp3': song, 'b.mp3': song };
    const withGap = run(['a.mp3', 'b.mp3', '--gap', '6'], byFile);
    const without = run(['a.mp3', 'b.mp3'], byFile);
    const duration = (result) => Number(fields(result.out.at(-1)).duration);
    assert.equal(duration(withGap) - duration(without), 6);
    const second = withGap.out.find((line) => line.startsWith('file: b.mp3'));
    assert.match(second, /from=16\.00/);
    assert.ok(Number(fields(withGap.out.at(-1)).break) > Number(fields(without.out.at(-1)).break));
  });

  it('C13: a tunable given on the command line reaches the pipeline', () => {
    const audio = concat(room(2, DECODE_RATE), drums(120, 14, DECODE_RATE));
    const loose = run(['a.mp3', '--musicDb', '-70', '--breakDb', '-80', '--musicEnterMs', '0'], {
      'a.mp3': audio,
    });
    const strict = run(['a.mp3', '--musicDb', '-5', '--breakDb', '-10'], { 'a.mp3': audio });
    assert.equal(Number(fields(loose.out.at(-1)).music), 1, 'room noise counts as music');
    assert.equal(Number(fields(strict.out.at(-1)).music), 0, 'nothing is loud enough');
  });

  it('C13: audio too short to analyze reports an empty run instead of failing', () => {
    const { code, out } = run(['blip.mp3'], { 'blip.mp3': new Float32Array(100) });
    assert.equal(code, 0);
    const summary = fields(out.at(-1));
    assert.equal(summary.music, '0');
    assert.equal(summary.break, '1');
    assert.equal(summary.transitions, '0');
    assert.equal(summary.danceBpmMedian, 'none');
  });

  it('C13: a clock that does not move reports a speed of zero instead of infinity', () => {
    const { out } = run(['a.mp3'], { 'a.mp3': silence(2, DECODE_RATE) }, { now: () => 5 });
    assert.equal(fields(out.at(-1)).realtime, '0');
  });

  it('C13: spansOf, statsOf, median, and formatLine handle the empty case', () => {
    assert.deepEqual(spansOf([]), []);
    assert.equal(median([]), null);
    assert.equal(median([3, 1, 2]), 2);
    assert.deepEqual(statsOf([], 12), {
      duration: 12,
      music: 0,
      break: 1,
      transitions: 0,
      danceBpmMedian: null,
    });
    assert.equal(formatLine('summary', { a: 1.005, b: null, c: 'x' }), 'summary: a=1 b=none c=x');
  });

  it('C13: the real CLI decodes a WAV and reports it, or is skipped without ffmpeg', async (t) => {
    if (!HAS_FFMPEG) {
      t.skip('ffmpeg is not on PATH');
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'marcel-eval-'));
    made.push(dir);
    const file = join(dir, 'drums.wav');
    await writeFile(file, wavBytes(drums(120, 60, DECODE_RATE), DECODE_RATE));
    const result = spawnSync(process.execPath, [join(REPO, 'scripts/eval.mjs'), file], {
      cwd: REPO,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const summary = fields(result.stdout.trim().split('\n').at(-1));
    assert.ok(Number(summary.music) >= 0.9, `music ${summary.music}`);
    assert.ok(
      Math.abs(Number(summary.danceBpmMedian) - 120) <= 120 * 0.03,
      `danceBpmMedian ${summary.danceBpmMedian}`,
    );
    assert.ok(Number(summary.realtime) >= 20, `realtime ${summary.realtime}`);
  });
});
