// SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
// SPDX-License-Identifier: Apache-2.0

// Shared types of the app. Global ambient declarations: TypeScript 7 does not
// treat JSDoc typedefs in script files as global, and the `jsdoc` tool cannot
// parse TypeScript-only forms, so JSDoc comments refer to these by name.
// Types only; nothing ships. `npm run docs:check` requires a doc comment on
// every top-level declaration here.

/** Classifier state (SPEC D2). */
type State = 'break' | 'music';

/** Capture lifecycle. */
type CaptureStatus = 'idle' | 'starting' | 'running' | 'denied' | 'error';

/** All tunables (SPEC D8). */
interface Config {
  /** Smoothed level at or above which audio counts as music-like, in dBFS. */
  musicDb: number;
  /** Smoothed level at or below which audio counts as break-like, in dBFS. */
  breakDb: number;
  /** Sustained music-like time needed to enter `music`, in milliseconds. */
  musicEnterMs: number;
  /** Sustained break-like time needed to leave `music`, in milliseconds. */
  breakHoldMs: number;
  /** Time constant of the level smoothing, in milliseconds. */
  smoothMs: number;
}

/** Name of one tunable. */
type ConfigKey = keyof Config;

/** Receives one 512-sample mono frame and the sample rate of the audio context, in Hz. */
type FrameHandler = (frame: Float32Array, sampleRate: number) => void;

/** Receives a capture status change and, on failure, the failure message. */
type StatusHandler = (status: CaptureStatus, detail?: string) => void;

/** Constructor of an audio context. */
type AudioContextConstructor = typeof AudioContext;

/** Constructor of a worklet node. */
type AudioWorkletNodeConstructor = typeof AudioWorkletNode;

/** Everything the capture needs from the browser, injected so tests can fake it. */
interface CaptureDeps {
  /** Source of the microphone stream. */
  mediaDevices: Pick<MediaDevices, 'getUserMedia'>;
  /** Audio context constructor. */
  AudioContext: AudioContextConstructor;
  /** Worklet node constructor. */
  AudioWorkletNode: AudioWorkletNodeConstructor;
  /** Location of the worklet module. */
  workletUrl: string | URL;
  /** Called for every 512-sample frame. */
  onFrame: FrameHandler;
  /** Called on every status change. */
  onStatus: StatusHandler;
}

/** Browser globals the app needs, injected so the wiring runs in unit tests. */
interface Env {
  /** The page. */
  document: Document;
  /** The page location. */
  location: { search: string };
  /** The browser navigator. */
  navigator: { mediaDevices: Pick<MediaDevices, 'getUserMedia'> };
  /** Audio context constructor. */
  AudioContext: AudioContextConstructor;
  /** Worklet node constructor. */
  AudioWorkletNode: AudioWorkletNodeConstructor;
}
