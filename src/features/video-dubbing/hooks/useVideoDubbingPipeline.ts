import { useCallback, useRef, useState } from 'react';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import Crunker from 'crunker';

import { validateAudioBufferHasSignal } from '@/shared/services/audioConversion.service';
import { appLogger } from '@/shared/logging/logger';
import { audioBufferToWAVBlob } from '@/shared/utils/webav.utils';
import {
  synthesizeSpeechWithMiniTTS,
  transcribeAudioBlob,
  translateTranscriptForDubbing,
} from '@/services/openaiService';

export type StepId =
  | 'prepare'
  | 'demux'
  | 'silence'
  | 'transcribe'
  | 'translate'
  | 'tts'
  | 'mux';
export type StepStatus = 'pending' | 'running' | 'success' | 'error';

export interface PipelineStep {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
}

export type SegmentPhase =
  | 'waiting'
  | 'transcribing'
  | 'translated'
  | 'synthesizing'
  | 'ready'
  | 'error';

export interface SegmentState {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  transcript?: string;
  literal?: string;
  translation?: string;
  notes?: string[];
  ttsUrl?: string | null;
  phase: SegmentPhase;
  error?: string;
}

export interface PipelineResult {
  mutedVideoUrl?: string | null;
  sourceAudioUrl?: string | null;
  dubbedAudioUrl?: string | null;
  dubbedVideoUrl?: string | null;
  totalDurationMs?: number;
}

export interface RunPipelineOptions {
  file: File;
  targetLanguage: string;
  voice: string;
  styleHints: string;
  silenceThresholdDb?: number;
  minSilenceMs?: number;
  minSegmentMs?: number;
}

type SegmentAsset = {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  blob: Blob;
};

const DEFAULT_SILENCE_THRESHOLD_DB = -42;
const DEFAULT_MIN_SILENCE_MS = 650;
const DEFAULT_MIN_SEGMENT_MS = 1400;

const STEP_BLUEPRINT: PipelineStep[] = [
  { id: 'prepare', label: 'Setup FFmpeg + GPT stack', status: 'pending' },
  { id: 'demux', label: 'Demux & limpeza', status: 'pending' },
  { id: 'silence', label: 'Detector de silêncio', status: 'pending' },
  { id: 'transcribe', label: 'Transcrição WhisperX-like', status: 'pending' },
  { id: 'translate', label: 'Tradução 3-pass', status: 'pending' },
  { id: 'tts', label: 'gpt-4o-mini-tts', status: 'pending' },
  { id: 'mux', label: 'Mux final', status: 'pending' },
];

const CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

const createInitialSteps = () => STEP_BLUEPRINT.map((step) => ({ ...step }));

export function useVideoDubbingPipeline() {
  const [steps, setSteps] = useState<PipelineStep[]>(() => createInitialSteps());
  const [segments, setSegmentsState] = useState<SegmentState[]>([]);
  const segmentsRef = useRef<SegmentState[]>([]);
  const [result, setResult] = useState<PipelineResult>({});
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const setSegments = useCallback(
    (updater: SegmentState[] | ((prev: SegmentState[]) => SegmentState[])) => {
      setSegmentsState((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (previous: SegmentState[]) => SegmentState[])(prev)
            : updater;
        segmentsRef.current = next;
        return next;
      });
    },
  []);

  const registerUrl = useCallback((blob: Blob | null) => {
    if (!blob) {
      return null;
    }
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.push(url);
    return url;
  }, []);

  const revokeUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const reset = useCallback(() => {
    revokeUrls();
    setSteps(createInitialSteps());
    setSegments([]);
    setResult({});
    setError(null);
  }, [revokeUrls]);

  const setStepStatus = useCallback((id: StepId, status: StepStatus, detail?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === id
          ? {
              ...step,
              status,
              detail,
            }
          : step,
      ),
    );
  }, []);

  const ensureFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) {
      return ffmpegRef.current;
    }

    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });

    ffmpegRef.current = ffmpeg;
    appLogger.info('🧩 FFmpeg wasm carregado para Video Dubbing Lab.');
    return ffmpeg;
  }, []);

  const updateSegment = useCallback((id: string, patch: Partial<SegmentState>) => {
    setSegments((prev) =>
      prev.map((segment) =>
        segment.id === id
          ? {
              ...segment,
              ...patch,
            }
          : segment,
      ),
    );
  }, []);

  const runPipeline = useCallback(
    async (options: RunPipelineOptions) => {
      if (isRunning) {
        return;
      }

      setIsRunning(true);
      setError(null);
      revokeUrls();
      setSteps(createInitialSteps());
      setSegments([]);
      setResult({});

      let currentStep: StepId | null = null;
      const trackStep = (id: StepId, status: StepStatus, detail?: string) => {
        currentStep = id;
        setStepStatus(id, status, detail);
      };

      try {
        trackStep('prepare', 'running', 'Carregando FFmpeg wasm e validando GPT.');
        const ffmpeg = await ensureFFmpeg();
        trackStep('prepare', 'success', 'FFmpeg pronto.');

        trackStep('demux', 'running', 'Extraindo vídeo sem áudio e trilha WAV.');
        const videoFileName = 'input-video.mp4';
        const mutedVideoName = 'video-muted.mp4';
        const extractedAudioName = 'source-audio.wav';
        await ffmpeg.writeFile(videoFileName, await fetchFile(options.file));
        await ffmpeg.exec(['-i', videoFileName, '-map', '0:v:0', '-c:v', 'copy', '-an', mutedVideoName]);
        await ffmpeg.exec([
          '-i',
          videoFileName,
          '-map',
          '0:a:0',
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-sample_fmt',
          's16',
          extractedAudioName,
        ]);

        const mutedVideoBlob = new Blob([await ffmpeg.readFile(mutedVideoName)], {
          type: 'video/mp4',
        });
        const sourceAudioBlob = new Blob([await ffmpeg.readFile(extractedAudioName)], {
          type: 'audio/wav',
        });
        const mutedVideoUrl = registerUrl(mutedVideoBlob);
        const sourceAudioUrl = registerUrl(sourceAudioBlob);
        setResult({
          mutedVideoUrl,
          sourceAudioUrl,
        });
        trackStep('demux', 'success', 'Arquivos auxiliares gerados.');

        trackStep('silence', 'running', 'Detectando silêncios com VAD nativo.');
        const audioBuffer = await decodeBlobToAudioBuffer(sourceAudioBlob);
        if (!validateAudioBufferHasSignal(audioBuffer)) {
          throw new Error('O áudio extraído está vazio ou em silêncio absoluto.');
        }
        const sourceDurationMs = Math.round(audioBuffer.duration * 1000);
        const detection = detectVoiceSegments(audioBuffer, {
          silenceThresholdDb: options.silenceThresholdDb ?? DEFAULT_SILENCE_THRESHOLD_DB,
          minSilenceMs: options.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS,
          minSegmentMs: options.minSegmentMs ?? DEFAULT_MIN_SEGMENT_MS,
        });
        const segmentsToUse = detection.length > 0 ? detection : [{ startMs: 0, endMs: sourceDurationMs }];

        const assets: SegmentAsset[] = [];
        for (let index = 0; index < segmentsToUse.length; index += 1) {
          const segment = segmentsToUse[index];
          const slice = sliceAudioBufferRange(audioBuffer, segment.startMs, segment.endMs);
          const blob = await audioBufferToWAVBlob(slice);
          assets.push({
            id: `segment-${index + 1}`,
            startMs: segment.startMs,
            endMs: segment.endMs,
            durationMs: segment.endMs - segment.startMs,
            blob,
          });
        }
        setSegments(
          assets.map((segment, index) => ({
            id: segment.id,
            index,
            startMs: segment.startMs,
            endMs: segment.endMs,
            durationMs: segment.durationMs,
            phase: 'waiting',
          })),
        );
        setResult((prev) => ({
          ...prev,
          totalDurationMs: sourceDurationMs,
        }));
        trackStep('silence', 'success', `${assets.length} blocos com cortes somente em silêncio.`);

        trackStep('transcribe', 'running', 'Enviando blocos para gpt-4o-mini-transcribe.');
        for (const asset of assets) {
          updateSegment(asset.id, { phase: 'transcribing' });
          const transcript = await transcribeAudioBlob(asset.blob, {});
          updateSegment(asset.id, { transcript });
        }
        trackStep('transcribe', 'success', 'Transcrição concluída.');

        trackStep('translate', 'running', 'Executando pipeline translate ➜ reflect ➜ adapt.');
        for (const asset of assets) {
          const transcript = segmentsRef.current.find((segment) => segment.id === asset.id)?.transcript;
          if (!transcript) {
            continue;
          }
          const translation = await translateTranscriptForDubbing({
            transcript,
            targetLanguage: options.targetLanguage,
            styleHints: options.styleHints,
            durationMs: asset.durationMs,
          });
          updateSegment(asset.id, {
            phase: 'translated',
            literal: translation.literal,
            translation: translation.adapted,
            notes: translation.notes,
          });
        }
        trackStep('translate', 'success', 'Traduções adaptadas geradas.');

        trackStep('tts', 'running', 'Gerando nova voz com gpt-4o-mini-tts.');
        const synthesizedBlobs: Blob[] = [];
        for (const asset of assets) {
          const targetSegment = segmentsRef.current.find((segment) => segment.id === asset.id);
          const textForSpeech = targetSegment?.translation?.trim() || targetSegment?.transcript?.trim();
          if (!textForSpeech) {
            updateSegment(asset.id, {
              phase: 'error',
              error: 'Sem texto válido para sintetizar.',
            });
            continue;
          }
          updateSegment(asset.id, { phase: 'synthesizing' });
          const ttsBlob = await synthesizeSpeechWithMiniTTS(textForSpeech, {
            voice: options.voice,
            format: 'wav',
          });
          synthesizedBlobs.push(ttsBlob);
          const ttsUrl = registerUrl(ttsBlob);
          updateSegment(asset.id, {
            phase: 'ready',
            ttsUrl,
          });
        }

        const dubbedAudioBlob = await concatAndAlignTts(
          synthesizedBlobs,
          sourceDurationMs,
          ffmpeg,
        );
        const dubbedAudioUrl = registerUrl(dubbedAudioBlob);
        setResult((prev) => ({
          ...prev,
          dubbedAudioUrl,
        }));
        trackStep('tts', 'success', 'Blocos sintetizados e alinhados.');

        trackStep('mux', 'running', 'Remixando vídeo mudo com áudio sintetizado.');
        const finalVideoBlob = await attachAudioToVideo({
          ffmpeg,
          videoFileName: mutedVideoName,
          audioBlob: dubbedAudioBlob,
        });
        const dubbedVideoUrl = registerUrl(finalVideoBlob);
        setResult((prev) => ({
          ...prev,
          dubbedVideoUrl,
        }));
        trackStep('mux', 'success', 'Novo MP4 gerado.');

        await Promise.all([
          safeDelete(ffmpeg, videoFileName),
          safeDelete(ffmpeg, mutedVideoName),
          safeDelete(ffmpeg, extractedAudioName),
        ]);
      } catch (executionError) {
        const message =
          executionError instanceof Error
            ? executionError.message
            : 'Falha inesperada no pipeline de dublagem.';
        if (currentStep) {
          setStepStatus(currentStep, 'error', message);
        }
        setError(message);
        appLogger.error('❌ Video Dubbing Lab falhou.', { error: executionError });
      } finally {
        setIsRunning(false);
      }
    },
    [ensureFFmpeg, isRunning, registerUrl, revokeUrls, setStepStatus, updateSegment],
  );

  return {
    steps,
    segments,
    result,
    isRunning,
    error,
    runPipeline,
    reset,
  };
}

async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext não disponível em ambiente SSR.');
  }

  const arrayBuffer = await blob.arrayBuffer();
  const TypedWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioCtx = window.AudioContext ?? TypedWindow.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('AudioContext não é suportado neste navegador.');
  }

  const audioContext = new AudioCtx();
  try {
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

interface SilenceDetectionOptions {
  silenceThresholdDb: number;
  minSilenceMs: number;
  minSegmentMs: number;
}

function detectVoiceSegments(
  audioBuffer: AudioBuffer,
  options: SilenceDetectionOptions,
): Array<{ startMs: number; endMs: number }> {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const monoData = new Float32Array(length);

  for (let channel = 0; channel < channelCount; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      monoData[i] += (channelData[i] ?? 0) / channelCount;
    }
  }

  const threshold = Math.pow(10, options.silenceThresholdDb / 20);
  const windowMs = 30;
  const windowSize = Math.max(1, Math.floor((windowMs / 1000) * sampleRate));
  let segmentStartMs = 0;
  let silenceStartMs: number | null = null;
  let accumulatingSilence = false;
  const detected: Array<{ startMs: number; endMs: number }> = [];

  for (let i = 0; i < length; i += windowSize) {
    const windowEnd = Math.min(i + windowSize, length);
    let sum = 0;
    for (let j = i; j < windowEnd; j += 1) {
      const sample = monoData[j] ?? 0;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / Math.max(1, windowEnd - i));
    const timeMs = (i / sampleRate) * 1000;

    if (rms < threshold) {
      if (!accumulatingSilence) {
        accumulatingSilence = true;
        silenceStartMs = timeMs;
      }
    } else if (accumulatingSilence) {
      if (silenceStartMs !== null && timeMs - silenceStartMs >= options.minSilenceMs) {
        const endMs = silenceStartMs;
        if (endMs - segmentStartMs >= options.minSegmentMs) {
          detected.push({ startMs: segmentStartMs, endMs });
          segmentStartMs = timeMs;
        }
      }
      accumulatingSilence = false;
      silenceStartMs = null;
    }
  }

  const totalMs = (length / sampleRate) * 1000;
  if (
    accumulatingSilence &&
    silenceStartMs !== null &&
    totalMs - silenceStartMs >= options.minSilenceMs &&
    silenceStartMs - segmentStartMs >= options.minSegmentMs
  ) {
    detected.push({ startMs: segmentStartMs, endMs: silenceStartMs });
    segmentStartMs = totalMs;
  }

  if (totalMs - segmentStartMs >= 200) {
    detected.push({ startMs: segmentStartMs, endMs: totalMs });
  }

  return detected;
}

function sliceAudioBufferRange(
  buffer: AudioBuffer,
  startMs: number,
  endMs: number,
): AudioBuffer {
  const startSeconds = Math.max(0, startMs / 1000);
  const endSeconds = Math.max(startSeconds, endMs / 1000);
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(startSeconds * sampleRate);
  const endSample = Math.floor(endSeconds * sampleRate);
  const frameCount = Math.max(endSample - startSample, 1);

  const sliced = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: frameCount,
    sampleRate,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const sourceData = buffer.getChannelData(channel).subarray(startSample, endSample);
    sliced.copyToChannel(sourceData, channel);
  }

  return sliced;
}

async function concatAndAlignTts(
  blobs: Blob[],
  targetDurationMs: number,
  ffmpeg: FFmpeg,
): Promise<Blob> {
  if (blobs.length === 0) {
    throw new Error('Nenhum áudio sintetizado para juntar.');
  }

  const sampleRate = 48000;
  const crunker = new Crunker({ sampleRate });
  const audioContext = new AudioContext({ sampleRate });

  try {
    const buffers: AudioBuffer[] = [];
    for (const blob of blobs) {
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      buffers.push(decoded);
    }

    const concatenated = crunker.concatAudio(buffers);
    const exportResult = crunker.export(concatenated, 'audio/wav');
    let mergedBlob = exportResult.blob;

    const concatenatedDurationMs = Math.max(1, Math.round(concatenated.duration * 1000));
    const ratio = targetDurationMs / concatenatedDurationMs;
    const drift = Math.abs(ratio - 1);
    if (drift <= 0.08) {
      return mergedBlob;
    }

    const tempInput = 'tts-temp.wav';
    const tempOutput = 'tts-aligned.wav';
    await ffmpeg.writeFile(tempInput, await fetchFile(mergedBlob));
    const filters = buildAtempoFilters(ratio);
    await ffmpeg.exec([
      '-i',
      tempInput,
      '-filter:a',
      filters.join(','),
      '-ar',
      `${sampleRate}`,
      '-ac',
      '1',
      tempOutput,
    ]);
    const alignedData = await ffmpeg.readFile(tempOutput);
    mergedBlob = new Blob([alignedData], { type: 'audio/wav' });
    await Promise.all([safeDelete(ffmpeg, tempInput), safeDelete(ffmpeg, tempOutput)]);
    return mergedBlob;
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

async function attachAudioToVideo({
  ffmpeg,
  videoFileName,
  audioBlob,
}: {
  ffmpeg: FFmpeg;
  videoFileName: string;
  audioBlob: Blob;
}): Promise<Blob> {
  const dubbedVideoName = 'dubbed-video.mp4';
  const ttsInputName = 'final-tts.wav';
  await ffmpeg.writeFile(ttsInputName, await fetchFile(audioBlob));
  await ffmpeg.exec([
    '-i',
    videoFileName,
    '-i',
    ttsInputName,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    dubbedVideoName,
  ]);
  const finalData = await ffmpeg.readFile(dubbedVideoName);
  await Promise.all([safeDelete(ffmpeg, dubbedVideoName), safeDelete(ffmpeg, ttsInputName)]);
  return new Blob([finalData], { type: 'video/mp4' });
}

async function safeDelete(ffmpeg: FFmpeg, fileName: string) {
  try {
    await ffmpeg.deleteFile(fileName);
  } catch {
    // Ignora falhas ao remover arquivos temporários
  }
}

function buildAtempoFilters(ratio: number): string[] {
  const filters: string[] = [];
  let remaining = ratio;

  const pushFilter = (value: number) => {
    const sanitized = Number.isFinite(value) ? Math.max(0.5, Math.min(2, value)) : 1;
    filters.push(`atempo=${sanitized.toFixed(3)}`);
  };

  while (remaining > 2) {
    pushFilter(2);
    remaining /= 2;
  }

  while (remaining < 0.5) {
    pushFilter(0.5);
    remaining *= 2;
  }

  if (Math.abs(remaining - 1) > 0.02) {
    pushFilter(remaining);
  }

  if (filters.length === 0) {
    filters.push('atempo=1.0');
  }

  return filters;
}
