// SPDX-FileCopyrightText: 2026 Afri Blanck (@l5yth)
// SPDX-License-Identifier: Apache-2.0

// Names that exist only inside an AudioWorkletGlobalScope and that
// TypeScript's DOM library does not declare. Types only; nothing ships.

/** Base class of an audio worklet processor. */
declare class AudioWorkletProcessor {
  /** Channel to the main thread. */
  readonly port: MessagePort;
  constructor();
  /** Consume one render quantum; return `true` to stay alive. */
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

/** Register a processor under a name that `AudioWorkletNode` can use. */
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;
