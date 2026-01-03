import { useCallback, useMemo, useRef, useState } from 'react';
import { NonRealTimeVAD } from '@ricky0123/vad-web';
import {
  AlertTriangle,
  AudioWaveform,
  Loader2,
  Mic,
  Scissors,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

import { useVoiceRecorder } from '@/shared/hooks/useVoiceRecorder';
import { useObjectUrl } from '@/shared/audio/mediaRecorder';
import {
  audioBufferToWaveBlob,
  convertToMono,
  decodeBlobToAudioBuffer,
} from '@/shared/audio/utils/audioBuffer';

const ASSET_BASE_PATH = '/vad';
const MIN_SILENCE_MS = 100;
const MAX_SILENCE_MS = 2000;
const DEFAULT_SILENCE_MS = 300;
const VAD_OUTPUT_SAMPLE_RATE = 16_000;

type SpeechChunk = {
  audio: Float32Array;
  start: number;
  end: number;
};

type RecordingPayload = {
  samples: Float32Array;
  sampleRate: number;
};

export function VadLabPage() {
  const recorder = useVoiceRecorder();

  const [silenceMs, setSilenceMs] = useState(DEFAULT_SILENCE_MS);
  const [statusMessage, setStatusMessage] = useState('Capture um áudio para começar.');
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [originalDurationMs, setOriginalDurationMs] = useState<number | null>(null);
  const [trimmedDurationMs, setTrimmedDurationMs] = useState<number | null>(null);
  const [segmentCount, setSegmentCount] = useState<number | null>(null);

  const originalUrl = useObjectUrl(originalBlob);
  const processedUrl = useObjectUrl(processedBlob);

  const recordingPayloadRef = useRef<RecordingPayload | null>(null);
  const vadInstanceRef = useRef<NonRealTimeVAD | null>(null);
  const vadInitPromiseRef = useRef<Promise<NonRealTimeVAD> | null>(null);

  const formatDuration = useCallback((value: number | null) => {
    if (!value) {
      return '--';
    }
    const seconds = value / 1000;
    return `${seconds.toFixed(2)}s`;
  }, []);

  const ensureVadInstance = useCallback(async () => {
    if (vadInstanceRef.current) {
      return vadInstanceRef.current;
    }
    if (!vadInitPromiseRef.current) {
      vadInitPromiseRef.current = NonRealTimeVAD.new({
        modelURL: `${ASSET_BASE_PATH}/silero_vad_legacy.onnx`,
        positiveSpeechThreshold: 0.45,
        negativeSpeechThreshold: 0.3,
        redemptionMs: 1200,
        preSpeechPadMs: 150,
        minSpeechMs: 250,
        ortConfig: (ort) => {
          ort.env.wasm.wasmPaths = `${ASSET_BASE_PATH}/`;
          const threads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
          ort.env.wasm.numThreads = Math.max(1, Math.min(threads, 4));
        },
      }).then((instance) => {
        vadInstanceRef.current = instance;
        return instance;
      });
    }
    return vadInitPromiseRef.current;
  }, []);

  const handleToggleRecording = useCallback(async () => {
    setProcessingError(null);
    setProcessedBlob(null);
    setTrimmedDurationMs(null);
    setSegmentCount(null);

    if (recorder.isRecording) {
      const blob = await recorder.stopRecording();
      if (!blob) {
        setStatusMessage('Nenhum áudio capturado.');
        return;
      }
      try {
        const buffer = await decodeBlobToAudioBuffer(blob);
        const mono = convertToMono(buffer);
        const samples = new Float32Array(mono.getChannelData(0));
        recordingPayloadRef.current = {
          samples,
          sampleRate: mono.sampleRate,
        };
        setOriginalDurationMs(Math.round(mono.duration * 1000));
        setOriginalBlob(blob);
        setStatusMessage('Captura pronta. Ajuste o silêncio e clique em “Gerar áudio sem pausas”.');
      } catch (error) {
        console.error(error);
        setStatusMessage('Falha ao decodificar a gravação.');
      }
    } else {
      setStatusMessage('Gravando… pressione novamente para finalizar.');
      await recorder.startRecording();
    }
  }, [recorder]);

  const handleProcess = useCallback(async () => {
    if (!recordingPayloadRef.current || !originalBlob) {
      setProcessingError('Grave um áudio antes de processar.');
      return;
    }

    setProcessingError(null);
    setIsProcessing(true);
    setStatusMessage('Executando VAD (Silero) no navegador…');

    try {
      const vad = await ensureVadInstance();
      const segments: SpeechChunk[] = [];
      for await (const chunk of vad.run(
        recordingPayloadRef.current.samples,
        recordingPayloadRef.current.sampleRate,
      )) {
        segments.push({
          audio: chunk.audio.slice(),
          start: chunk.start,
          end: chunk.end,
        });
      }

      if (segments.length === 0) {
        setProcessingError('Nenhuma fala detectada. Tente gravar novamente.');
        setProcessedBlob(null);
        return;
      }

      const stitched = rebuildTimeline(segments, silenceMs);
      if (stitched.audio.length === 0) {
        setProcessingError('O áudio final ficou vazio.');
        setProcessedBlob(null);
        return;
      }

      const processedBuffer = buildBufferFromFloat32(stitched.audio, stitched.sampleRate);
      const processed = audioBufferToWaveBlob(processedBuffer, { bitDepth: 16 });
      setProcessedBlob(processed);
      setTrimmedDurationMs(Math.round(processedBuffer.duration * 1000));
      setSegmentCount(segments.length);
      setStatusMessage(
        `Processado ${segments.length} segmentos · silêncios limitados a ${silenceMs} ms.`,
      );
    } catch (error) {
      console.error(error);
      setProcessingError(
        error instanceof Error
          ? error.message
          : 'Erro inesperado ao cortar silêncios.',
      );
    } finally {
      setIsProcessing(false);
    }
  }, [ensureVadInstance, originalBlob, silenceMs]);

  const reductionMs = useMemo(() => {
    if (!originalDurationMs || !trimmedDurationMs) {
      return null;
    }
    return Math.max(0, originalDurationMs - trimmedDurationMs);
  }, [originalDurationMs, trimmedDurationMs]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12 lg:py-16">
      <header className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-dark-900 to-dark-950 p-6 text-white shadow-2xl shadow-indigo-500/10">
        <div className="flex items-center gap-2 text-indigo-200">
          <Sparkles size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.4em]">
            Laboratório de VAD
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          Cortes automáticos de silêncio com @ricky0123/vad-web
        </h1>
        <p className="mt-3 max-w-3xl text-base text-white/80">
          Grave um áudio, escolha o intervalo máximo de silêncio permitido e deixe o Silero VAD
          (rodando via ONNX Runtime Web) reorganizar sua fala. Ideal para demos de interfaces
          hands-free e pós-processamento antes de enviar para o Whisper.
        </p>
        <div className="mt-4 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
          <InfoPill label="Modelo" value="Silero Legacy · 16 kHz" />
          <InfoPill label="Precisão" value="~88% TPR @ 5% FPR" />
          <InfoPill label="Execução" value="Browser · AudioWorklet + ONNX" />
        </div>
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6 rounded-3xl border border-white/5 bg-dark-900/70 p-6 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/50">
                Parâmetro principal
              </p>
              <h2 className="text-2xl font-semibold">Silêncio entre falas</h2>
              <p className="text-sm text-white/70">
                Quanto menor o valor, mais agressivo será o corte entre frases. O padrão (300 ms)
                deixa micro pausas naturais.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-right">
              <p className="text-xs text-white/50">Limite atual</p>
              <p className="text-2xl font-bold">{silenceMs} ms</p>
            </div>
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium text-white/80">
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-white/50">
              <SlidersHorizontal size={14} /> Range de silêncio (100 ms – 2000 ms)
            </span>
            <input
              type="range"
              min={MIN_SILENCE_MS}
              max={MAX_SILENCE_MS}
              step={50}
              value={silenceMs}
              onChange={(event) => setSilenceMs(Number(event.target.value))}
              className="w-full accent-indigo-500"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleToggleRecording()}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                recorder.isRecording
                  ? 'border-red-500/60 bg-red-500/20 text-red-100'
                  : 'border-white/10 bg-white/5 text-white hover:border-indigo-400/60'
              }`}
            >
              <Mic size={16} />
              {recorder.isRecording ? 'Finalizar gravação' : 'Gravar áudio'}
            </button>

            <button
              type="button"
              onClick={() => void handleProcess()}
              disabled={isProcessing || !originalBlob}
              className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-sm font-semibold text-indigo-100 transition enabled:hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scissors size={16} />
              )}
              {isProcessing ? 'Processando…' : 'Gerar áudio sem pausas'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-sm text-white/80">
            <p className="font-semibold text-white">Status</p>
            <p>{statusMessage}</p>
            {processingError && (
              <p className="mt-2 flex items-center gap-2 text-red-300">
                <AlertTriangle size={14} /> {processingError}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AudioCard
              title="Áudio original"
              description="Gravação única com pausas naturais"
              badge="Input"
              duration={formatDuration(originalDurationMs)}
              audioUrl={originalUrl}
            />
            <AudioCard
              title="Áudio com cortes"
              description="Silêncios aparados pelo VAD"
              badge="Processado"
              duration={formatDuration(trimmedDurationMs)}
              audioUrl={processedUrl}
              highlight={reductionMs ? `-${(reductionMs / 1000).toFixed(2)}s` : undefined}
            />
          </div>

          <div className="rounded-2xl border border-white/5 bg-dark-950/40 p-4 text-sm text-white/70">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/40">
              Diagnóstico rápido
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <DiagStat label="Segmentos" value={segmentCount ? `${segmentCount}` : '--'} />
              <DiagStat label="Duração original" value={formatDuration(originalDurationMs)} />
              <DiagStat label="Duração final" value={formatDuration(trimmedDurationMs)} />
            </div>
          </div>
        </div>

        <aside className="space-y-5 rounded-3xl border border-white/5 bg-dark-950/50 p-6 text-white">
          <h3 className="text-xl font-semibold">Como funciona</h3>
          <ul className="space-y-4 text-sm text-white/70">
            <li className="flex gap-3">
              <div className="rounded-full bg-indigo-500/20 p-2 text-indigo-200">
                <AudioWaveform size={16} />
              </div>
              <div>
                <p className="font-semibold text-white">AudioWorklet + ONNX Runtime</p>
                <p>
                  O áudio é ressampleado para 16 kHz e analisado por um modelo Silero VAD carregado via
                  WebAssembly (SharedArrayBuffer habilitado pelo Vite).
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="rounded-full bg-indigo-500/20 p-2 text-indigo-200">
                <SlidersHorizontal size={16} />
              </div>
              <div>
                <p className="font-semibold text-white">Controle preciso de silêncio</p>
                <p>
                  Cada lacuna entre segmentos de fala é reconstruída com no máximo o valor configurado,
                  ideal para roteiros que precisam soar ágeis sem perder respirações naturais.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="rounded-full bg-indigo-500/20 p-2 text-indigo-200">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="font-semibold text-white">Configurações sugeridas</p>
                <p>
                  Para transcrição, aumente o threshold positivo para 0.5 e reduza o período de
                  redenção para ~800 ms. Em ambientes ruidosos, valores de 0.7/0.5 evitam disparos
                  falsos.
                </p>
              </div>
            </li>
          </ul>
        </aside>
      </section>
    </div>
  );
}

function buildBufferFromFloat32(data: Float32Array, sampleRate: number) {
  const audioBuffer = new AudioBuffer({
    length: data.length,
    numberOfChannels: 1,
    sampleRate,
  });
  audioBuffer.copyToChannel(data, 0);
  return audioBuffer;
}

function rebuildTimeline(segments: SpeechChunk[], maxSilenceMs: number) {
  const maxSilenceSamples = Math.round((maxSilenceMs / 1000) * VAD_OUTPUT_SAMPLE_RATE);
  const padSamplesPerSegment = segments.map((segment, index) => {
    const previousSegment = index > 0 ? segments[index - 1] : null;
    const gapMs = previousSegment
      ? Math.max(0, segment.start - previousSegment.end)
      : Math.max(0, segment.start);
    return Math.min(maxSilenceSamples, Math.round((gapMs / 1000) * VAD_OUTPUT_SAMPLE_RATE));
  });

  const totalSamples = segments.reduce((sum, segment, index) => {
    const padSamples = padSamplesPerSegment[index] ?? 0;
    return sum + padSamples + segment.audio.length;
  }, 0);
  const output = new Float32Array(totalSamples);
  let offset = 0;

  segments.forEach((segment, index) => {
    const padSamples = padSamplesPerSegment[index] ?? 0;
    offset += padSamples;
    output.set(segment.audio, offset);
    offset += segment.audio.length;
  });

  return { audio: output, sampleRate: VAD_OUTPUT_SAMPLE_RATE };
}

type InfoPillProps = {
  label: string;
  value: string;
};

function InfoPill({ label, value }: InfoPillProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.4em] text-white/40">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

type AudioCardProps = {
  title: string;
  description: string;
  badge: string;
  duration: string;
  audioUrl: string | null;
  highlight?: string;
};

function AudioCard({ title, description, badge, duration, audioUrl, highlight }: AudioCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-dark-950/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">{badge}</p>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-white/60">{description}</p>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70">
          {duration}
        </span>
      </div>
      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full" />
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-center text-sm text-white/50">
          Sem áudio disponível
        </div>
      )}
      {highlight && (
        <span className="text-xs font-semibold uppercase tracking-[0.4em] text-green-300">
          {highlight}
        </span>
      )}
    </div>
  );
}

type DiagStatProps = {
  label: string;
  value: string;
};

function DiagStat({ label, value }: DiagStatProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.4em] text-white/40">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
