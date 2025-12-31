# FFmpeg.wasm Audio Toolkit

> **AI Agent Prompt:** Integrate `@ffmpeg/ffmpeg` and `@ffmpeg/util` to normalize, convert, and trim EduScript AI audio recordings in-browser. Provide a service module with helpers for loudness normalization (EBU R128 presets), WebM to WAV/MP3 conversion, and shared worker lifecycle management. Ensure COOP/COEP headers configured in `vite.config.ts` and ship fallback messaging for Safari.

## Objective

- Deliver `src/features/video-generation/processors/ffmpegProcessor.ts` exposing `normalizeAudio`, `transcodeToMp3`, and `concatSegments` utilities.
- Handle `SharedArrayBuffer` requirements by updating dev server headers and documenting deployment implications.
- Cache the FFmpeg core between operations to avoid repeated 25 MB downloads.

## Dependencies

- `@ffmpeg/ffmpeg`
- `@ffmpeg/util`

## Implementation Steps

1. Install FFmpeg packages.
2. Update `vite.config.ts` `server.headers` with `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`. Provide env guard to disable headers when running inside unsupported browsers.
3. Create a singleton `createFFmpegInstance()` that loads the wasm core once and keeps track of `isLoaded`.
4. Implement `normalizeAudio(blob: Blob)` writing `input.wav`, executing `-af loudnorm=I=-16:TP=-1.5:LRA=11`, and returning normalized WAV blob.
5. Implement `transcodeToMp3(blob: Blob)` using `-c:a libmp3lame -b:a 192k`.
6. Add `concatSegments(blobs: Blob[])` by generating an ffconcat file inside the virtual FS.
7. Wrap calls with structured logging: `appLogger.info('🧬 FFmpeg job started', { jobType })` and `appLogger.error` on failures including `ffmpeg exitCode`.
8. Provide cancellation timeout (e.g., abort after 60s) and fallback to server-side processing when FFmpeg initialization fails.

## Validation

- Manual: record short WebM, normalize via helper, inspect metadata using browser devtools.
- Confirm headers appear during `yarn dev` via network tab.
- Safari fallback: ensure user sees notice `FFmpeg.wasm not supported; exporting raw WebM`.

## Notes

- Persist FFmpeg core in IndexedDB using `toBlobURL` as needed for faster reloads.
- Document memory usage implications (30-40 MB) inside README or docs entry.
- Guard functions so they never run on the server during SSR.
