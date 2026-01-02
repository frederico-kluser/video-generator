<ultrathink># Extendable MediaRecorder WAV Output

> **AI Agent Prompt:** Guarantee cross-browser WAV recording support for Grava by integrating `extendable-media-recorder` with the WAV encoder package. Provide initialization helpers that register the encoder once, create WAV-capable MediaRecorders, and fall back elegantly when unsupported.

## Objective

- Add `registerWavRecorder()` utility under `features/video-generation/utils/wavRecorder.ts` that registers the WAV encoder during app bootstrap.
- Expose `createWavRecorder(stream, options)` returning a recorder compatible with existing MediaRecorder hooks.
- Ensure registration runs only in browsers (guard for SSR) and logs success/failure.

## Dependencies

- `extendable-media-recorder`
- `extendable-media-recorder-wav-encoder`

## Implementation Steps

1. Install dependencies.
2. Implement async `registerWavEncoder()` that calls `register(await connect())` from the encoder package. Cache a promise to avoid duplicate registrations.
3. Provide `createWavRecorder(stream)` that awaits registration, then constructs the extended `MediaRecorder` with `mimeType: 'audio/wav'`.
4. Integrate with existing recorder factory: when user requests WAV output, call this helper instead of native MediaRecorder.
5. Log `appLogger.info('📼 WAV recorder ready')` once registration completes, and `appLogger.error` if it fails.
6. Offer fallback to standard WebM recorder when registration impossible (Safari private mode, etc.).

## Validation

- Record short clip, download WAV, and verify header in audio editor.
- Simulate double registration to ensure cached promise prevents errors.
- Confirm fallback triggers when `MediaRecorder` undefined (older browsers) with user-facing notice.

## Notes

- Registration should happen lazily (e.g., when user first enters RecordingStep) to avoid slowing initial load.
- Document additional bundle size (~120 KB) so feature flags can disable when not required.
- Keep code ASCII-friendly and free of non-deterministic side effects.
  </ultrathink>
