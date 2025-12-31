import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm';
import NoiseSuppressorWorklet from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url';
import {
  AlertTriangle,
  ArrowLeft,
  Mic,
  Sparkles,
  Square,
  Waves,
} from 'lucide-react';

import { appLogger } from '@/shared/logging/logger';

const AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
] as const;

type RecorderPhase = 'idle' | 'preparing' | 'recording' | 'processing';
type PipelineMode = 'rnnoise' | 'native';

type RecorderBundle = {
  recorder: MediaRecorder;
  completion: Promise<Blob>;
};

type ProcessedStreamResult = {
  stream: MediaStream;
  cleanup: () => Promise<void> | void;
  mode: PipelineMode;
};

const getPreferredMimeType = (): string | null => {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  return (
    AUDIO_MIME_TYPES.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) ?? null
  );
};

const getAudioConstraints = (): MediaTrackConstraints => ({
  channelCount: 1,
  sampleRate: 48_000,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
});

export function AudioCleanupLab() {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawAudio, setRawAudio] = useState<Blob | null>(null);
  const [cleanAudio, setCleanAudio] = useState<Blob | null>(null);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode | null>(null);

  const preferredMimeTypeRef = useRef<string | null>(null);
  const rawRecorderRef = useRef<MediaRecorder | null>(null);
  const cleanRecorderRef = useRef<MediaRecorder | null>(null);
  const rawCompletionRef = useRef<Promise<Blob> | null>(null);
  const cleanCompletionRef = useRef<Promise<Blob> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pipelineCleanupRef = useRef<(() => Promise<void> | void) | null>(null);

  useEffect(() => {
    preferredMimeTypeRef.current = getPreferredMimeType();
  }, []);

  useEffect(() => {
    return () => {
      safeStopRecorder(rawRecorderRef.current);
      safeStopRecorder(cleanRecorderRef.current);
      cleanupActiveCapture();
    };
  }, []);

  const rawPreviewUrl = useObjectUrl(rawAudio);
  const cleanPreviewUrl = useObjectUrl(cleanAudio);

  const supportsRecording =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices) &&
    typeof MediaRecorder !== 'undefined';

  const startRecording = async () => {
    if (!supportsRecording || phase === 'recording' || phase === 'preparing') {
      return;
    }

    setErrorMessage(null);
    setRawAudio(null);
    setCleanAudio(null);
    setPipelineMode(null);
    setPhase('preparing');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(),
      });
      mediaStreamRef.current = stream;

      const rawBundle = createRecorderBundle(
        stream,
        preferredMimeTypeRef.current,
      );
      rawRecorderRef.current = rawBundle.recorder;
      rawCompletionRef.current = rawBundle.completion;

      const processed = await setupNoiseSuppressionPipeline(stream);
      if (processed) {
        pipelineCleanupRef.current = processed.cleanup;
        setPipelineMode(processed.mode);
        const cleanBundle = createRecorderBundle(
          processed.stream,
          preferredMimeTypeRef.current,
        );
        cleanRecorderRef.current = cleanBundle.recorder;
        cleanCompletionRef.current = cleanBundle.completion;
      } else {
        pipelineCleanupRef.current = null;
        setPipelineMode(null);
      }

      setPhase('recording');
      appLogger.info('🎙️ Audio Cleanup Lab iniciado.', {
        pipeline: processed?.mode ?? 'raw-only',
      });
    } catch (error) {
      setPhase('idle');
      setErrorMessage(
        'Não foi possível iniciar a gravação. Verifique se o navegador tem acesso ao microfone.',
      );
      appLogger.error('💥 Falha ao iniciar a captura no Audio Cleanup Lab.', {
        error,
      });
      cleanupActiveCapture();
    }
  };

  const stopRecording = async () => {
    if (phase !== 'recording') {
      return;
    }
    setPhase('processing');

    try {
      const rawPromise = rawCompletionRef.current?.catch((error) => {
        appLogger.error('💥 Erro ao finalizar áudio bruto.', { error });
        return null as Blob | null;
      });

      const cleanPromise = cleanCompletionRef.current?.catch((error) => {
        appLogger.error('💥 Erro ao finalizar áudio tratado.', { error });
        return null as Blob | null;
      });

      safeStopRecorder(rawRecorderRef.current);
      safeStopRecorder(cleanRecorderRef.current);

      const [rawBlob, cleanBlob] = await Promise.all([
        rawPromise ?? Promise.resolve<Blob | null>(null),
        cleanPromise ?? Promise.resolve<Blob | null>(null),
      ]);

      setRawAudio(rawBlob);
      setCleanAudio(cleanBlob);
      setPhase('idle');
      appLogger.info('✅ Audio Cleanup Lab finalizado.', {
        hasRaw: Boolean(rawBlob),
        hasClean: Boolean(cleanBlob),
      });
    } catch (error) {
      setErrorMessage(
        'Algo deu errado ao finalizar a gravação. Tente novamente.',
      );
      setPhase('idle');
      appLogger.error('💥 Erro inesperado ao finalizar o Audio Cleanup Lab.', {
        error,
      });
    } finally {
      cleanupActiveCapture();
      rawRecorderRef.current = null;
      rawCompletionRef.current = null;
      cleanRecorderRef.current = null;
      cleanCompletionRef.current = null;
    }
  };

  const cleanupActiveCapture = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (pipelineCleanupRef.current) {
      Promise.resolve()
        .then(() => pipelineCleanupRef.current?.())
        .catch((error) => {
          appLogger.warn('⚠️ Falha ao limpar AudioContext do Audio Lab.', {
            error,
          });
        })
        .finally(() => {
          pipelineCleanupRef.current = null;
        });
    }
  };

  const isBusy = phase === 'preparing' || phase === 'processing';
  const recorderCta =
    phase === 'recording' ? 'Parar e analisar' : 'Gravar amostra';

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-16">
      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-primary-500/40 bg-dark-900/70 p-6 text-white">
        <div className="flex items-center gap-3 text-primary-200">
          <Sparkles size={20} />
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">
            Audio Cleanup Lab
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white">
          Compare antes e depois
        </h1>
        <p className="text-base text-white/70">
          Grave uma amostra de voz, ouvindo a captura original e o resultado com
          nossa cadeia de filtros (RNNoise → high-pass → compressor → limiter).
          Ideal para ajustar microfones antes de produzir um roteiro completo.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          <div className="rounded-full border border-white/10 px-3 py-1">
            48 kHz mono
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1">
            RNNoise AudioWorklet
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1">
            Comparativo instantâneo
          </div>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-primary-300 transition hover:text-primary-200"
        >
          <ArrowLeft size={16} /> Voltar para o fluxo principal
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <AudioPanel
          title="Original"
          subtitle="Stream direto do microfone"
          badge="Antes"
          color="from-danger-500/40 to-danger-600/30"
          audioUrl={rawPreviewUrl}
          emptyHeadline="Grave para visualizar"
          emptyDescription="Clique em Gravar amostra para capturar o áudio bruto."
        />
        <AudioPanel
          title="Tratado"
          subtitle={
            pipelineMode === 'rnnoise'
              ? 'RNNoise + compressão dinâmica'
              : 'Filtros nativos (sem RNNoise)'
          }
          badge="Depois"
          color="from-success-500/40 to-success-600/30"
          audioUrl={cleanPreviewUrl}
          emptyHeadline="Aguardando processamento"
          emptyDescription="Após parar a gravação, o áudio tratado aparece aqui."
        />
      </div>

      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">
              Controle
            </p>
            <p className="text-lg font-semibold text-white">
              {phase === 'recording'
                ? 'Gravando… descreva um trecho curto.'
                : isBusy
                  ? 'Finalizando buffers…'
                  : 'Pressione para iniciar uma nova amostra.'}
            </p>
          </div>

          <button
            type="button"
            disabled={!supportsRecording || isBusy}
            onClick={phase === 'recording' ? stopRecording : startRecording}
            className={`group relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-all duration-300 ${
              phase === 'recording'
                ? 'bg-gradient-to-br from-danger-500 to-danger-600 hover:scale-105'
                : 'bg-gradient-to-br from-primary-500 to-primary-600 hover:scale-105'
            } ${(!supportsRecording || isBusy) && 'cursor-not-allowed opacity-60'}`}
          >
            <div className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
            {phase === 'recording' ? <Square size={28} /> : <Mic size={28} />}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatusBadge
            icon={<Waves size={16} />}
            label="Pipeline"
            value={
              pipelineMode === 'rnnoise' ? 'RNNoise ativo' : 'Fallback nativo'
            }
          />
          <StatusBadge
            icon={<Sparkles size={16} />}
            label="Estado"
            value={
              phase === 'recording'
                ? 'Gravando'
                : phase === 'processing'
                  ? 'Processando'
                  : 'Pronto'
            }
          />
          <StatusBadge
            icon={<Mic size={16} />}
            label="Compatibilidade"
            value={supportsRecording ? 'Tudo certo' : 'Microfone indisponível'}
          />
        </div>

        {errorMessage && (
          <div className="flex items-center gap-3 rounded-2xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-danger-100">
            <AlertTriangle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function createRecorderBundle(
  stream: MediaStream,
  preferredMime: string | null,
): RecorderBundle {
  const options: MediaRecorderOptions = {
    audioBitsPerSecond: 128_000,
  };
  if (preferredMime) {
    options.mimeType = preferredMime;
  }

  const recorder = new MediaRecorder(stream, options);
  const completion = new Promise<Blob>((resolve, reject) => {
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      reject(
        event.error ?? new Error('MediaRecorder falhou durante a captura.'),
      );
    };

    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    };
  });

  recorder.start();
  return { recorder, completion };
}

async function setupNoiseSuppressionPipeline(
  stream: MediaStream,
): Promise<ProcessedStreamResult | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) {
    appLogger.warn(
      '🛑 AudioContext indisponível; impossibilitado de aplicar filtros.',
    );
    return null;
  }

  const ctx = new AudioContextCtor({ sampleRate: 48_000 });
  const source = ctx.createMediaStreamSource(stream);
  const nodes: AudioNode[] = [source];
  let mode: PipelineMode = 'native';

  const connectNode = (next: AudioNode) => {
    nodes[nodes.length - 1].connect(next);
    nodes.push(next);
  };

  try {
    await ctx.audioWorklet.addModule(NoiseSuppressorWorklet);
    const noiseNode = new AudioWorkletNode(ctx, NoiseSuppressorWorklet_Name);
    connectNode(noiseNode);
    mode = 'rnnoise';
  } catch (error) {
    appLogger.warn(
      '🤖 RNNoise indisponível; aplicando somente filtros nativos.',
      { error },
    );
  }

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 80;
  connectNode(highpass);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  connectNode(compressor);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  connectNode(limiter);

  const destination = ctx.createMediaStreamDestination();
  nodes[nodes.length - 1].connect(destination);

  return {
    stream: destination.stream,
    mode,
    cleanup: async () => {
      nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch {
          /* ignore disconnect errors */
        }
      });
      destination.disconnect();
      await ctx.close().catch(() => undefined);
    },
  };
}

function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) {
      return undefined;
    }
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}

function safeStopRecorder(recorder: MediaRecorder | null) {
  if (!recorder) {
    return;
  }
  if (recorder.state !== 'inactive') {
    try {
      recorder.stop();
    } catch (error) {
      appLogger.warn('⚠️ Falha ao parar MediaRecorder.', { error });
    }
  }
}

type AudioPanelProps = {
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  audioUrl: string | null;
  emptyHeadline: string;
  emptyDescription: string;
};

function AudioPanel({
  title,
  subtitle,
  badge,
  color,
  audioUrl,
  emptyHeadline,
  emptyDescription,
}: AudioPanelProps) {
  return (
    <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/60">{subtitle}</p>
          <h2 className="text-2xl font-semibold text-white">{title}</h2>
        </div>
        <span
          className={`rounded-full bg-gradient-to-r ${color} px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90`}
        >
          {badge}
        </span>
      </div>

      {audioUrl ? (
        <audio controls className="w-full">
          <source src={audioUrl} />
        </audio>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-white/60">
          <p className="text-lg font-semibold text-white/80">{emptyHeadline}</p>
          <p className="text-sm text-white/60">{emptyDescription}</p>
        </div>
      )}
    </div>
  );
}

type StatusBadgeProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function StatusBadge({ icon, label, value }: StatusBadgeProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-white">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/40">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
