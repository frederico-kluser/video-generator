import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  AlertTriangle,
  ArrowLeft,
  Mic,
  Server,
  Sparkles,
  Square,
  Waves,
} from 'lucide-react';

import {
  createRecorderBundle,
  getAudioConstraints,
  getPreferredMimeType,
  safeStopRecorder,
  useObjectUrl,
} from '@/features/audio-lab/lib/mediaUtils';
import {
  CLEANUP_PIPELINE_PRESETS,
  type CleanupDiagnostics,
  type CleanupPreset,
  requestNoiseCleanup,
} from '@/features/audio-lab/lib/noiseSuppressionService';
import { appLogger } from '@/shared/logging/logger';

type RecorderPhase = 'idle' | 'preparing' | 'recording' | 'processing';

export function AudioCleanupLab() {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawAudio, setRawAudio] = useState<Blob | null>(null);
  const [cleanAudio, setCleanAudio] = useState<Blob | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<CleanupPreset>('sherpa-onnx');
  const [processingDiagnostics, setProcessingDiagnostics] =
    useState<CleanupDiagnostics | null>(null);

  const preferredMimeTypeRef = useRef<string | null>(null);
  const rawRecorderRef = useRef<MediaRecorder | null>(null);
  const rawCompletionRef = useRef<Promise<Blob> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    preferredMimeTypeRef.current = getPreferredMimeType();
  }, []);

  useEffect(() => {
    return () => {
      safeStopRecorder(rawRecorderRef.current);
      cleanupActiveCapture();
      uploadControllerRef.current?.abort();
    };
  }, []);

  const rawPreviewUrl = useObjectUrl(rawAudio);
  const cleanPreviewUrl = useObjectUrl(cleanAudio);
  const selectedPresetMeta = CLEANUP_PIPELINE_PRESETS[selectedPreset];

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
    setProcessingDiagnostics(null);
    setPhase('preparing');
    appLogger.info('🔧 Preparando captura do Audio Cleanup Lab.', {
      preset: selectedPreset,
    });

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

      setPhase('recording');
      appLogger.info('🎙️ Audio Cleanup Lab gravando amostra.', {
        preset: selectedPreset,
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
    appLogger.info('🧾 Finalizando captura para enviar ao backend.', {
      preset: selectedPreset,
    });

    try {
      const rawPromise = rawCompletionRef.current?.catch((error) => {
        appLogger.error('💥 Erro ao finalizar áudio bruto.', { error });
        return null as Blob | null;
      });

      safeStopRecorder(rawRecorderRef.current);

      const rawBlob = await (rawPromise ?? Promise.resolve<Blob | null>(null));

      if (!rawBlob) {
        throw new Error('Captura vazia. Nenhum áudio bruto encontrado.');
      }

      setRawAudio(rawBlob);
      await processWithBackend(rawBlob, selectedPreset);
      setPhase('idle');
      appLogger.info('✅ Audio Cleanup Lab finalizado com pipeline remoto.', {
        preset: selectedPreset,
      });
    } catch (error) {
      setErrorMessage(
        'Algo deu errado ao enviar a amostra para o backend de limpeza. Tente novamente.',
      );
      setPhase('idle');
      appLogger.error('💥 Erro inesperado ao finalizar o Audio Cleanup Lab.', {
        error,
      });
    } finally {
      cleanupActiveCapture();
      rawRecorderRef.current = null;
      rawCompletionRef.current = null;
    }
  };

  const processWithBackend = async (blob: Blob, preset: CleanupPreset) => {
    uploadControllerRef.current?.abort();
    setCleanAudio(null);
    setProcessingDiagnostics(null);

    const controller = new AbortController();
    uploadControllerRef.current = controller;

    try {
      const { blob: cleanedBlob, diagnostics } = await requestNoiseCleanup(
        blob,
        {
          preset,
          signal: controller.signal,
        },
      );

      setCleanAudio(cleanedBlob);
      setProcessingDiagnostics(diagnostics);
      appLogger.info('🧼 Pipeline remoto retornou o áudio limpo.', diagnostics);
    } catch (error) {
      appLogger.error('💥 Falha ao processar áudio no backend.', { error });
      throw error;
    } finally {
      uploadControllerRef.current = null;
    }
  };

  const cleanupActiveCapture = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const isBusy = phase === 'preparing' || phase === 'processing';
  const recorderCta =
    phase === 'recording' ? 'Parar e analisar' : 'Gravar amostra';
  const recorderStatusMessage =
    phase === 'recording'
      ? 'Gravando… descreva um trecho curto.'
      : phase === 'preparing'
        ? 'Preparando captura do microfone...'
        : phase === 'processing'
          ? `Enviando para ${selectedPresetMeta.label}…`
          : 'Pressione para iniciar uma nova amostra.';
  const pipelineStatus = (() => {
    if (phase === 'preparing') {
      return 'Inicializando captura';
    }
    if (phase === 'processing') {
      return `Pipeline remoto (${selectedPresetMeta.badge}) em execução`;
    }
    if (processingDiagnostics) {
      const time =
        typeof processingDiagnostics.processingTimeMs === 'number'
          ? `${(processingDiagnostics.processingTimeMs / 1000).toFixed(2)} s`
          : 'tempo não informado';
      return `${processingDiagnostics.backendLabel} · ${time}`;
    }
    return 'Pipeline aguardando amostra';
  })();
  const treatedSubtitle = processingDiagnostics
    ? [
        processingDiagnostics.backendLabel,
        typeof processingDiagnostics.snrImprovementDb === 'number'
          ? `+${processingDiagnostics.snrImprovementDb.toFixed(1)} dB SNR`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Pipeline remoto aguardando upload';
  const treatedEmptyDescription =
    phase === 'processing'
      ? 'Processamento remoto em andamento...'
      : 'Após parar a gravação, o áudio tratado aparece aqui.';
  const hasRecordedSample = Boolean(rawAudio && rawAudio.size > 0);
  const canChangePreset = phase === 'idle';
  const handlePresetChange = (preset: CleanupPreset) => {
    if (!canChangePreset) {
      return;
    }
    setSelectedPreset(preset);
    if (hasRecordedSample) {
      void reprocessExistingCapture(preset);
    }
  };

  const reprocessExistingCapture = async (preset: CleanupPreset) => {
    if (!hasRecordedSample || !rawAudio) {
      return;
    }

    setPhase('processing');
    setErrorMessage(null);
    appLogger.info('♻️ Reprocessando captura com novo preset.', {
      preset,
    });

    try {
      await processWithBackend(rawAudio, preset);
      appLogger.info('✅ Reprocessamento concluído com sucesso.', { preset });
    } catch (error) {
      setErrorMessage(
        'Não foi possível reprocessar a amostra neste preset. Tente novamente.',
      );
      appLogger.error(
        '💥 Falha ao reprocessar o áudio com preset alternativo.',
        {
          error,
          preset,
        },
      );
    } finally {
      setPhase('idle');
    }
  };

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
          Grave uma amostra de voz, faça o upload automático para o backend
          (sherpa-onnx GTCRN + FFmpeg arnndn + DeepFilterNet) e compare o áudio
          original com o resultado neurally limpo. Ideal para validar microfones
          antes de gravar o roteiro completo.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          <div className="rounded-full border border-white/10 px-3 py-1">
            48 kHz mono
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1">
            Sherpa-ONNX GTCRN
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1">
            FFmpeg arnndn (lq.rnnn)
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1">
            DeepFilterNet ready
          </div>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-primary-300 transition hover:text-primary-200"
        >
          <ArrowLeft size={16} /> Voltar para o fluxo principal
        </a>
      </div>

      <PipelinePresetSelector
        value={selectedPreset}
        onChange={handlePresetChange}
        disabled={!canChangePreset}
      />

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
          subtitle={treatedSubtitle}
          badge="Depois"
          color="from-success-500/40 to-success-600/30"
          audioUrl={cleanPreviewUrl}
          emptyHeadline="Aguardando processamento"
          emptyDescription={treatedEmptyDescription}
        />
      </div>

      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">
              Controle
            </p>
            <p className="text-lg font-semibold text-white">
              {recorderStatusMessage}
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

        <div className="grid gap-4 md:grid-cols-4">
          <StatusBadge
            icon={<Waves size={16} />}
            label="Pipeline"
            value={pipelineStatus}
          />
          <StatusBadge
            icon={<Sparkles size={16} />}
            label="Estado"
            value={
              phase === 'recording'
                ? 'Gravando'
                : phase === 'processing'
                  ? 'Processando'
                  : phase === 'preparing'
                    ? 'Preparando'
                    : 'Pronto'
            }
          />
          <StatusBadge
            icon={<Mic size={16} />}
            label="Compatibilidade"
            value={supportsRecording ? 'Tudo certo' : 'Microfone indisponível'}
          />
          <StatusBadge
            icon={<Server size={16} />}
            label="Preset"
            value={selectedPresetMeta.label}
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

type PipelinePresetSelectorProps = {
  value: CleanupPreset;
  onChange: (preset: CleanupPreset) => void;
  disabled?: boolean;
};

function PipelinePresetSelector({
  value,
  onChange,
  disabled,
}: PipelinePresetSelectorProps) {
  return (
    <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">
          Pipelines server-side
        </p>
        <h2 className="text-2xl font-semibold text-white">
          Escolha o modelo de limpeza
        </h2>
        <p className="text-sm text-white/70">
          Sherpa-ONNX GTCRN, FFmpeg arnndn (lq.rnnn) e DeepFilterNet rodando no
          backend Node.js. Alterne conforme o ruído capturado.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(CLEANUP_PIPELINE_PRESETS).map(([key, preset]) => {
          const presetId = key as CleanupPreset;
          const isActive = presetId === value;
          return (
            <button
              key={presetId}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled || isActive) {
                  return;
                }
                onChange(presetId);
              }}
              className={`group flex flex-col rounded-2xl border px-5 py-4 text-left transition ${
                isActive
                  ? 'border-primary-400/70 bg-primary-500/10 shadow-lg shadow-primary-500/20'
                  : 'border-white/10 bg-white/5 hover:border-white/30 hover:-translate-y-0.5'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/50">
                <span>{preset.badge}</span>
                {isActive && (
                  <span className="rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-semibold text-primary-100">
                    Ativo
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">
                {preset.label}
              </h3>
              <p className="text-sm text-white/70">{preset.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
