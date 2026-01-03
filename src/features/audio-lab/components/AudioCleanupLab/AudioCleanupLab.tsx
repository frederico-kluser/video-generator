import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  AudioWaveform,
  Cpu,
  Download,
  Gauge,
  Mic,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  UploadCloud,
} from 'lucide-react';

import {
  createRecorderBundle,
  getAudioConstraints,
  getPreferredMimeType,
  safeStopRecorder,
  useObjectUrl,
} from '@/features/audio-lab/lib/mediaUtils';
import { type LoudnessMetrics, useLoudnessWorker } from '@/shared/audio/hooks/useLoudnessWorker';
import { preventClipping, removeDCOffset } from '@/shared/audio/processors/AudioBufferProcessor';
import {
  audioBufferToWaveBlob,
  cloneAudioBuffer,
  convertToMono,
  decodeBlobToAudioBuffer,
  resampleBuffer,
} from '@/shared/audio/utils/audioBuffer';
import {
  dbToLinear,
  normalizeToTarget,
  PLATFORM_TARGETS,
  type PlatformTargetKey,
} from '@/shared/audio/utils/loudness';
import { appLogger } from '@/shared/logging/logger';

const TARGET_SAMPLE_RATE = 44_100;

const DEFAULT_CHAIN = {
  highpass: true,
  adaptiveGate: true,
  spectralTilt: true,
  normalize: true,
} as const;

type ChainStage = keyof typeof DEFAULT_CHAIN;

type Phase = 'idle' | 'capturing' | 'processing';

type CleanupDiagnostics = {
  original: LoudnessMetrics;
  processed: LoudnessMetrics;
  snrImprovementDb: number;
  noiseReductionDb: number;
  appliedGainDb: number;
  processingTimeMs: number;
};

const CHAIN_DEFINITION: Record<
  ChainStage,
  { label: string; description: string; badge: string; icon: ReactNode }
> = {
  highpass: {
    label: 'High-pass + DC',
    description: 'Remove hum (80 Hz) e offset DC antes dos nós WASM.',
    badge: 'Filtro',
    icon: <AudioWaveform size={16} />,
  },
  adaptiveGate: {
    label: 'Adaptive gate',
    description: 'Noise gate dinâmico usando envelope + threshold LUFS.',
    badge: 'Gate',
    icon: <ShieldCheck size={16} />,
  },
  spectralTilt: {
    label: 'Spectral tilt',
    description: 'Lowshelf + notch + de-esser renderizados no OfflineAudioContext.',
    badge: 'EQ',
    icon: <Settings2 size={16} />,
  },
  normalize: {
    label: 'LUFS + True Peak',
    description: 'Normalização ITU-R BS.1770-5 com proteção -1 dBTP.',
    badge: 'Master',
    icon: <Gauge size={16} />,
  },
};

export function AudioCleanupLab() {
  const { measureBuffer } = useLoudnessWorker();
  const [chain, setChain] = useState<Record<ChainStage, boolean>>({ ...DEFAULT_CHAIN });
  const [selectedTarget, setSelectedTarget] = useState<PlatformTargetKey>('podcast');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMessage, setStatusMessage] = useState('Aguardando captura local');
  const [error, setError] = useState<string | null>(null);
  const [rawBlob, setRawBlob] = useState<Blob | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [diagnostics, setDiagnostics] = useState<CleanupDiagnostics | null>(null);
  const [momentaryLufs, setMomentaryLufs] = useState<number | null>(null);
  const [needsReprocess, setNeedsReprocess] = useState(false);

  const rawPreviewUrl = useObjectUrl(rawBlob);
  const processedPreviewUrl = useObjectUrl(processedBlob);

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterNodeRef = useRef<AudioWorkletNode | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterGainRef = useRef<GainNode | null>(null);
  const workletLoadedRef = useRef(false);
  const reprocessEnabledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pipelineTarget = PLATFORM_TARGETS[selectedTarget];
  const isRecording = phase === 'capturing';
  const isBusy = phase === 'processing';
  const canChangeChain = !isRecording && !isBusy;
  const hasProcessedAudio = Boolean(processedBlob);

  useEffect(() => {
    preferredMimeRef.current = getPreferredMimeType();
  }, []);

  const cleanupActiveCapture = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const teardownLiveMeter = useCallback(() => {
    if (meterNodeRef.current) {
      meterNodeRef.current.port.onmessage = null;
      meterNodeRef.current.port.close();
      meterNodeRef.current.disconnect();
    }
    meterSourceRef.current?.disconnect();
    meterGainRef.current?.disconnect();
    meterNodeRef.current = null;
    meterSourceRef.current = null;
    meterGainRef.current = null;
    setMomentaryLufs(null);
  }, []);

  useEffect(() => {
    return () => {
      cleanupActiveCapture();
      teardownLiveMeter();
      const context = audioContextRef.current;
      if (context) {
        context.close().catch(() => undefined);
      }
    };
  }, [cleanupActiveCapture, teardownLiveMeter]);

  useEffect(() => {
    if (!rawBlob || !reprocessEnabledRef.current) {
      return;
    }
    setNeedsReprocess(true);
  }, [chain, selectedTarget, rawBlob]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') {
      throw new Error('AudioContext indisponível fora do browser.');
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return audioContextRef.current;
    }

    const AudioContextCtor =
      window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('AudioContext não suportado neste navegador.');
    }

    const context = new AudioContextCtor({
      latencyHint: 'interactive',
      sampleRate: TARGET_SAMPLE_RATE,
    });

    audioContextRef.current = context;
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context;
  }, []);

  const setupLiveMeter = useCallback(
    async (stream: MediaStream) => {
      const context = await ensureAudioContext();
      if (!workletLoadedRef.current) {
        const loudnessProcessorModule = new URL(
          '../../../../shared/audio/worklets/loudness-processor.worklet.ts',
          import.meta.url,
        );
        await context.audioWorklet.addModule(loudnessProcessorModule);
        workletLoadedRef.current = true;
      }

      const source = context.createMediaStreamSource(stream);
      const meterNode = new AudioWorkletNode(context, 'loudness-processor');
      meterNode.port.onmessage = (
        event: MessageEvent<{ type: string; value: number }>,
      ) => {
        const message = event.data;
        if (message?.type === 'momentary' && Number.isFinite(message.value)) {
          setMomentaryLufs(message.value);
        }
      };

      const mute = context.createGain();
      mute.gain.value = 0;

      source.connect(meterNode).connect(mute).connect(context.destination);
      meterSourceRef.current = source;
      meterNodeRef.current = meterNode;
      meterGainRef.current = mute;
    },
    [ensureAudioContext],
  );

  const processBlob = useCallback(
    async (blob: Blob) => {
      const start = performance.now();
      setStatusMessage('Decodificando áudio (WASM + OfflineAudioContext)...');
      setError(null);

      const decoded = await decodeBlobToAudioBuffer(blob, {
        sampleRate: TARGET_SAMPLE_RATE,
      });
      const mono = convertToMono(decoded);
      const resampled = await resampleBuffer(mono, TARGET_SAMPLE_RATE);
      removeDCOffset(resampled);
      preventClipping(resampled, 0.01);

      const originalMetrics = await measureBuffer(resampled);
      let working = cloneAudioBuffer(resampled);

      if (chain.highpass || chain.spectralTilt) {
        working = await applyToneShaping(working, {
          enableHighpass: chain.highpass,
          enableTilt: chain.spectralTilt,
        });
      }

      if (chain.adaptiveGate) {
        working = applyAdaptiveGate(working, originalMetrics.noiseFloorDb + 6);
      }

      removeDCOffset(working);
      preventClipping(working);

      let appliedGainDb = 0;
      let processedMetrics: LoudnessMetrics;

      if (chain.normalize) {
        const normalization = await normalizeToTarget(
          working,
          PLATFORM_TARGETS[selectedTarget],
          measureBuffer,
        );
        working = normalization.buffer;
        appliedGainDb = normalization.appliedGainDb;
        processedMetrics = normalization.metrics;
      } else {
        processedMetrics = await measureBuffer(working);
      }

      preventClipping(working);

      const processedWave = audioBufferToWaveBlob(working, { bitDepth: 24 });
      setProcessedBlob(processedWave);

      const processingTimeMs = performance.now() - start;
      const snrImprovementDb =
        (processedMetrics.integratedLufs - processedMetrics.noiseFloorDb) -
        (originalMetrics.integratedLufs - originalMetrics.noiseFloorDb);
      const noiseReductionDb =
        originalMetrics.noiseFloorDb - processedMetrics.noiseFloorDb;

      setDiagnostics({
        original: originalMetrics,
        processed: processedMetrics,
        snrImprovementDb,
        noiseReductionDb,
        appliedGainDb,
        processingTimeMs,
      });

      setStatusMessage('Pipeline local pronto');
      setNeedsReprocess(false);
      reprocessEnabledRef.current = true;

      appLogger.info('🧼 Processamento local concluído.', {
        chain,
        target: selectedTarget,
        processingTimeMs,
      });
    },
    [chain, measureBuffer, selectedTarget],
  );

  const startRecording = useCallback(async () => {
    if (!supportsRecording || isRecording || isBusy) {
      return;
    }

    setError(null);
    setStatusMessage('Inicializando captura Web Audio...');
    setPhase('capturing');
    setProcessedBlob(null);
    setDiagnostics(null);
    setNeedsReprocess(false);
    reprocessEnabledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(),
      });
      mediaStreamRef.current = stream;
      await setupLiveMeter(stream);
      const bundle = createRecorderBundle(stream, preferredMimeRef.current);
      recorderRef.current = bundle.recorder;
      completionRef.current = bundle.completion;
      setStatusMessage('Gravando amostra local em 32-bit float');
      appLogger.info('🎙️ Captura local iniciada.', {
        chain,
        target: selectedTarget,
      });
    } catch (captureError) {
      setPhase('idle');
      setStatusMessage('Falha ao inicializar captura local');
      setError('Não foi possível acessar o microfone (Web Audio API).');
      appLogger.error('💥 Falha ao iniciar captura local.', {
        error: captureError,
      });
      cleanupActiveCapture();
      teardownLiveMeter();
    }
  }, [chain, cleanupActiveCapture, isBusy, isRecording, selectedTarget, setupLiveMeter, supportsRecording, teardownLiveMeter]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    setPhase('processing');
    setStatusMessage('Processando captura local...');

    try {
      const completion = completionRef.current;
      safeStopRecorder(recorderRef.current);
      teardownLiveMeter();
      const blob = await (completion ?? Promise.resolve<Blob | null>(null));
      if (!blob) {
        throw new Error('Amostra vazia.');
      }
      setRawBlob(blob);
      await processBlob(blob);
    } catch (stopError) {
      setError('Não foi possível processar a captura local.');
      appLogger.error('💥 Falha ao processar captura local.', { error: stopError });
    } finally {
      cleanupActiveCapture();
      recorderRef.current = null;
      completionRef.current = null;
      setPhase('idle');
    }
  }, [cleanupActiveCapture, isRecording, processBlob, teardownLiveMeter]);

  const handleFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      reprocessEnabledRef.current = false;
      setNeedsReprocess(false);
      setRawBlob(file);
      setPhase('processing');
      setStatusMessage('Processando arquivo carregado...');

      try {
        await processBlob(file);
      } catch (uploadError) {
        setError('Não foi possível processar o arquivo enviado.');
        appLogger.error('💥 Falha ao processar upload.', { error: uploadError });
      } finally {
        setPhase('idle');
      }
    },
    [processBlob],
  );

  const handleReprocess = useCallback(async () => {
    if (!rawBlob || isRecording || isBusy) {
      return;
    }

    setPhase('processing');
    setStatusMessage('Aplicando nova cadeia DSP...');
    try {
      await processBlob(rawBlob);
    } catch (reprocessError) {
      setError('Falha ao reprocessar a amostra local.');
      appLogger.error('💥 Falha ao reprocessar pipeline local.', {
        error: reprocessError,
      });
    } finally {
      setPhase('idle');
    }
  }, [isBusy, isRecording, processBlob, rawBlob]);

  const handleDownload = useCallback(() => {
    if (!processedBlob) {
      return;
    }
    downloadBlob(processedBlob, `cleanup-${selectedTarget}.wav`);
  }, [processedBlob, selectedTarget]);

  const toggleStage = useCallback(
    (stage: ChainStage) => {
      if (!canChangeChain) {
        return;
      }
      setChain((prev) => ({ ...prev, [stage]: !prev[stage] }));
    },
    [canChangeChain],
  );

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-16">
      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-primary-500/40 bg-dark-900/70 p-6 text-white">
        <div className="flex items-center gap-3 text-primary-200">
          <Sparkles size={20} />
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">
            Browser Noise Lab
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white">Processamento profissional 100% no browser</h1>
        <p className="text-base text-white/70">
          Esta versão do Audio Cleanup Lab abandona o backend remoto e aplica
          filtros Web Audio API, AudioWorklet e análise LUFS com WebAssembly (ebur128)
          direto no navegador. Capture a voz, veja o LUFS em tempo real e exporte o
          áudio normalizado com proteção de true peak.
        </p>
        <ul className="grid gap-2 text-sm text-white/70 md:grid-cols-2">
          <li className="flex items-center gap-2"><ShieldCheck size={14} /> AudioWorklet + gate dinâmico (0.4 s blocks)</li>
          <li className="flex items-center gap-2"><Cpu size={14} /> Web Worker + ebur128-wasm (multi-thread)</li>
          <li className="flex items-center gap-2"><AudioWaveform size={14} /> Crossfade e filtros renderizados no OfflineAudioContext</li>
          <li className="flex items-center gap-2"><Gauge size={14} /> Targets Spotify/Apple/EBU com -1 dBTP</li>
        </ul>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-primary-300 transition hover:text-primary-200"
        >
          <ArrowLeft size={16} /> Voltar para o fluxo principal
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">Captura local</p>
              <h2 className="text-2xl font-semibold text-white">
                {isRecording ? 'Gravando...' : isBusy ? 'Processando...' : 'Pronto para gravar ou importar'}
              </h2>
            </div>
            <Settings2 className="text-primary-300" size={20} />
          </div>
          <p className="text-sm text-white/60">{statusMessage}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusBadge icon={<Activity size={14} />} label="Estado" value={
              isRecording ? 'Capturando' : isBusy ? 'Processando' : 'Ocioso'
            } />
            <StatusBadge icon={<Gauge size={14} />} label="Target" value={pipelineTarget.label} />
            <StatusBadge
              icon={<Cpu size={14} />}
              label="Worklet"
              value={workletLoadedRef.current ? 'Ativo' : 'Aguardando gesto'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!supportsRecording || isBusy}
              onClick={() => {
                if (isRecording) {
                  void stopRecording();
                } else {
                  void startRecording();
                }
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${
                !supportsRecording || isBusy
                  ? 'cursor-not-allowed opacity-50'
                  : isRecording
                    ? 'bg-gradient-to-r from-danger-500 to-danger-600 text-white'
                    : 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
              }`}
            >
              {isRecording ? <Square size={16} /> : <Mic size={16} />}
              {isRecording ? 'Parar e processar' : 'Gravar amostra'}
            </button>
            <button
              type="button"
              className="btn-icon h-12 w-12 border-white/10 text-white/70"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording || isBusy}
            >
              <UploadCloud size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                void handleFileUpload(event);
              }}
            />
            <button
              type="button"
              onClick={() => {
                void handleReprocess();
              }}
              disabled={!rawBlob || isBusy || isRecording || !needsReprocess}
              className={`flex items-center gap-2 rounded-full border border-white/10 px-4 py-3 text-sm font-semibold transition ${
                needsReprocess && !isBusy && !isRecording
                  ? 'text-white hover:border-primary-400 hover:text-primary-100'
                  : 'cursor-not-allowed opacity-40'
              }`}
            >
              <RefreshCw size={16} /> Atualizar cadeia
            </button>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/40">
              <span>LUFS momentâneo</span>
              <span>AudioWorklet</span>
            </div>
            <p className="mt-2 text-3xl font-semibold text-white">
              {momentaryLufs !== null ? `${momentaryLufs.toFixed(1)} LUFS` : '--'}
            </p>
            <p className="text-xs text-white/60">400 ms · 75% overlap conforme ITU-R BS.1770-5.</p>
          </div>
        </div>

        <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">Target de loudness</p>
              <h2 className="text-2xl font-semibold text-white">Selecione a plataforma</h2>
            </div>
            <Gauge className="text-primary-300" size={20} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(PLATFORM_TARGETS).map(([key, target]) => (
              <TargetCard
                key={key}
                label={target.label}
                description={target.description}
                active={selectedTarget === key}
                disabled={!canChangeChain}
                onClick={() => setSelectedTarget(key as PlatformTargetKey)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">Cadeia de DSP</p>
            <h2 className="text-2xl font-semibold text-white">Ative/desative cada estágio</h2>
            <p className="text-sm text-white/60">
              Todos os estágios rodam no browser: filtros Biquad (OfflineAudioContext), gate adaptativo em Float32Array,
              LUFS no Worker (ebur128-wasm) e AudioWorklet para monitoramento.
            </p>
          </div>
          {needsReprocess && (
            <span className="rounded-full border border-primary-400/40 px-3 py-1 text-xs text-primary-100">
              Mudanças pendentes
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(CHAIN_DEFINITION) as ChainStage[]).map((stage) => (
            <ChainToggleCard
              key={stage}
              stage={stage}
              active={chain[stage]}
              disabled={!canChangeChain}
              onToggle={() => toggleStage(stage)}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <WavePanel
          title="Original"
          subtitle="Fluxo direto do microfone ou upload"
          badge="Antes"
          color="from-danger-500/30 to-danger-600/30"
          audioUrl={rawPreviewUrl}
          emptyText="Grave ou envie um arquivo para acompanhar aqui."
        />
        <WavePanel
          title="Processado"
          subtitle={diagnostics ? `${pipelineTarget.label} · ${formatLufs(diagnostics.processed.integratedLufs)}` : 'DSP local'}
          badge="Depois"
          color="from-success-500/30 to-success-600/30"
          audioUrl={processedPreviewUrl}
          emptyText="Execute o pipeline para liberar o preview."
        />
      </div>

      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">Diagnósticos ITU-R BS.1770-5</p>
            <h2 className="text-2xl font-semibold text-white">Métricas do processamento</h2>
          </div>
          <Cpu className="text-primary-300" size={20} />
        </div>
        {diagnostics ? (
          <div className="grid gap-3 md:grid-cols-3">
            <DiagCard label="LUFS antes" value={formatLufs(diagnostics.original.integratedLufs)} helper="Integrated" />
            <DiagCard label="LUFS depois" value={formatLufs(diagnostics.processed.integratedLufs)} helper="Integrated" />
            <DiagCard label="True Peak" value={formatDb(diagnostics.processed.truePeakDb, ' dBTP')} helper="4x oversampling" />
            <DiagCard label="SNR" value={formatDb(diagnostics.snrImprovementDb, ' dB')} helper="Melhora" />
            <DiagCard label="Ruído reduzido" value={formatDb(diagnostics.noiseReductionDb, ' dB')} helper="Floor" />
            <DiagCard label="Tempo" value={`${diagnostics.processingTimeMs.toFixed(0)} ms`} helper="Pipeline local" />
          </div>
        ) : (
          <p className="text-sm text-white/60">Grave ou envie um áudio para gerar os diagnósticos.</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!hasProcessedAudio || isRecording || isBusy}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              !hasProcessedAudio || isRecording || isBusy
                ? 'cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
            }`}
          >
            <Download size={16} /> Baixar WAV 24-bit
          </button>
          <span className="text-xs text-white/50">
            Exportamos com dithering TPDF para 24-bit PCM e preservamos -1 dBTP.
          </span>
        </div>
      </div>

      {error && (
        <div className="glass-card flex items-center gap-3 rounded-3xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-danger-100">
          <AlertTriangle size={18} />
          <span>{error}</span>
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
    <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-white">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

type TargetCardProps = {
  label: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function TargetCard({ label, description, active, disabled, onClick }: TargetCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? 'border-primary-400/50 bg-primary-500/10 text-white shadow-lg shadow-primary-500/10'
          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{label}</h3>
        {active && (
          <span className="rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-semibold text-primary-100">Ativo</span>
        )}
      </div>
      <p className="text-sm text-white/60">{description}</p>
    </button>
  );
}

type ChainToggleCardProps = {
  stage: ChainStage;
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
};

function ChainToggleCard({ stage, active, disabled, onToggle }: ChainToggleCardProps) {
  const stageMeta = CHAIN_DEFINITION[stage];
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`flex flex-col gap-2 rounded-2xl border px-5 py-4 text-left transition ${
        active
          ? 'border-primary-400/60 bg-primary-500/10 text-white'
          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/50">
        <span>{stageMeta.badge}</span>
        {stageMeta.icon}
      </div>
      <h3 className="text-xl font-semibold text-white">{stageMeta.label}</h3>
      <p className="text-sm text-white/60">{stageMeta.description}</p>
      <span
        className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs ${
          active ? 'bg-primary-500/20 text-primary-50' : 'bg-white/10 text-white/70'
        }`}
      >
        {active ? 'Ativo' : 'Bypass'}
      </span>
    </button>
  );
}

type WavePanelProps = {
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  audioUrl: string | null;
  emptyText: string;
};

function WavePanel({ title, subtitle, badge, color, audioUrl, emptyText }: WavePanelProps) {
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

function applyAdaptiveGate(buffer: AudioBuffer, thresholdDb: number): AudioBuffer {
  const thresholdLinear = dbToLinear(thresholdDb);
  const minGain = dbToLinear(-18);
  const attack = Math.exp(-1 / (buffer.sampleRate * 0.003));
  const release = Math.exp(-1 / (buffer.sampleRate * 0.05));

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    let envelope = 0;

    for (let i = 0; i < data.length; i += 1) {
      const sample = data[i];
      const abs = Math.abs(sample);
      if (abs > envelope) {
        envelope = attack * envelope + (1 - attack) * abs;
      } else {
        envelope = release * envelope + (1 - release) * abs;
      }

      const gate = envelope < thresholdLinear
        ? Math.max((envelope / Math.max(thresholdLinear, 1e-6)), minGain)
        : 1;
      data[i] = sample * gate;
    }
  }

  return buffer;
}

async function applyToneShaping(
  buffer: AudioBuffer,
  options: { enableHighpass: boolean; enableTilt: boolean },
): Promise<AudioBuffer> {
  if (typeof window === 'undefined') {
    return buffer;
  }

  const OfflineAudioContextCtor =
    window.OfflineAudioContext ||
    (window as WebkitAudioWindow).webkitOfflineAudioContext;

  if (!OfflineAudioContextCtor) {
    return buffer;
  }

  const offline = new OfflineAudioContextCtor(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );

  const source = offline.createBufferSource();
  source.buffer = buffer;

  const chain: BiquadFilterNode[] = [];

  if (options.enableHighpass) {
    const highpass = offline.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 0.707;
    chain.push(highpass);

    const humNotch = offline.createBiquadFilter();
    humNotch.type = 'notch';
    humNotch.frequency.value = 50;
    humNotch.Q.value = 10;
    chain.push(humNotch);
  }

  if (options.enableTilt) {
    const presence = offline.createBiquadFilter();
    presence.type = 'highshelf';
    presence.frequency.value = 4_500;
    presence.gain.value = 2.5;
    chain.push(presence);

    const deEsser = offline.createBiquadFilter();
    deEsser.type = 'peaking';
    deEsser.frequency.value = 4_000;
    deEsser.Q.value = 3;
    deEsser.gain.value = -3;
    chain.push(deEsser);
  }

  let current: AudioNode = source;
  for (const node of chain) {
    current.connect(node);
    current = node;
  }
  current.connect(offline.destination);
  source.start(0);

  return offline.startRendering();
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

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};
