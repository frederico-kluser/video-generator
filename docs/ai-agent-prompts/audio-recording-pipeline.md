<ultrathink># Audio Recording Pipeline

> **AI Agent Prompt:** Build the full Grava audio recording pipeline combining `getUserMedia`, RNNoise suppression, high-pass filter, compressor, limiter, and MediaRecorder capture. Provide a hook that orchestrates the chain, exposes recorder controls, and ensures cleanup plus fallbacks per browser constraints.

## Objective

- Implement `useAudioRecordingPipeline` hook under `features/video-generation/hooks/useAudioRecordingPipeline.ts`.
- Chain microphone stream through: device constraints -> RNNoise -> high-pass -> compressor -> limiter -> `MediaStreamDestination` -> MediaRecorder.
- Provide lifecycle controls (`start`, `stop`, `pause`, `resume`, `cleanup`) and deliver processed audio blobs alongside diagnostics (peak levels, suppression state).

## Dependencies

- Native Web Audio API
- RNNoise hook (optional, degrade gracefully)
- MediaRecorder utilities

## Implementation Steps

1. Request media with optimized constraints: `channelCount: 1`, `sampleRate: 48000`, `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`.
2. Instantiate `AudioContext({ sampleRate: 48000 })` and create `MediaStreamSource` from original stream.
3. Build nodes: `BiquadFilterNode` high-pass at 80 Hz, `DynamicsCompressorNode` for voice (threshold -24, ratio 4, attack 0.003, release 0.15), second compressor as limiter (threshold -1, ratio 20, attack 0.001, release 0.05).
4. Optionally insert RNNoise stream if user enabled advanced suppression.
5. Route chain into `MediaStreamDestination` and feed resulting stream into MediaRecorder factory (optimized or WAV variant).
6. Manage state via React `useReducer` or `useActionState`, exposing statuses (`idle`, `preparing`, `recording`, `stopped`, `error`).
7. Log key lifecycle events: `appLogger.info('🎤 Pipeline ready', { hasNoiseSuppression })`.
8. Provide cleanup that stops tracks, disconnects nodes, and closes AudioContext to prevent resource leaks.

## Validation

- Record sample and verify background noise reduced vs baseline.
- Inspect network/devtools to ensure no orphaned MediaStream tracks after stop.
- Confirm fallback path returns raw stream when AudioContext creation fails.

## Notes

- Use `AbortController` to cancel initialization if user navigates away mid-setup.
- Provide UI hints when pipeline cannot acquire microphone (permissions denied).
- Ensure hook never touches DOM directly; rely on calling component for UI updates.
  </ultrathink>
