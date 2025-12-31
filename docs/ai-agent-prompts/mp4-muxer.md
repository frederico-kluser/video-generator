# MP4 Muxer Assembly

> **AI Agent Prompt:** Build a reusable muxing utility for EduScript AI based on `mp4-muxer`. Accept video chunks from WebCodecs or other encoders plus optional audio tracks, then output a single MP4 blob with fast-start metadata.

## Objective

- Implement `createMp4Muxer(options)` inside `features/video-generation/processors/mp4Muxer.ts`.
- Support adding video chunks (`addVideoChunk`) and audio packets (future-proof) before finalizing.
- Provide `fastStart` and seekable outputs for instant playback.

## Dependencies

- `mp4-muxer`

## Implementation Steps

1. Import `{ Muxer, ArrayBufferTarget }` from `mp4-muxer`.
2. Expose factory accepting `width`, `height`, `videoCodec`, `audioCodec?`, `timescale`.
3. Initialize `Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width, height }, audio?: { codec: 'aac' }, fastStart: 'in-memory' })`.
4. Provide methods `addVideoChunk(chunk, meta)` and `addAudioChunk(chunk, meta)` that forward to muxer.
5. Implement `finalize()` returning `{ blob: new Blob([target.buffer], { type: 'video/mp4' }) }` and releasing references.
6. Log lifecycle events using `appLogger` (start, chunk counts, finalize duration).
7. Ensure TypeScript definitions annotate chunk metadata (`EncodedVideoChunkMetadata`).

## Validation

- Feed few synthetic frames from WebCodecs; verify output plays.
- Confirm `fastStart` flag places `moov` at beginning (check with `ffprobe`).
- Handle errors from muxer gracefully and provide fallback message.

## Notes

- Consider streaming target (WritableStreamTarget) when exporting long videos to avoid storing entire buffer in memory.
- For VP9/AV1, update codec strings accordingly.
- Keep API surface minimal yet composable with future audio track support.
