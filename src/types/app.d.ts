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

/** A list of loop names, or of a loop's frame names, that is not to be changed. */
type LoopList = readonly string[];

/** What the scene director needs. */
interface SceneOptions {
  /** Thresholds and timings. */
  config: Readonly<Config>;
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
  /** How far the audible level must spread over the timbre window, in dB. */
  minLevelSwingDb: number;
  /** Pulse evidence needed to start dancing, from 0 to 1. */
  pulseEnter: number;
  /** Pulse evidence that keeps them dancing, from 0 to 1. */
  pulseLeave: number;
  /** How long the pulse may stay under `pulseLeave` before they stop, in milliseconds. */
  pulseLeaveMs: number;
  /** How many one-second tempo confidences the pulse evidence is the median of. */
  pulseWindow: number;
  /** How far back tonality and bass are read, in milliseconds. */
  timbreWindowMs: number;
  /** How fast the room floor climbs back towards a louder room, in dB per second. */
  floorRiseDbPerSec: number;
  /** How far back the room level is read to find the floor, in milliseconds. */
  floorWindowMs: number;
  /** Which of the last few minutes the floor sits under, 0 quietest to 1 loudest. */
  floorPercentile: number;
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
  /** Tempo the punks dance at before any has been detected, in beats per minute. */
  defaultBpm: number;
  /** How long a new tempo must hold before the dance follows it, in milliseconds. */
  bpmSettleMs: number;
  /** How far over the music threshold counts as full energy, in dB. */
  driveRangeDb: number;
  /** How long the room must ask for another energy tier before the punks follow it, in milliseconds. */
  tierSettleMs: number;
  /** How long one frame of a between-song scene lasts, in milliseconds. */
  breakFrameMs: number;
  /** Shortest a break goes on before its scenes are dealt again, in milliseconds. */
  breakRefreshMinMs: number;
  /** Longest a break goes on before its scenes are dealt again, in milliseconds. */
  breakRefreshMaxMs: number;
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

/** What the classifier keeps of one hop's timbre: shown in the overlay, not asked. */
interface TimbreHop {
  /** Spectral flatness, 0 for a tone and 1 for white noise. */
  flatness: number;
  /** Share of the energy below the bass frequency. */
  bass: number;
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
  /** Share of the hop's samples that are pinned at full scale, from 0 to 1. */
  clipped: number;
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
  /** Share of the hop's samples pinned at full scale, from 0 to 1. */
  clipped: number;
  /** Learned level of the room, in dBFS. */
  floorDb: number;
  /** Flattest spectrum among the audible hops of the timbre window. */
  flatness: number;
  /** Most bass among the audible hops of the timbre window. */
  bass: number;
  /** Spread of the audible level over the timbre window, in dB. */
  swing: number;
  /** Pulse evidence: median tempo confidence of the pulse window. */
  pulse: number;
  /** Classifier state. */
  state: State;
  /** Latest tempo in beats per minute, or `null` while there is none. */
  bpm: number | null;
  /** Confidence of that tempo, from 0 to 1; 0 when there is none. */
  confidence: number;
  /** Tempo the punks dance at, in beats per minute. */
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

/** What the page did over a stretch of audio. */
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
  /** Subscribe to a window event, used for `resize` and `keydown`. */
  addEventListener: (type: string, listener: (event: KeyPress) => void) => void;
  /** Ask to be called before the next repaint, with a millisecond timestamp. */
  requestAnimationFrame: (callback: (elapsedMs: number) => void) => number;
}

/** What the app reads of a key being pressed. */
interface KeyPress {
  /** The key, as the keyboard layout names it. */
  key: string;
  /** Whether the key is being held down and this is a repeat. */
  repeat: boolean;
  /** Whether Control is held. */
  ctrlKey: boolean;
  /** Whether Meta, the command or Windows key, is held. */
  metaKey: boolean;
  /** Whether Alt is held. */
  altKey: boolean;
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

/** One of the three punks of the ASCIIpunk sheet. */
interface Punk {
  /** Name. */
  name: string;
  /** The haircut, in words. */
  hair: string;
  /** Whether the hair is bleached, and so coloured by the mask. */
  bleached: boolean;
  /** Whether the lips are coloured by the mask. */
  lipstick: boolean;
  /** Whether the top row of the hair is dyed, and so coloured by the mask. */
  tips?: boolean;
}

/** A drawn sprite: rows of art and a parallel grid of mask letters. */
interface Sprite {
  /** The art, top to bottom, right-trimmed. */
  rows: string[];
  /** A letter of `PALETTE` for every coloured cell, a space for white. */
  mask: string[];
}

/** Where the head of a composed sprite is: the left edge of its eye row. */
interface SpriteHead {
  /** Row of the eyes. */
  row: number;
  /** Column of the head's left edge. */
  col: number;
}

/** A sprite as it comes out of composition. */
interface ComposedSprite extends Sprite {
  /** Where the head is, or `null` for a body without one. */
  head: SpriteHead | null;
}

/** What is said about a body when it is registered. */
interface SpriteBodyMeta {
  /** `dance`, `move`, `break`, or `egg`. */
  group: string;
  /** How hard the frame goes, 0 to 3. */
  energy: number;
  /** Hair variant: `n`, `b`, `f`, `w`, or `c`. */
  hair: string;
  /** Column of the feet. */
  anchor: number;
  /** Columns moved per frame in the facing direction. */
  dx?: number;
}

/** A registered body: what is said about it, and its drawing. */
interface SpriteBody extends SpriteBodyMeta {
  /** The art, top to bottom. */
  rows: string[];
  /** Colour mask rows, keyed by the art row they colour. */
  mask: Record<number, string>;
}

/** An animal of the sheet: not a punk, and not 16 rows. */
interface SpriteExtra {
  /** Always `egg`. */
  group: string;
  /** Always 0. */
  energy: number;
  /** Column of the feet. */
  anchor: number;
  /** Columns moved per frame. */
  dx: number;
  /** The art, top to bottom, `@` for a backslash. */
  rows: string[];
}

/** What the sheet says about a frame. */
interface SpriteMeta {
  /** `dance`, `move`, `break`, or `egg`. */
  group: string;
  /** How hard the frame goes, 0 to 3. */
  energy: number;
  /** Column of the feet in the right-facing sprite. */
  anchor: number;
  /** Width of the box every punk's version of the frame fits in. */
  width: number;
  /** Columns moved per frame in the facing direction. */
  dx: number;
  /** Where the head is, or `null`. */
  head: SpriteHead | null;
  /** Hair variant, for a punk's frame. */
  hair?: string;
  /** `l` for the one frame that is drawn facing left. */
  facing?: string;
  /** Number of rows, for an animal. */
  rows?: number;
}

/** What `mirror` accepts: a sprite whose mask may be missing. */
interface MirrorInput {
  /** The art, top to bottom. */
  rows: string[];
  /** The mask, when the sprite has one. */
  mask?: string[];
}

/** Turns rows of art around. */
type RowsFlip = (rows: string[]) => string[];

/** Where a punk is in its comings and goings. */
type Presence = 'off' | 'enter' | 'stage' | 'exit';

/** One punk of the show: where it is and what it is doing (SPEC F4). */
interface PunkState {
  /** Key into `PUNKS` and `SPRITES`. */
  id: string;
  /** Column it stands on. */
  home: number;
  /** Column of its feet. */
  x: number;
  /** 1 facing right, -1 facing left. */
  facing: number;
  /** Name of the loop it performs. */
  loop: string;
  /** Frames of that loop. */
  frames: LoopList;
  /** Index of the frame showing. */
  index: number;
  /** Frames since the loop began. */
  held: number;
  /** Off stage, walking on, on stage, or walking off. */
  state: Presence;
  /** The between-song scene it was dealt. */
  scene: string;
}

/** An animal crossing the floor (SPEC F6). */
interface AnimalState {
  /** Which animal; also its key in `EGGS`. */
  kind: 'cat' | 'rabbit';
  /** Frames of its loop. */
  frames: LoopList;
  /** Index of the frame showing. */
  index: number;
  /** Column of its feet. */
  x: number;
}

/** A sprite and where its top left corner goes on the stage. */
interface Placement {
  /** The sprite, already facing the right way. */
  sprite: Sprite;
  /** Column of its left edge; may be off the stage. */
  left: number;
  /** Row of its top edge. */
  top: number;
}

/** What a show is made with. */
interface ShowOptions {
  /** Where chance comes from; the default is `Math.random`. */
  random?: RandomSource;
  /** Shortest a break goes on before its scenes are dealt again, in milliseconds. */
  refreshMinMs?: number;
  /** Longest a break goes on before its scenes are dealt again, in milliseconds. */
  refreshMaxMs?: number;
}

/** The picture of a moment: a grid of characters, and the mask letter of each. */
interface Grid {
  /** The characters, row by row. */
  chars: string[][];
  /** A letter of `PALETTE` for a coloured cell, a space for a white one. */
  inks: string[][];
}

/** A stretch of a row drawn in one colour. */
interface Run {
  /** The characters. */
  text: string;
  /** The letter of `PALETTE` it is drawn in, or the empty string for white. */
  ink: string;
}

/** What the show hears: whether music plays, and at which energy tier. */
interface Heard {
  /** Whether music is playing. */
  dancing: boolean;
  /** Energy tier, 1 to 3 while music plays; 0 between songs. */
  tier: number;
}

/** A tier forced from the keyboard, while it still holds (SPEC T2). */
interface Forced {
  /** The tier: 0 a break, 1 to 3 a dance tier. */
  tier: number;
  /** Milliseconds until it runs out. */
  leftMs: number;
}
