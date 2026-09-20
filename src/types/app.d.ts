// SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
// SPDX-License-Identifier: Apache-2.0

// Shared types of the app. Global ambient declarations: TypeScript 7 does not
// treat JSDoc typedefs in script files as global, and the `jsdoc` tool cannot
// parse TypeScript-only forms, so JSDoc comments refer to these by name.
// Types only; nothing ships. `npm run docs:check` requires a doc comment on
// every top-level declaration here.

/** The screen wake lock a browser may offer. */
interface ScreenWakeLock {
  /** Ask to keep the screen on; the browser may refuse. */
  request: (type: 'screen') => Promise<unknown>;
}

/** Something to run later, with no arguments and no result. */
type Deferred = () => void;

/** Where chance comes from, with the shape of `Math.random`. */
type RandomSource = () => number;

/** A list of loop names that is not to be changed. */
type LoopList = readonly string[];

/** The dance loops grouped by energy, quietest first. */
type LoopTiers = readonly LoopList[];

/** What one frame of the sprite sheet is, as the design project describes it. */
interface FrameMeta {
  /** `dance` for an on-beat performance frame, `break` for a between-song one. */
  group: string;
  /** How much energy the frame carries, from 0 for still to 3 for a chorus. */
  energy: number;
  /** Where it falls in the bar: `down`, `up`, `and`, or `null` off the beat. */
  beat: string | null;
}

/** What the scene director needs: the tuning, and a source of chance. */
interface SceneOptions {
  /** Thresholds and timings. */
  config: Readonly<Config>;
  /** Where chance comes from; the default is `Math.random`. */
  random?: RandomSource;
}

/** Classifier state (SPEC D2). */
type State = 'break' | 'music';

/** Capture lifecycle. */
type CaptureStatus = 'idle' | 'starting' | 'running' | 'denied' | 'error';

/** All tunables (SPEC D8). */
interface Config {
  /** How far above the room floor audio must sit to count as music, in dB. */
  musicOverFloorDb: number;
  /** How far above the room floor music must stay to keep dancing, in dB. */
  breakUnderFloorDb: number;
  /** Flattest spectrum that still counts as music, from 0 for a tone to 1 for noise. */
  maxFlatness: number;
  /** Least bass that counts as a pulse, as a share of the energy. */
  minBass: number;
  /** Onset strength at which a moment counts as an onset rather than a steady sound. */
  minFlux: number;
  /** How many onsets the timbre window needs before the audio counts as moving. */
  minOnsets: number;
  /** How far back tonality and bass are read, in milliseconds. */
  timbreWindowMs: number;
  /** How fast the room floor climbs back towards a louder room, in dB per second. */
  floorRiseDbPerSec: number;
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
  /** How far over the music threshold counts as full energy, in dB. */
  driveRangeDb: number;
  /** How long one dance scene is held before another of the same energy may follow, in milliseconds. */
  sceneHoldMs: number;
  /** How long one frame of a between-song scene lasts, in milliseconds. */
  breakFrameMs: number;
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

/** What one frame's spectrum looks like. */
interface SpectrumFrame {
  /** Onset strength: the positive change of the log spectrum since the previous frame. */
  flux: number;
  /** How noise-like the frame is, from 0 for a pure tone to 1 for white noise. */
  flatness: number;
  /** Share of the energy below the bass cutoff, from 0 to 1. */
  bass: number;
}

/** What the analyzer reports for one 512-sample hop. */
interface AnalyzerFrame {
  /** Seconds of audio processed up to the end of the hop's window. */
  time: number;
  /** Level of the hop in dBFS. */
  levelDb: number;
  /** Onset strength: the positive change of the log spectrum since the previous hop. */
  flux: number;
  /** How noise-like the hop is, from 0 for a pure tone to 1 for white noise. */
  flatness: number;
  /** Share of the hop's energy below the bass cutoff, from 0 to 1. */
  bass: number;
  /** Latest tempo estimate, or `null` while there is none. */
  tempo: TempoEstimate | null;
}

/** What the pipeline decides for one 512-sample hop. */
interface PipelineEvent {
  /** Seconds of audio processed up to the end of the hop's window. */
  time: number;
  /** Loudest level of the level window, in dBFS. */
  levelDb: number;
  /** Learned level of the room, in dBFS. */
  floorDb: number;
  /** Flattest spectrum among the audible hops of the timbre window. */
  flatness: number;
  /** Most bass among the audible hops of the timbre window. */
  bass: number;
  /** Strongest onset among the audible hops of the timbre window. */
  flux: number;
  /** How many audible hops of the timbre window carry an onset. */
  onsets: number;
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

/** The timers the capture schedules its retries and watchdog with. */
interface Timers {
  /** Run something after a delay, returning a handle. */
  setTimeout: (run: () => void, delayMs: number) => unknown;
  /** Cancel a pending timer by its handle. */
  clearTimeout: (handle: unknown) => void;
}

/** The part of the page the capture watches to know whether it is on screen. */
interface Visibility {
  /** Whether the page is currently hidden. */
  readonly hidden: boolean;
  /** Subscribe to `visibilitychange`. */
  addEventListener: (type: string, listener: () => void) => void;
}

/** Everything the capture needs from the browser, injected so tests can fake it. */
interface CaptureDeps {
  /** Timers for the retry backoff and the watchdog. */
  timers: Timers;
  /** The page, watched so the wake lock is taken again when it is shown. */
  visibility: Visibility;
  /** The screen wake lock, when the browser has one. */
  wakeLock?: ScreenWakeLock;
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

/** The part of the browser window the stage needs. */
interface StageWindow {
  /** Width of the viewport, in pixels. */
  innerWidth: number;
  /** Height of the viewport, in pixels. */
  innerHeight: number;
  /** Subscribe to a window event, used for `resize`. */
  addEventListener: (type: string, listener: () => void) => void;
  /** Ask to be called before the next repaint, with a millisecond timestamp. */
  requestAnimationFrame: (callback: (elapsedMs: number) => void) => number;
}

/** Browser globals the app needs, injected so the wiring runs in unit tests. */
interface Env {
  /** The page. */
  document: Document;
  /** The page location. */
  location: { search: string };
  /** The browser navigator. */
  navigator: {
    mediaDevices: Pick<MediaDevices, 'getUserMedia'>;
    wakeLock?: ScreenWakeLock;
  };
  /** Audio context constructor. */
  AudioContext: AudioContextConstructor;
  /** Worklet node constructor. */
  AudioWorkletNode: AudioWorkletNodeConstructor;
  /** The browser window. */
  window: StageWindow;
  /** Timers for the capture's retry backoff and watchdog. */
  timers: Timers;
  /** Where chance comes from; the default is `Math.random`. */
  random?: () => number;
}
