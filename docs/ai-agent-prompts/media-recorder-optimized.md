<ultrathink># MediaRecorder Optimized Capture

> **AI Agent Prompt:** Provide a resilient MediaRecorder abstraction for EduScript AI that auto-selects the best MIME type, sets tuned bitrates, and exposes lifecycle callbacks with structured logging. Ensure compatibility across Chrome, Firefox, and Safari while offering fallbacks to `extendable-media-recorder` when WAV output is required.

## Objective

- Implement `createMediaRecorder(stream, options)` utility in `features/video-generation/utils/recorderFactory.ts`.
- Support detection of preferred MIME type order: `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/mp4`.
- Provide typed events for `onStart`, `onData`, `onStop`, `onError` to integrate with hooks/UI.

## Dependencies

- Native MediaRecorder API (no extra package) but interplay with optional `extendable-media-recorder`.

## Implementation Steps

1. Create helper `getSupportedMimeType()` returning first supported type as in guide.
2. `createRecorder(stream, config)` should instantiate `new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 })`.
3. Register event listeners that push data chunks into memory-efficient buffers; flush to Blob when `onStop` fires.
4. Add fallback to `extendable-media-recorder` when `mimeType` empty (older Safari) or when user requests WAV output.
5. Use `appLogger` to log `🎥 Recorder started`, errors, and output sizes.
6. Provide TypeScript types for options/responses to keep strict mode satisfied.
7. Document best practices (pause/resume, handling long recordings) inside file comments.

## Validation

- Start capture from `canvas.captureStream()` plus processed audio stream; verify result plays.
- Confirm fallback path triggered by forcing unsupported MIME (unit test mocking `MediaRecorder.isTypeSupported`).
- Ensure cleanup removes event listeners.

## Notes

- For long sessions, consider streaming chunks to `WritableStream` instead of storing all in memory.
- Provide ability to adjust bitrates per slide resolution (720p vs 1080p).
- Keep DOM dependencies minimal; rely on MediaRecorder API calls.
  </ultrathink>
