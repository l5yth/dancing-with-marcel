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
  /** How far back the level looks for its loudest hop, in milliseconds. */
  levelWindowMs: number;
  /** Slowest tempo the estimator reports, in beats per minute. */
  bpmMin: number;
  /** Fastest tempo the estimator reports, in beats per minute. */
  bpmMax: number;
  /** Tempo confidence below which no tempo is shown, from 0 to 1. */
  tempoMinConfidence: number;
  /** Tempo Marcel dances at before any has been detected, in beats per minute. */
  defaultBpm: number;
  /** How long a new tempo must hold before the dance follows it, in milliseconds. */
  bpmSettleMs: number;
}

/** Name of one tunable. */
type ConfigKey = keyof Config;

/** A tempo estimate. */
interface TempoEstimate {
  /** Beats per minute. */
  bpm: number;
  /** How strongly the audio repeats at that period, from 0 to 1. */
  confidence: number;
}

/** What the analyzer reports for one 512-sample hop. */
interface AnalyzerFrame {
  /** Seconds of audio processed up to the end of the hop's window. */
  time: number;
  /** Level of the hop in dBFS. */
  levelDb: number;
  /** Onset strength: the positive change of the log spectrum since the previous hop. */
  flux: number;
  /** Latest tempo estimate, or `null` while there is none. */
  tempo: TempoEstimate | null;
}

/** What the pipeline decides for one 512-sample hop. */
interface PipelineEvent {
  /** Seconds of audio processed up to the end of the hop's window. */
  time: number;
  /** Level of the hop in dBFS. */
  levelDb: number;
  /** Classifier state. */
  state: State;
  /** Latest tempo in beats per minute, or `null` while there is none. */
  bpm: number | null;
  /** Confidence of that tempo, from 0 to 1; 0 when there is none. */
  confidence: number;
  /** Tempo Marcel dances at, in beats per minute. */
  danceBpm: number;
  /** Whether a confident tempo has ever been adopted. */
  locked: boolean;
}

/** A stretch of time in which the classifier state did not change. */
interface Span {
  /** Seconds at which the span starts. */
  start: number;
  /** Seconds at which the span ends. */
  end: number;
  /** State held throughout. */
  state: State;
  /** Debug word at the end of the span. */
  label: string;
}

/** What Marcel did over a stretch of audio. */
interface Stats {
  /** Seconds the stretch covers. */
  duration: number;
  /** Fraction of hops in the `music` state, from 0 to 1. */
  music: number;
  /** Fraction of hops in the `break` state, from 0 to 1. */
  break: number;
  /** How often the state changed. */
  transitions: number;
  /** Median dance tempo while dancing, or `null` when none locked. */
  danceBpmMedian: number | null;
}

/** Analyzer settings. */
interface AnalyzerOptions {
  /** Sample rate of the audio, in Hz. */
  sampleRate: number;
  /** Slowest tempo to report, in beats per minute. */
  bpmMin: number;
  /** Fastest tempo to report, in beats per minute. */
  bpmMax: number;
}

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
