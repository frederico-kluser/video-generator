<ultrathink># EBU R128 Loudness Measurement

> **AI Agent Prompt:** Add precise loudness metering and normalization to Grava slide narrations using `ebur128-wasm`. Build utilities that measure LUFS, Loudness Range, and True Peak for `AudioBuffer` inputs, then adjust gain to a target of -16 LUFS with safe clipping prevention.

## Objective

- Provide `useLoudnessNormalization` hook or utility functions inside `features/video-generation/hooks/useLoudnessNormalization.ts`.
- Support both batch normalization (post-processing) and inline measurement for meters.
- Integrate results into export flow before concatenating audio.

## Dependencies

- `ebur128-wasm`

## Implementation Steps

1. Install package and ensure WASM loader works with Vite (it ships as ES module friendly).
2. Create helper `measureLoudness(audioBuffer)` returning `{ loudness, truePeak, loudnessRange }` using `EbuR128` class and planar channel data.
3. Implement `normalizeToTarget(buffer, currentLUFS, target = -16)` adjusting gain and clamping samples between -1 and 1.
4. Build hook that accepts `AudioBuffer[]`, measures all in parallel (`Promise.all`), and returns normalized buffers plus telemetry.
5. Log metrics via `appLogger.info('📏 Loudness measurement', { slideId, loudness })`.
6. Provide fallback message when multi-channel audio unsupported (component currently mono).

## Validation

- Use sample buffers to ensure gain adjustments produce -16 LUFS within +/-0.5 LU.
- Verify no clipping occurs by checking `Math.max(...data) < 1` after normalization.
- Confirm WASM loads only in browser by guards around `typeof window`.

## Notes

- Optionally expose UI badges (e.g., `LUFS: -18`) inside EditorStep.
- Cache measurement results per slide to avoid reprocessing unchanged audio.
- Consider hooking into FFmpeg pipeline for final verification.
  </ultrathink>
