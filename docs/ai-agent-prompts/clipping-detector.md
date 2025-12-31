# Clipping Detector Hook

> **AI Agent Prompt:** Build a lightweight clipping detection hook for EduScript AI recordings using the Web Audio API. Provide real-time peak metering and clipping flags backed by `AnalyserNode.getFloatTimeDomainData`, with fallbacks for browsers lacking Float32 capture.

## Objective

- Implement `useClippingDetector(analyser: AnalyserNode)` returning `{ detectClipping, peak, peakDb, isClipping }`.
- Offer interval-based polling (e.g., via `requestAnimationFrame`) suitable for UI meters in RecordingStep.
- Log clipping events so users know when to adjust microphone distance.

## Dependencies

- Native Web Audio API.

## Implementation Steps

1. Create hook in `features/video-generation/hooks/useClippingDetector.ts` receiving an `AnalyserNode` configured with suitable `fftSize` (1024) and `smoothingTimeConstant`.
2. Within `detectClipping`, allocate `Float32Array` matching analyser size, call `analyser.getFloatTimeDomainData`, and compute `peak = max(|sample|)`.
3. Convert to decibels via `20 * Math.log10(Math.max(peak, 0.0001))`.
4. Determine clipping `peak >= 0.99` and expose state.
5. Provide fallback when analyser missing: return safe defaults and log `⚠️ Clipping detector disabled`.
6. Optionally expose `subscribe(callback)` to notify UI only when state changes.

## Validation

- Feed synthetic audio hitting 0 dBFS; verify `isClipping` toggles true.
- Check normal speech stays near -3 dB to -6 dB.
- Ensure memory allocations reused rather than recreating arrays on every frame.

## Notes

- Pair with RNNoise + compressor chain to reduce clipping risk.
- Provide accessible text description (e.g., `Volume OK` vs `Clipping`) for screen readers.
- Avoid direct DOM manipulation; rely on React state updates for meters.
