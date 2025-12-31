# LameJS MP3 Encoding

> **AI Agent Prompt:** Provide optional MP3 export for EduScript AI by integrating the maintained `@breezystack/lamejs` fork. Implement a worker-driven encoder that converts normalized WAV data into MP3 while keeping the main thread responsive.

## Objective

- Deliver `encodeMp3(buffer: AudioBuffer, bitrateKbps?: number)` utility under `features/video-generation/processors/mp3Encoder.ts`.
- Use Web Worker or `OffscreenAudioContext` to prevent UI stalls during encoding.
- Offer UI toggle so users can download MP3 narration directly.

## Dependencies

- `@breezystack/lamejs`

## Implementation Steps

1. Install dependency.
2. Create an encoder worker (e.g., `mp3Encoder.worker.ts`) that imports LameJS, initializes `new lamejs.Mp3Encoder(channels, sampleRate, bitrate)`, and processes PCM samples chunk by chunk.
3. Provide helper that posts Float32 channel data to the worker, receives MP3 chunks, and resolves a Blob when encoding completes.
4. Implement fallback (run on main thread) when Worker unsupported, with warning log.
5. Expose structured logs summarizing bitrate, duration, and output size (`appLogger.info('🎵 MP3 export complete', {...})`).
6. Ensure TypeScript strict types for worker messages.

## Validation

- Encode 30-second clip at 192 kbps, verify file plays in browsers.
- Measure processing time; ensure worker approach keeps UI interactive.
- Confirm fallback path still works albeit slower.

## Notes

- LameJS increases bundle size; lazy-load worker when user requests MP3.
- Document licensing (LGPL) implications inside README.
- Provide tests verifying MP3 blob size roughly equals `durationSeconds * bitrateKbps * 125` bytes.
