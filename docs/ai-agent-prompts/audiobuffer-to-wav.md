# AudioBuffer to WAV Export

> **AI Agent Prompt:** Add reliable WAV export support for EduScript AI using `audiobuffer-to-wav`. Build utilities that convert processed `AudioBuffer` objects (post normalization) to Blob outputs for download, preview, or FFmpeg ingestion.

## Objective

- Provide helper `exportToWav(buffer: AudioBuffer, mimeType = 'audio/wav'): Blob` under `features/video-generation/utils/audioBufferUtils.ts`.
- Support browser download links and in-memory transfers to other processors.
- Maintain TypeScript types with `@types/audiobuffer-to-wav`.

## Dependencies

- `audiobuffer-to-wav`
- `@types/audiobuffer-to-wav`

## Implementation Steps

1. Install packages.
2. Implement helper using `import toWav from 'audiobuffer-to-wav';` returning `new Blob([toWav(buffer)], { type: mimeType })`.
3. Provide optional `bitDepth` parameter (16 default) for advanced needs; pass options to `toWav` if necessary.
4. Add utility `downloadBlob(blob, filename)` leveraging `URL.createObjectURL` with cleanup.
5. Include structured logging for exports: `appLogger.info('💾 WAV export ready', { durationMs })`.
6. Ensure function never runs during SSR; guard with `if (typeof window === 'undefined') throw new Error('Not in browser');`.

## Validation

- Convert normalized AudioBuffer, download, and verify metadata in external tool.
- Ensure 1-second buffer yields ~96 KB at 48 kHz mono 16-bit.
- Confirm TypeScript definitions recognized by `tsc --noEmit`.

## Notes

- When exporting long tracks, inform user about potential memory cost; consider streaming alternatives.
- Provide integration doc referencing this helper from EditorStep and export workflow.
- Keep conversions synchronous but wrap in `useWorker` if CPU spikes.
