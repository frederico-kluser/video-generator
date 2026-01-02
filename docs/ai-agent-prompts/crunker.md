<ultrathink># Crunker Audio Concatenation

> **AI Agent Prompt:** Implement slide-audio concatenation for Grava exports using `crunker`. Provide utilities that fetch individual slide WAV files, concatenate them at 48 kHz, and output a single narration track ready for muxing.

## Objective

- Create `concatenateSlideAudios(audioUrls: string[]): Promise<{ blob: Blob; buffer: AudioBuffer }>` inside `features/video-generation/utils/audioConcat.ts`.
- Ensure consistent sample rate (48 kHz) to match FFmpeg/WebCodecs pipelines.
- Handle network failures and partial downloads gracefully.

## Dependencies

- `crunker`

## Implementation Steps

1. Install `crunker`.
2. Instantiate `const crunker = new Crunker({ sampleRate: 48000 });`.
3. Fetch slide audio via `crunker.fetchAudio(...urls)`; fall back to `fetch` + `decodeAudioData` for browsers without AudioWorklet support.
4. Use `crunker.concatAudio(buffers)` then `crunker.export(concatenated, 'audio/wav')` to get Blob + audioBuffer.
5. Provide progress logs per slide: `appLogger.info('🎚️ Concat buffer loaded', { slideIndex })`.
6. Return both Blob and decoded buffer for downstream loudness checks.
7. Handle cleanup via `crunker.close()` to release contexts.

## Validation

- Concatenate at least three short clips; ensure resulting WAV plays seamlessly.
- Confirm exported blob size roughly equals sum of inputs.
- Simulate failed fetch to verify retries/backoff.

## Notes

- Consider caching slide buffers to avoid re-downloading when users tweak order.
- When audio durations differ significantly, provide warning if silence > 2s detected between segments.
- Keep function browser-only to avoid SSR pitfalls.
  </ultrathink>
