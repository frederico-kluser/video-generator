# WebCodecs Encoder Pipeline

> **AI Agent Prompt:** Replace ad-hoc MediaRecorder exports with a WebCodecs-based encoder that renders EduScript AI slide canvases into H.264 MP4 using `mp4-muxer`. Provide a hook that initializes `VideoEncoder`, feeds frames from `canvas.captureStream()` or headless rendering, and finalizes to Blob output with precise timestamps.

## Objective

- Create `useWebCodecsRecorder` hook in `features/video-generation/hooks/useWebCodecsRecorder.ts` exposing `initialize`, `encodeFrame`, and `finalize`.
- Support configuration of width, height, framerate, bitrate, and keyframe interval.
- Integrate `mp4-muxer` `ArrayBufferTarget` to produce MP4 compatible with browsers and editing tools.

## Dependencies

- `@types/dom-webcodecs` (dev)
- `mp4-muxer`
- Optionally `webm-muxer` for VP9 fallback

## Implementation Steps

1. Install dependencies.
2. In hook, guard with `if (!('VideoEncoder' in window))` to fall back to MediaRecorder and log warning.
3. `initialize` should call `VideoEncoder.isConfigSupported` with `codec: 'avc1.42001E'` and configure `hardwareAcceleration: 'prefer-hardware'`.
4. Setup `Muxer` with `fastStart: 'in-memory'` and save instance refs.
5. `encodeFrame(canvas, timestampMs)` should create `VideoFrame` from canvas, set `duration` = `(1000 / frameRate) * 1000`, and encode with periodic keyframes (e.g., every 60 frames). Close frames to avoid leaks.
6. Track `encodeQueueSize` and throttle new frames if queue > 5.
7. `finalize` flushes encoder, closes, and returns `Blob` from muxer buffer.
8. Add structured logs for initialization, queue pressure, and completion times.
9. Provide fallback `requestVideoFrameCallback` loop to schedule `encodeFrame` while recording.

## Validation

- Run sample encode at 1920x1080 @ 30 fps and ensure resulting MP4 plays in Safari + Chrome.
- Inspect file metadata confirming bitrate ~5 Mbps.
- Verify fallback path triggers on Firefox < 130.

## Notes

- Use `OffscreenCanvas` where supported to render slides without blocking UI.
- Consider exposing `abort` method to cancel recording quickly.
- Document compatibility matrix inside README or release notes.
