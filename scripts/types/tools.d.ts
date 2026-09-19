// SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
// SPDX-License-Identifier: Apache-2.0

// Types the development scripts share. Global ambient declarations, because
// TypeScript keeps a JSDoc typedef inside the module that wrote it and the
// `jsdoc` tool cannot parse TypeScript-only forms such as `typeof spawnSync`.
// Types only; nothing ships. `npm run docs:check` requires a doc comment on
// every top-level declaration here.

/** What a check reads from a finished child process. */
interface SpawnResult {
  /** Exit code, or `null` when a signal killed it. */
  status: number | null;
  /** Standard output. */
  stdout: string | Uint8Array;
  /** Standard error. */
  stderr: string | Uint8Array;
}

/** Process runner with the shape of `spawnSync`. */
type SpawnFunction = (command: string, args: string[], options?: unknown) => SpawnResult;

/** Where a script writes one line of output. */
type LogFunction = (line: string) => void;

/** Fetch with the shape of the global `fetch`. */
type FetchFunction = (url: URL | string) => Promise<Response>;

/** Millisecond clock, with the shape of `performance.now`. */
type Clock = () => number;
