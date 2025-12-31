<ultrathink># RNNoise WASM Noise Suppression

> **AI Agent Prompt:** Add RNNoise-based AI noise suppression to the EduScript AI recording pipeline using `@timephy/rnnoise-wasm`. Implement a hook that upgrades raw microphone streams to denoised `MediaStream` instances feeding MediaRecorder and WebCodecs flows. Provide graceful degradation when AudioWorklets or 48 kHz mono input are unavailable.

## Objective

- Offer `useNoiseSuppression` hook returning `initNoiseSuppression(stream)` and `cleanup()`.
- Support AudioWorklet registration via Vite-friendly bundling (`?worker&url`).
- Ensure user constraints request `sampleRate: 48000`, `channelCount: 1` to match RNNoise expectations.

## Dependencies

- `@timephy/rnnoise-wasm`

## Implementation Steps

1. Install dependency.
2. Place worker import: `import NoiseSuppressorWorklet from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url';` and constant `NoiseSuppressorWorklet_Name`.
3. Inside hook:
   - Create `AudioContext({ sampleRate: 48000 })` when `initNoiseSuppression` is called.
   - `await audioContext.audioWorklet.addModule(NoiseSuppressorWorklet);`
   - Instantiate `new AudioWorkletNode(audioContext, NoiseSuppressorWorklet_Name)`.
   - `createMediaStreamSource(stream)` -> `noiseNode` -> `createMediaStreamDestination()`.
   - Return `destination.stream` and cleanup handle closing context and disconnecting nodes.
4. Handle failures: if `audioContext.audioWorklet` missing, log warning and return original stream.
5. Add option to bypass suppression for low-power devices (detect via `navigator.hardwareConcurrency`).

## Validation

- Record speech in noisy environment; confirm audible improvement.
- Inspect logs for `🔇 RNNoise enabled`.
- Ensure repeated calls do not leak AudioContext instances.

## Notes

- Keep hook synchronous until first awaited call; avoid creating contexts during SSR.
- Provide unit tests mocking AudioContext to ensure fallback logic behaves.
- Pair with VAD hook to avoid processing silence when not needed.
  </ultrathink>
