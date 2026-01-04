import { type MutableRefObject, useCallback, useRef, useState } from 'react';

import {
  loadRnnoise,
  NoiseGateWorkletNode,
  RnnoiseWorkletNode,
} from '@sapphi-red/web-noise-suppressor';

import { appLogger } from '@/shared/logging/logger';

import {
  RECORDER_PROFILES,
  type RecorderPipelineOptions,
  type RecorderProfileDefinition,
  type RecorderProfileId,
} from '../constants/recorderProfiles';
import { NativeVad, type NativeVadState } from '../lib/nativeVad';

export type RecorderStatus = 'idle' | 'initializing' | 'recording' | 'processing' | 'error';

export type RecorderState = {
  status: RecorderStatus;
  error?: string;
  meterLevel: number;
  silenceMs?: number;
  isSpeechDetected?: boolean;
  blobUrl?: string;
  blob?: Blob;
  durationMs?: number;
  autoStopReason?: string;
};

type RecorderStateMap = Record<RecorderProfileId, RecorderState>;

type RecordingResult = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
};

type RecorderRuntime = {
  profile: RecorderProfileDefinition;
  recorder: MediaRecorder;
  rawStream: MediaStream;
  recordingStream: MediaStream;
  chunks: Blob[];
  stopPromise: Promise<RecordingResult>;
  resolveStop?: (result: RecordingResult) => void;
  rejectStop?: (error: Error) => void;
  cleanup: () => Promise<void> | void;
  meterAnalyser?: AnalyserNode;
  meterData?: Uint8Array;
  meterRaf?: number;
  lastMeterValue?: number;
  vad?: NativeVad;
  lastVadUiUpdate?: number;
  startedAt: number;
};

type ProcessingGraphResult = {
  stream: MediaStream;
  audioContext: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  meterAnalyser: AnalyserNode;
  vad?: NativeVad;
  cleanup: () => Promise<void>;
};

type MeterOnlyResult = {
  analyser: AnalyserNode;
  cleanup: () => Promise<void>;
};

type ExtendableRecorderModule = typeof import('extendable-media-recorder');
type RecorderErrorEvent = Event & { error?: DOMException };

const RNNOISE_WORKLET_URL = new URL(
  '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js',
  import.meta.url,
).toString();
const RNNOISE_WASM_URL = new URL(
  '@sapphi-red/web-noise-suppressor/rnnoise.wasm',
  import.meta.url,
).toString();
const RNNOISE_WASM_SIMD_URL = new URL(
  '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm',
  import.meta.url,
).toString();
const NOISE_GATE_WORKLET_URL = new URL(
  '@sapphi-red/web-noise-suppressor/noiseGateWorklet.js',
  import.meta.url,
).toString();

let wavRecorderPromise: Promise<typeof window.MediaRecorder> | null = null;
let rnnoiseBinaryPromise: Promise<ArrayBuffer> | null = null;
const workletRegistry = new WeakMap<AudioContext, Set<string>>();

const buildStateMap = (): RecorderStateMap => {
  return RECORDER_PROFILES.reduce<RecorderStateMap>((acc, profile) => {
    acc[profile.id] = { status: 'idle', meterLevel: 0 };
    return acc;
  }, {} as RecorderStateMap);
};

const buildRuntimeMap = () => {
  return RECORDER_PROFILES.reduce<Record<RecorderProfileId, RecorderRuntime | null>>(
    (acc, profile) => {
      acc[profile.id] = null;
      return acc;
    },
    {} as Record<RecorderProfileId, RecorderRuntime | null>,
  );
};

const buildUrlMap = () => {
  return RECORDER_PROFILES.reduce<Record<RecorderProfileId, string | undefined>>(
    (acc, profile) => ({ ...acc, [profile.id]: undefined }),
    {} as Record<RecorderProfileId, string | undefined>,
  );
};

export function useRecorderLab() {
  const [states, setStates] = useState<RecorderStateMap>(() => buildStateMap());
  const runtimesRef = useRef<Record<RecorderProfileId, RecorderRuntime | null>>(buildRuntimeMap());
  const blobUrlsRef = useRef<Record<RecorderProfileId, string | undefined>>(buildUrlMap());

  const updateState = useCallback((profileId: RecorderProfileId, patch: Partial<RecorderState>) => {
    setStates((prev) => ({
      ...prev,
      [profileId]: { ...prev[profileId], ...patch },
    }));
  }, []);

  const stopRecording = useCallback(
    async (profileId: RecorderProfileId, reason?: string) => {
      const runtime = runtimesRef.current[profileId];
      if (!runtime) {
        return;
      }

      if (runtime.recorder.state === 'inactive') {
        return;
      }

      updateState(profileId, {
        status: 'processing',
        autoStopReason: reason ?? states[profileId]?.autoStopReason,
      });

      runtime.recorder.stop();
      runtime.vad?.stop();
      if (runtime.meterRaf) {
        cancelAnimationFrame(runtime.meterRaf);
        runtime.meterRaf = undefined;
      }

      try {
        const result = await runtime.stopPromise;
        const urlMap = blobUrlsRef.current;
        const existingUrl = urlMap[profileId];
        if (existingUrl) {
          URL.revokeObjectURL(existingUrl);
        }
        const url = URL.createObjectURL(result.blob);
        urlMap[profileId] = url;
        updateState(profileId, {
          status: 'idle',
          blob: result.blob,
          blobUrl: url,
          durationMs: result.durationMs,
          meterLevel: 0,
          silenceMs: undefined,
          isSpeechDetected: undefined,
          autoStopReason: reason,
          error: undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao finalizar gravação';
        appLogger.error('🎙️ Falha ao finalizar gravação', { message, profileId });
        updateState(profileId, {
          status: 'error',
          error: message,
        });
      } finally {
        await runtime.cleanup();
        runtimesRef.current[profileId] = null;
      }
    },
    [states, updateState],
  );

  const startRecording = useCallback(
    async (profileId: RecorderProfileId) => {
      const profile = RECORDER_PROFILES.find((item) => item.id === profileId);
      if (!profile) {
        return;
      }

      if (runtimesRef.current[profileId]?.recorder.state === 'recording') {
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        updateState(profileId, {
          status: 'error',
          error: 'MediaDevices não disponível neste ambiente.',
        });
        return;
      }

      updateState(profileId, {
        status: 'initializing',
        error: undefined,
        silenceMs: undefined,
        isSpeechDetected: undefined,
        autoStopReason: undefined,
      });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 48_000,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        const graph = await maybeBuildProcessingGraph(stream, profile.pipeline, {
          onSilence: profile.pipeline.autoStopOnSilence
            ? () => {
                void stopRecording(profileId, 'Silêncio detectado pela VAD');
              }
            : undefined,
          onVadUpdate: profile.pipeline.autoStopOnSilence
            ? (state) => handleVadUpdate(profileId, state, updateState, runtimesRef)
            : undefined,
        });

        const meterOnly = !graph
          ? await createMeterAnalyser(stream)
          : undefined;

        const recordingStream = graph?.stream ?? stream;
        const recorder = await createMediaRecorder(recordingStream, profile.pipeline);

        const runtime: RecorderRuntime = {
          profile,
          recorder,
          rawStream: stream,
          recordingStream,
          chunks: [],
          stopPromise: Promise.resolve({ blob: new Blob(), durationMs: 0, mimeType: profile.pipeline.mimeType }),
          cleanup: async () => {
            graph?.vad?.stop();
            if (graph) {
              await graph.cleanup();
            }
            if (meterOnly) {
              await meterOnly.cleanup();
            }
            stream.getTracks().forEach((track) => track.stop());
          },
          meterAnalyser: graph?.meterAnalyser ?? meterOnly?.analyser,
          meterData: undefined,
          vad: graph?.vad,
          startedAt: performance.now(),
        };

        runtime.stopPromise = new Promise<RecordingResult>((resolve, reject) => {
          runtime.resolveStop = resolve;
          runtime.rejectStop = reject;
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            runtime.chunks.push(event.data);
          }
        };

        recorder.onerror = (event: RecorderErrorEvent) => {
          const message = event.error?.message ?? 'Erro desconhecido no MediaRecorder';
          runtime.rejectStop?.(new Error(message));
        };

        recorder.onstop = () => {
          const blob = new Blob(runtime.chunks, { type: profile.pipeline.mimeType });
          const durationMs = performance.now() - runtime.startedAt;
          runtime.resolveStop?.({ blob, durationMs, mimeType: profile.pipeline.mimeType });
        };

        startMeter(profileId, runtime, updateState);

        runtime.vad?.start();

        runtimesRef.current[profileId] = runtime;

        recorder.start();

        updateState(profileId, {
          status: 'recording',
          meterLevel: 0,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao iniciar gravação';
        appLogger.error('🎙️ Não foi possível iniciar a gravação', {
          profileId,
          error: message,
        });
        updateState(profileId, {
          status: 'error',
          error: message,
        });
      }
    },
    [stopRecording, updateState],
  );

  const resetRecording = useCallback(
    (profileId: RecorderProfileId) => {
      if (runtimesRef.current[profileId]) {
        return;
      }
      const currentUrl = blobUrlsRef.current[profileId];
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        blobUrlsRef.current[profileId] = undefined;
      }
      updateState(profileId, {
        status: 'idle',
        error: undefined,
        blob: undefined,
        blobUrl: undefined,
        durationMs: undefined,
        meterLevel: 0,
        silenceMs: undefined,
        isSpeechDetected: undefined,
        autoStopReason: undefined,
      });
    },
    [updateState],
  );

  return {
    profiles: RECORDER_PROFILES,
    states,
    startRecording,
    stopRecording,
    resetRecording,
  } as const;
}

async function createMediaRecorder(stream: MediaStream, pipeline: RecorderPipelineOptions) {
  if (pipeline.recorderKind === 'extendable-wav') {
    const ExtendableMediaRecorder = await ensureExtendableRecorder();
    return new ExtendableMediaRecorder(stream, {
      mimeType: pipeline.mimeType,
    });
  }

  const options: MediaRecorderOptions = {};
  if (pipeline.mimeType && MediaRecorder.isTypeSupported(pipeline.mimeType)) {
    options.mimeType = pipeline.mimeType;
  }
  if (pipeline.bitrate) {
    options.audioBitsPerSecond = pipeline.bitrate;
  }

  return new MediaRecorder(stream, options);
}

async function ensureExtendableRecorder(): Promise<typeof window.MediaRecorder> {
  if (typeof window === 'undefined') {
    throw new Error('Recorder disponível apenas no browser.');
  }
  if (!wavRecorderPromise) {
    wavRecorderPromise = (async () => {
      const module: ExtendableRecorderModule = await import('extendable-media-recorder');
      const { connect } = await import('extendable-media-recorder-wav-encoder');
      await module.register(await connect());
      return module.MediaRecorder;
    })();
  }
  return wavRecorderPromise;
}

async function maybeBuildProcessingGraph(
  stream: MediaStream,
  pipeline: RecorderPipelineOptions,
  callbacks: {
    onSilence?: () => void;
    onVadUpdate?: (state: NativeVadState) => void;
  },
): Promise<ProcessingGraphResult | undefined> {
  const needsGraph = Boolean(
    pipeline.highPassHz ||
      pipeline.includeNoiseGate ||
      pipeline.includeRnnoise ||
      pipeline.includeCompressor ||
      pipeline.includeLimiter ||
      pipeline.autoStopOnSilence,
  );

  if (!needsGraph) {
    return undefined;
  }

  const audioContext = new AudioContext({ sampleRate: 48_000 });
  await audioContext.resume();

  const source = audioContext.createMediaStreamSource(stream);
  let currentNode: AudioNode = source;
  const nodes: AudioNode[] = [source];

  const tap = (node: AudioNode) => {
    currentNode.connect(node);
    currentNode = node;
    nodes.push(node);
    return node;
  };

  if (pipeline.highPassHz) {
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = pipeline.highPassHz;
    highpass.Q.value = 0.707;
    tap(highpass);
  }

  if (pipeline.includeNoiseGate) {
    await ensureWorklet(audioContext, NOISE_GATE_WORKLET_URL);
    const noiseGate = new NoiseGateWorkletNode(audioContext, {
      openThreshold: -45,
      closeThreshold: -55,
      holdMs: 200,
      maxChannels: 1,
    });
    tap(noiseGate);
  }

  let rnnoiseNode: RnnoiseWorkletNode | undefined;
  if (pipeline.includeRnnoise) {
    await ensureWorklet(audioContext, RNNOISE_WORKLET_URL);
    const wasmBinary = await getRnnoiseBinary();
    rnnoiseNode = new RnnoiseWorkletNode(audioContext, {
      maxChannels: 1,
      wasmBinary,
    });
    tap(rnnoiseNode);
  }

  if (pipeline.includeCompressor) {
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.025;
    compressor.knee.value = 6;
    tap(compressor);
  }

  if (pipeline.includeLimiter) {
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    limiter.knee.value = 0;
    tap(limiter);
  }

  const masterGain = audioContext.createGain();
  masterGain.gain.value = 1;
  tap(masterGain);

  const destination = audioContext.createMediaStreamDestination();

  // Duplicate mono signal to both stereo channels to avoid left-only audio
  // This is necessary because mono signals connected directly to stereo destinations
  // may only play through the left channel in some browsers
  const merger = audioContext.createChannelMerger(2);
  masterGain.connect(merger, 0, 0); // mono → left channel
  masterGain.connect(merger, 0, 1); // mono → right channel
  merger.connect(destination);
  nodes.push(merger);

  const meterAnalyser = audioContext.createAnalyser();
  meterAnalyser.fftSize = 1024;
  meterAnalyser.smoothingTimeConstant = 0.85;
  masterGain.connect(meterAnalyser);

  let vad: NativeVad | undefined;
  if (pipeline.autoStopOnSilence) {
    const vadAnalyser = audioContext.createAnalyser();
    vadAnalyser.fftSize = 2048;
    vadAnalyser.smoothingTimeConstant = 0.8;
    masterGain.connect(vadAnalyser);
    vad = new NativeVad({
      analyser: vadAnalyser,
      silenceThresholdMs: pipeline.silenceThresholdMs ?? 5000,
      minActiveMs: pipeline.minActiveMs ?? 1500,
      onSilence: callbacks.onSilence,
      onUpdate: callbacks.onVadUpdate,
    });
  }

  return {
    stream: destination.stream,
    audioContext,
    destination,
    meterAnalyser,
    vad,
    cleanup: async () => {
      vad?.stop();
      rnnoiseNode?.destroy();
      nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      });
      destination.stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    },
  } satisfies ProcessingGraphResult;
}

async function createMeterAnalyser(stream: MediaStream): Promise<MeterOnlyResult> {
  const audioContext = new AudioContext({ sampleRate: 48_000 });
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;
  source.connect(analyser);
  return {
    analyser,
    cleanup: async () => {
      source.disconnect();
      await audioContext.close();
    },
  };
}

async function ensureWorklet(context: AudioContext, moduleUrl: string) {
  let registry = workletRegistry.get(context);
  if (!registry) {
    registry = new Set<string>();
    workletRegistry.set(context, registry);
  }
  if (registry.has(moduleUrl)) {
    return;
  }
  await context.audioWorklet.addModule(moduleUrl);
  registry.add(moduleUrl);
}

async function getRnnoiseBinary() {
  if (!rnnoiseBinaryPromise) {
    rnnoiseBinaryPromise = loadRnnoise({
      url: RNNOISE_WASM_URL,
      simdUrl: RNNOISE_WASM_SIMD_URL,
    });
  }
  return rnnoiseBinaryPromise;
}

function startMeter(
  profileId: RecorderProfileId,
  runtime: RecorderRuntime,
  updateState: (id: RecorderProfileId, patch: Partial<RecorderState>) => void,
) {
  const analyser = runtime.meterAnalyser;
  if (!analyser) {
    return;
  }
  runtime.meterData = new Uint8Array(analyser.fftSize);

  const tick = () => {
    if (!runtime.meterData) {
      return;
    }
    analyser.getByteTimeDomainData(runtime.meterData);
    let sum = 0;
    for (let i = 0; i < runtime.meterData.length; i += 1) {
      const value = runtime.meterData[i] - 128;
      sum += value * value;
    }
    const rms = Math.min(1, Math.sqrt(sum / runtime.meterData.length) / 90);
    if (!runtime.lastMeterValue || Math.abs(runtime.lastMeterValue - rms) > 0.02) {
      runtime.lastMeterValue = rms;
      updateState(profileId, { meterLevel: Number(rms.toFixed(2)) });
    }
    runtime.meterRaf = requestAnimationFrame(tick);
  };

  runtime.meterRaf = requestAnimationFrame(tick);
}

function handleVadUpdate(
  profileId: RecorderProfileId,
  state: NativeVadState,
  updateState: (id: RecorderProfileId, patch: Partial<RecorderState>) => void,
  runtimesRef: MutableRefObject<Record<RecorderProfileId, RecorderRuntime | null>>,
) {
  const runtime = runtimesRef.current[profileId];
  if (!runtime) {
    return;
  }
  const now = performance.now();
  if (runtime.lastVadUiUpdate && now - runtime.lastVadUiUpdate < 120) {
    return;
  }
  runtime.lastVadUiUpdate = now;
  updateState(profileId, {
    silenceMs: Math.round(state.silenceMs),
    isSpeechDetected: state.isSpeech,
  });
}
