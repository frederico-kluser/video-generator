# Silero VAD React Integration

> **AI Agent Prompt:** Implement automatic speech boundary detection for EduScript AI recordings using `@ricky0123/vad-react` plus `onnxruntime-web`. Build a hook/component combo that shows recording badges, segments narration per slide, and gracefully handles asset loading via Vite static copy.

## Objective

- Provide `useVoiceActivityDetection` hook wrapping `useMicVAD` and exposing `userSpeaking`, `start`, `stop`, and `onSegment` callbacks.
- Copy required assets (`vad.worklet.bundle.min.js`, `silero_vad_v5.onnx`, ONNX wasm files) to the Vite output automatically.
- Integrate VAD results into `RecordingStep` to auto-stop recording after silence.

## Dependencies

- `@ricky0123/vad-react`
- `onnxruntime-web`
- `vite-plugin-static-copy`

## Implementation Steps

1. Install packages.
2. Update `vite.config.ts` with `viteStaticCopy` plugin to move VAD assets from node_modules into `/` during build.
3. Create hook file in `features/video-generation/hooks/useVoiceActivityDetection.ts` calling `useMicVAD({ positiveSpeechThreshold: 0.8, negativeSpeechThreshold: 0.3, redemptionFrames: 10, onSpeechStart, onSpeechEnd })`.
4. Translate Float32Array segments from `onSpeechEnd` into Blobs (16 kHz) for downstream normalization.
5. Expose `vadStatus` enum (`idle | initializing | listening | error`) to drive UI indicators.
6. Add structured logs for start/end events: `appLogger.info('🎙️ Speech start detected', { slideId })`.
7. Provide fallback UI when `window.Worklet` or `WebAssembly` unsupported; allow manual record controls.

## Validation

- Manually talk; verify `userSpeaking` toggles and UI badge updates.
- Confirm assets load via network tab (HTTP 200) on dev and prod builds.
- Simulate unsupported browser (disable WASM) to ensure fallback path logs `VAD disabled`.

## Notes

- Debounce `onSpeechEnd` to avoid false positives by checking duration > 0.5s.
- Consider persisting segments per slide for advanced editing features.
- Keep ONNX files under 5 MB by using quantized versions if necessary.
