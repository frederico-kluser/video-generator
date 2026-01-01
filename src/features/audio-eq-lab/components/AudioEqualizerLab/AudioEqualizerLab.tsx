import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Gauge,
  Mic,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Waveform,
} from 'lucide-react';

import {
  createRecorderBundle,
  getPreferredMimeType,
  getVoiceMediaConstraints,
  safeStopRecorder,
  useObjectUrl,
} from '@/features/audio-lab/lib/mediaUtils';
import { type LoudnessMetrics, useLoudnessWorker } from '@/shared/audio/hooks/useLoudnessWorker';
import { AudioBufferProcessor, preventClipping, removeDCOffset } from '@/shared/audio/processors/AudioBufferProcessor';
import {
  audioBufferToWaveBlob,
  cloneAudioBuffer,
  convertToMono,
  decodeBlobToAudioBuffer,
  resampleBuffer,
} from '@/shared/audio/utils/audioBuffer';
import {
  applyGain,
  normalizeToTarget,
  PLATFORM_TARGETS,
  type PlatformTargetKey,
} from '@/shared/audio/utils/loudness';
import { appLogger } from '@/shared/logging/logger';

const MAX_SEGMENTS = 4;
const TARGET_SAMPLE_RATE = 48_000;

type Phase = 'idle' | 'preparing' | 'recording' | 'mixing';

type Segment = {
  id: string;
  label: string;
  blob: Blob | null;
  source: 'mic' | 'upload';
  status: 'idle' | 'recording' | 'ready';
  lufs?: number;
  truePeakDb?: number;
};

type MixDiagnostics = {
  raw: LoudnessMetrics;
  normalized: LoudnessMetrics;
  appliedGainDb: number;
  crossfadeMs: number;
  segmentCount: number;
};

let segmentCounter = 0;
function createEmptySegment(): Segment {
  segmentCounter += 1;
  return {
    id: `segment-${segmentCounter}`,
    label: `Clip ${segmentCounter}`,
    blob: null,
    source: 'upload',
    status: 'idle',
  };
}

export function AudioEqualizerLab() {
  const { measureBuffer } = useLoudnessWorker();
  const [segments, setSegments] = useState<Segment[]>(() =>
    Array.from({ length: 3 }, () => createEmptySegment()),
  );
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [crossfadeMs, setCrossfadeMs] = useState(80);
  const [autoGainMatching, setAutoGainMatching] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState<PlatformTargetKey>('spotify');
  const [rawMix, setRawMix] = useState<Blob | null>(null);
  const [normalizedMix, setNormalizedMix] = useState<Blob | null>(null);
  const [mixDiagnostics, setMixDiagnostics] = useState<MixDiagnostics | null>(null);
  const [mixError, setMixError] = useState<string | null>(null);

  const rawMixUrl = useObjectUrl(rawMix);
  const normalizedMixUrl = useObjectUrl(normalizedMix);

  const supportsRecording = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices) &&
      typeof MediaRecorder !== 'undefined',
    [],
  );

  const preferredMimeRef = useRef<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const completionRef = useRef<Promise<Blob> | null>(null);

  useEffect(() => {
    preferredMimeRef.current = getPreferredMimeType();
  }, []);

  const cleanupActiveCapture = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupActiveCapture();
      recorderRef.current = null;
      completionRef.current = null;
    };
  }, [cleanupActiveCapture]);

  const readySegments = useMemo(
    () => segments.filter((segment) => Boolean(segment.blob)),
    [segments],
  );

  const updateSegmentMetrics = useCallback(
    async (segmentId: string, blob: Blob) => {
      try {
        const decoded = await decodeBlobToAudioBuffer(blob, {
          sampleRate: TARGET_SAMPLE_RATE,
        });
        const mono = convertToMono(decoded);
        const resampled = await resampleBuffer(mono, TARGET_SAMPLE_RATE);
        removeDCOffset(resampled);
        preventClipping(resampled);
        const metrics = await measureBuffer(resampled);
        setSegments((prev) =>
          prev.map((segment) =>
            segment.id === segmentId
              ? {
                  ...segment,
                  lufs: metrics.integratedLufs,
                  truePeakDb: metrics.truePeakDb,
                }
              : segment,
          ),
        );
      } catch (error) {
        appLogger.warn('⚠️ Falha ao analisar clip individual.', {
          segmentId,
          error,
        });
      }
    },
    [measureBuffer],
  );

  const handleUploadSegment = useCallback(
    async (segmentId: string, event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      event.target.value = '';

      setSegments((prev) =>
        prev.map((segment) =>
          segment.id === segmentId
            ? { ...segment, blob: file, source: 'upload', status: 'ready' }
            : segment,
        ),
      );
      await updateSegmentMetrics(segmentId, file);
    },
    [updateSegmentMetrics],
  );

  const handleRemoveSegment = useCallback(
    (segmentId: string) => {
      if (activeSegmentId === segmentId || phase === 'recording') {
        return;
      }
      setSegments((prev) => {
        const next = prev.filter((segment) => segment.id !== segmentId);
        if (next.length === 0) {
          return [createEmptySegment()];
        }
        return next;
      });
    },
    [activeSegmentId, phase],
  );

  const handleAddSegment = useCallback(() => {
    setSegments((prev) => (prev.length >= MAX_SEGMENTS ? prev : [...prev, createEmptySegment()]));
  }, []);

  const startRecordingSegment = useCallback(
    async (segmentId: string) => {
      if (!supportsRecording || phase === 'recording' || phase === 'preparing') {
        return;
      }
      setPhase('preparing');
      setMixError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getVoiceMediaConstraints(),
        });
        mediaStreamRef.current = stream;
        const bundle = createRecorderBundle(stream, preferredMimeRef.current);
        recorderRef.current = bundle.recorder;
        completionRef.current = bundle.completion;
        setActiveSegmentId(segmentId);
        setSegments((prev) =>
          prev.map((segment) =>
            segment.id === segmentId
              ? { ...segment, status: 'recording', blob: null }
              : segment,
          ),
        );
        setPhase('recording');
        appLogger.info('🎤 Gravando clip no Equalizer Lab.', { segmentId });
      } catch (error) {
        setPhase('idle');
        setMixError('Não foi possível acessar o microfone para este clip.');
        appLogger.error('💥 Falha ao gravar clip.', { error, segmentId });
        cleanupActiveCapture();
      }
    },
    [cleanupActiveCapture, phase, supportsRecording],
  );

  const stopRecordingSegment = useCallback(async () => {
    if (!activeSegmentId) {
      return;
    }

    setPhase('recording');
    const currentId = activeSegmentId;
    safeStopRecorder(recorderRef.current);

    try {
      const completion = completionRef.current;
      const blob = await (completion ?? Promise.resolve<Blob | null>(null));
      setSegments((prev) =>
        prev.map((segment) =>
          segment.id === currentId
            ? {
                ...segment,
                blob: blob ?? null,
                status: blob ? 'ready' : 'idle',
                source: 'mic',
              }
            : segment,
        ),
      );
      if (blob) {
        await updateSegmentMetrics(currentId, blob);
        appLogger.info('✅ Clip gravado com sucesso.', { currentId });
      }
    } catch (error) {
      setMixError('Erro ao finalizar a gravação. Tente novamente.');
      appLogger.error('💥 Falha ao finalizar clip.', { error });
    } finally {
      cleanupActiveCapture();
      recorderRef.current = null;
      completionRef.current = null;
      setActiveSegmentId(null);
      setPhase('idle');
    }
  }, [activeSegmentId, cleanupActiveCapture, updateSegmentMetrics]);

  const handleMix = useCallback(async () => {
    if (readySegments.length < 2) {
      setMixError('Adicione pelo menos dois clips para gerar a mix.');
      return;
    }

    setPhase('mixing');
    setMixError(null);
    setRawMix(null);
    setNormalizedMix(null);
    setMixDiagnostics(null);

    try {
      const buffers: AudioBuffer[] = [];
      for (const segment of readySegments) {
        const blob = segment.blob as Blob;
        const decoded = await decodeBlobToAudioBuffer(blob, {
          sampleRate: TARGET_SAMPLE_RATE,
        });
        const mono = convertToMono(decoded);
        const resampled = await resampleBuffer(mono, TARGET_SAMPLE_RATE);
        removeDCOffset(resampled);
        preventClipping(resampled);
        let working = cloneAudioBuffer(resampled);

        if (autoGainMatching) {
          const metrics = await measureBuffer(working);
          const desired = PLATFORM_TARGETS[selectedTarget].lufs;
          const gainDb = desired - metrics.integratedLufs;
          const peakRoom = PLATFORM_TARGETS[selectedTarget].truePeak - metrics.truePeakDb;
          const safeGainDb = Math.min(gainDb, peakRoom);
          if (Number.isFinite(safeGainDb) && safeGainDb !== 0) {
            working = applyGain(working, safeGainDb);
          }
        }

        buffers.push(working);
      }

      const processor = new AudioBufferProcessor(TARGET_SAMPLE_RATE);
      const concatenated = await processor.concatenateWithCrossfade(
        buffers,
        Math.max(10, crossfadeMs) / 1000,
      );

      if (!concatenated) {
        throw new Error('Não foi possível concatenar os áudios.');
      }

      const rawMetrics = await measureBuffer(concatenated);
      const rawBlob = audioBufferToWaveBlob(concatenated, { bitDepth: 24 });
      setRawMix(rawBlob);

      const normalized = await normalizeToTarget(
        cloneAudioBuffer(concatenated),
        PLATFORM_TARGETS[selectedTarget],
        measureBuffer,
      );
      const normalizedBlob = audioBufferToWaveBlob(normalized.buffer, { bitDepth: 24 });
      setNormalizedMix(normalizedBlob);
      setMixDiagnostics({
        raw: rawMetrics,
        normalized: normalized.metrics,
        appliedGainDb: normalized.appliedGainDb,
        crossfadeMs,
        segmentCount: buffers.length,
      });

      appLogger.info('🎚️ Mix gerada localmente.', {
        clips: buffers.length,
        crossfadeMs,
        target: selectedTarget,
      });
    } catch (error) {
      setMixError('Não foi possível gerar a mix. Consulte o console.');
      appLogger.error('💥 Falha ao mixar clips.', { error });
    } finally {
      setPhase('idle');
    }
  }, [autoGainMatching, crossfadeMs, measureBuffer, readySegments, selectedTarget]);

  const handleDownload = useCallback(() => {
    if (!normalizedMix) {
      return;
    }
    downloadBlob(normalizedMix, `mix-${selectedTarget}.wav`);
  }, [normalizedMix, selectedTarget]);

  const isBusy = phase === 'mixing' || phase === 'recording' || phase === 'preparing';
  const canMix = readySegments.length >= 2 && !isBusy;

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-16">
      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-primary-500/40 bg-dark-900/70 p-6 text-white">
        <div className="flex items-center gap-3 text-primary-200">
          <SlidersHorizontal size={20} />
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">
            Audio Equalizer Lab
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white">Concatene, faça crossfade e normalize</h1>
        <p className="text-base text-white/70">
          Combine até quatro clips, aplique crossfade equal-power calculado no OfflineAudioContext,
          alinhe LUFS de cada segmento com um Worker (ebur128-wasm) e normalize o master para Spotify,
          Apple ou EBU sem sair do browser.
        </p>
        <ul className="grid gap-2 text-sm text-white/70 md:grid-cols-2">
          <li className="flex items-center gap-2"><Waveform size={14} /> Crossfade equal-power (10–300 ms)</li>
          <li className="flex items-center gap-2"><ShieldCheck size={14} /> Auto gain matching por LUFS</li>
          <li className="flex items-center gap-2"><Gauge size={14} /> Targets -14 / -16 / -23 LUFS</li>
          <li className="flex items-center gap-2"><RefreshCw size={14} /> Normalização final com true peak guard</li>
        </ul>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-primary-300 transition hover:text-primary-200"
        >
          <ArrowLeft size={16} /> Voltar
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">Controles da mix</p>
              <h2 className="text-2xl font-semibold text-white">Configuração</h2>
            </div>
            <Sparkles className="text-primary-300" size={20} />
          </div>

          <label className="text-sm text-white/70">
            Crossfade ({crossfadeMs} ms)
            <input
              type="range"
              min={10}
              max={300}
              step={5}
              value={crossfadeMs}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCrossfadeMs(Number(event.currentTarget.value))
              }
              className="mt-2 w-full accent-primary-400"
            />
          </label>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-white">Auto gain matching</p>
              <p className="text-white/60">Ajusta cada clip para o target antes do crossfade.</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoGainMatching((prev) => !prev)}
              className={`relative h-8 w-14 rounded-full transition ${
                autoGainMatching ? 'bg-primary-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  autoGainMatching ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(PLATFORM_TARGETS).map(([key, target]) => (
              <TargetChip
                key={key}
                label={target.label}
                description={target.description}
                active={selectedTarget === key}
                onClick={() => setSelectedTarget(key as PlatformTargetKey)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              void handleMix();
            }}
            disabled={!canMix}
            className={`btn-primary w-full ${!canMix ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            Gerar mix com crossfade
          </button>
        </div>

        <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">Status</p>
              <h2 className="text-2xl font-semibold text-white">
                {phase === 'mixing'
                  ? 'Mixando...'
                  : phase === 'recording'
                    ? 'Gravando clip'
                    : 'Tudo pronto'}
              </h2>
            </div>
            <ShieldCheck className="text-primary-300" size={20} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricChip label="Clips prontos" value={`${readySegments.length}/${segments.length}`} />
            <MetricChip label="Crossfade" value={`${crossfadeMs} ms`} />
            <MetricChip label="Target" value={PLATFORM_TARGETS[selectedTarget].label} />
          </div>
          <p className="text-xs text-white/60">
            A mix roda 100% localmente usando OfflineAudioContext + Worker, então você pode iterar quantas vezes quiser sem subir arquivos.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Clips individuais</h2>
        <button
          type="button"
          onClick={handleAddSegment}
          disabled={segments.length >= MAX_SEGMENTS}
          className={`rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white transition ${
            segments.length >= MAX_SEGMENTS ? 'cursor-not-allowed opacity-40' : 'hover:border-primary-400'
          }`}
        >
          + Adicionar clip
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {segments.map((segment) => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            ready={Boolean(segment.blob)}
            supportsRecording={supportsRecording}
            isActive={activeSegmentId === segment.id}
            isBusy={isBusy}
            onRecord={() => {
              void startRecordingSegment(segment.id);
            }}
            onStop={() => {
              void stopRecordingSegment();
            }}
            onUpload={(event) => {
              void handleUploadSegment(segment.id, event);
            }}
            onRemove={() => handleRemoveSegment(segment.id)}
          />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <MixPanel
          title="Concatenação bruta"
          subtitle="Crossfade equal-power"
          badge="Pré-normalização"
          color="from-accent-500/30 to-accent-700/30"
          audioUrl={rawMixUrl}
          emptyText="Monte a cadeia e clique em Gerar mix para ouvir aqui."
        />
        <MixPanel
          title="Master normalizado"
          subtitle={PLATFORM_TARGETS[selectedTarget].label}
          badge="Master"
          color="from-primary-500/30 to-primary-700/30"
          audioUrl={normalizedMixUrl}
          emptyText="Após gerar a mix, o master target aparece neste painel."
        />
      </div>

      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">Diagnósticos</p>
            <h2 className="text-2xl font-semibold text-white">LUFS e true peak</h2>
          </div>
          <Gauge className="text-primary-300" size={20} />
        </div>
        {mixDiagnostics ? (
          <div className="grid gap-3 md:grid-cols-3">
            <DiagCard label="Raw" value={formatLufs(mixDiagnostics.raw.integratedLufs)} helper="Integrated" />
            <DiagCard label="Master" value={formatLufs(mixDiagnostics.normalized.integratedLufs)} helper="Integrated" />
            <DiagCard label="True Peak" value={formatDb(mixDiagnostics.normalized.truePeakDb, ' dBTP')} helper="Protegido" />
            <DiagCard label="Clips" value={`${mixDiagnostics.segmentCount}`} helper="Participantes" />
            <DiagCard label="Crossfade" value={`${mixDiagnostics.crossfadeMs} ms`} helper="Equal-power" />
            <DiagCard label="Gain" value={formatDb(mixDiagnostics.appliedGainDb)} helper="Master" />
          </div>
        ) : (
          <p className="text-sm text-white/60">Sem diagnósticos ainda. Gere uma mix para ver os números.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!normalizedMix || isBusy}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              !normalizedMix || isBusy
                ? 'cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
            }`}
          >
            <Download size={16} /> Baixar master WAV
          </button>
          <span className="text-xs text-white/50">
            Exportamos em 24-bit PCM com dithering e proteção -1 dBTP.
          </span>
        </div>
      </div>

      {mixError && (
        <div className="glass-card flex items-center gap-3 rounded-3xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-danger-100">
          <AlertTriangle size={18} />
          <span>{mixError}</span>
        </div>
      )}
    </div>
  );
}

type SegmentCardProps = {
  segment: Segment;
  ready: boolean;
  supportsRecording: boolean;
  isActive: boolean;
  isBusy: boolean;
  onRecord: () => void;
  onStop: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
};

function SegmentCard({
  segment,
  ready,
  supportsRecording,
  isActive,
  isBusy,
  onRecord,
  onStop,
  onUpload,
  onRemove,
}: SegmentCardProps) {
  const previewUrl = useObjectUrl(segment.blob);
  const recording = segment.status === 'recording' && isActive;

  return (
    <div className="glass-card flex flex-col gap-3 rounded-3xl border border-white/5 bg-dark-900/80 p-5 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">Clip</p>
          <h3 className="text-xl font-semibold text-white">{segment.label}</h3>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={recording || isBusy}
          className="btn-icon h-10 w-10 border-white/10 text-white/70"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {previewUrl ? (
        <audio controls className="w-full">
          <source src={previewUrl} />
        </audio>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
          <p>Aguardando áudio.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-white/60">
        <span className="rounded-full border border-white/10 px-3 py-1">
          {ready ? 'Pronto' : segment.status === 'recording' ? 'Gravando' : 'Vazio'}
        </span>
        {segment.lufs !== undefined && (
          <span className="rounded-full border border-white/10 px-3 py-1">{formatLufs(segment.lufs)}</span>
        )}
        {segment.truePeakDb !== undefined && (
          <span className="rounded-full border border-white/10 px-3 py-1">{formatDb(segment.truePeakDb, ' dBTP')}</span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-3">
        <button
          type="button"
          onClick={recording ? onStop : onRecord}
          disabled={!supportsRecording || isBusy}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            !supportsRecording || isBusy
              ? 'cursor-not-allowed opacity-40'
              : recording
                ? 'bg-gradient-to-r from-danger-500 to-danger-600'
                : 'bg-gradient-to-r from-primary-500 to-primary-600'
          }`}
        >
          {recording ? <Square size={16} /> : <Mic size={16} />}
          {recording ? 'Parar' : 'Gravar'}
        </button>
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/30">
          <UploadCloud size={16} /> Upload
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={onUpload}
          />
        </label>
      </div>
    </div>
  );
}

type TargetChipProps = {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
};

function TargetChip({ label, description, active, onClick }: TargetChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? 'border-primary-400/60 bg-primary-500/10 text-white'
          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
      }`}
    >
      <h3 className="text-lg font-semibold text-white">{label}</h3>
      <p className="text-sm text-white/60">{description}</p>
    </button>
  );
}

type MixPanelProps = {
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  audioUrl: string | null;
  emptyText: string;
};

function MixPanel({ title, subtitle, badge, color, audioUrl, emptyText }: MixPanelProps) {
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
          <p>{emptyText}</p>
        </div>
      )}
    </div>
  );
}

type MetricChipProps = {
  label: string;
  value: string;
};

function MetricChip({ label, value }: MetricChipProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-white">
      <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

type DiagCardProps = {
  label: string;
  value: string;
  helper?: string;
};

function DiagCard({ label, value, helper }: DiagCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-white">
      <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {helper && <p className="text-xs text-white/50">{helper}</p>}
    </div>
  );
}

function formatLufs(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return `${value.toFixed(1)} LUFS`;
}

function formatDb(value?: number, suffix = ' dB'): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
