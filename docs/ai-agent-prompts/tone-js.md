<ultrathink># Tone.js Audio Dynamics

> **AI Agent Prompt:** Implement real-time voice dynamics processing for EduScript AI using Tone.js. Enable a reusable React hook that initializes compressor and limiter nodes, integrates with MediaRecorder-based capture, and exposes structured logging with emojis. Follow TypeScript strict mode, reuse existing logging utilities, and provide fallbacks when Tone.js cannot start.

## Objective

- Offer an ergonomic hook (`useAudioDynamics`) that prepares Tone.js compressor and limiter chains for slide narration.
- Ensure initialization happens only after user interaction (per AudioContext restrictions) and provide cleanup helpers.
- Emit informative logs via `appLogger` when Tone.js loads, when nodes connect, or if errors require fallback to native `DynamicsCompressorNode`.

## Dependencies

- Package: `tone`
- React 19 + Vite 6 environment already configured.
- Existing `shared/logging/logger.ts` for structured logging with emojis.

## Implementation Steps

1. Install Tone.js: `yarn add tone`.
2. Create `src/features/video-generation/hooks/useAudioDynamics.ts` exporting a hook that lazily imports Tone.js (dynamic import to keep bundle lean).
3. Inside the hook, store refs for `Tone.Compressor` and `Tone.Limiter`. Provide `initDynamics()` and `disposeDynamics()` callbacks.
4. On initialization:
   - Await `Tone.start()` to unlock audio context.
   - Instantiate `Tone.Compressor` with threshold `-24`, ratio `4`, attack `0.005`, release `0.1`, knee `6`.
   - Instantiate `Tone.Limiter` with ceiling `-1` dB.
   - Connect compressor -> limiter -> `Tone.Destination`.
   - Return an object exposing the compressor so calling code can route `MediaStreamSource` into `compressorRef.current` via `Tone.UserMedia` or native nodes.
5. If Tone.js fails to load or AudioContext cannot start, fall back to Web Audio API `DynamicsCompressorNode` and `DynamicsCompressorNode` (as limiter) while logging a warning emoji.
6. Provide TypeScript types describing the return signature (`initDynamics`, `disposeDynamics`, `isReady`).
7. Add unit-level smoke test or story snippet demonstrating usage inside `RecordingStep`.

## Validation

- Manual: trigger `useAudioDynamics().initDynamics()` after a button click and verify console logs show Tone chain readiness.
- Ensure calling `disposeDynamics()` disconnects and disposes nodes without memory leaks (Tone nodes have `dispose`).
- Confirm fallback path logs `⚠️ Tone.js unavailable, using native compressor chain` and audio still records.

## Notes

- Avoid global Tone.js state; keep everything scoped to the hook instance.
- Use `requestIdleCallback` or `queueMicrotask` to defer heavy Tone imports if initialization occurs during render.
- Document the hook inside `docs/README` future section if needed.
  </ultrathink>
