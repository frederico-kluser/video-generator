# Wavesurfer.js Waveform UX

> **AI Agent Prompt:** Deliver an interactive waveform visualization and timeline for EduScript AI recordings using `wavesurfer.js` v7 and `@wavesurfer/react`. Implement a React component that renders slide audio previews, integrates the Record plugin when needed, and mirrors the 2025 visual language (violet gradients). Ensure the component degrades gracefully when Web Audio is unavailable.

## Objective

- Provide `WaveformDisplay` component under `features/video-generation/components` for waveform rendering, zoom, and timeline overlays.
- Enable optional recording mode for capturing live narration segments per slide.
- Expose imperative controls (play, pause, seek) to the parent VideoGeneration flow.

## Dependencies

- `wavesurfer.js`
- `@wavesurfer/react`
- Optional plugins: `RecordPlugin`, `Timeline`, `Spectrogram` (lazy-loaded).

## Implementation Steps

1. Install `wavesurfer.js @wavesurfer/react`.
2. Create `src/features/video-generation/components/WaveformDisplay/WaveformDisplay.tsx` with props:
   - `audioUrl?: string`
   - `mode: 'playback' | 'record'`
   - `onReady`, `onError`, `onRecordStart`, `onRecordStop`, etc.
3. Use `useRef<HTMLDivElement | null>` for the container; pass it to `useWavesurfer` hook with theme colors `#4F4A85` (wave) and `#383351` (progress).
4. Configure plugins array dynamically: include `RecordPlugin` only when `mode === 'record'`. Lazy import plugin modules with `import()` to keep bundle size manageable.
5. Add fallback UI (simple audio tag) when `isReady` is false after timeout or when `window.AudioContext` is missing.
6. Emit structured logs (`appLogger.info('🎛️ Waveform ready', {...})`). On errors, call the existing `SectionErrorFallback` boundaries.
7. Ensure cleanup on unmount by calling `wavesurfer?.destroy()`.
8. Provide Storybook-style usage example in `src/examples/usageExample.ts` or dedicated doc snippet.

## Validation

- Run in playback mode with a sample audio URL; verify timeline renders and scrubbing works.
- Switch to record mode; confirm microphone permissions triggered and raw audio segments captured.
- Check that the component responds to theme changes (respect CSS variables defined in `index.css`).

## Notes

- For large audio files, encourage precomputed peaks via `wavesurfer.load(url, peaks)`.
- Consider exposing `ref` with imperative handlers to allow the RecordingStep to annotate markers per slide.
- Keep DOM manipulation minimal and favor wavesurfer APIs; add fallback text for screen readers describing waveform state.
