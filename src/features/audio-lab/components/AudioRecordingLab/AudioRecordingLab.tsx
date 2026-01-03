import { type ReactNode, useCallback, useState } from 'react';
import { Activity, Mic, ShieldCheck } from 'lucide-react';
import {
  type StatusMessages,
  RecorderErrors,
  useReactMediaRecorder,
} from 'react-media-recorder';

import { useObjectUrl } from '@/features/audio-lab/lib/mediaUtils';
import { useVoiceRecorder } from '@/shared/hooks/useVoiceRecorder';

const DIAGNOSTIC_INSIGHTS = [
  {
    title: 'Clipping digital',
    description:
      'Surge quando o sinal excede ±1.0 no domínio float da Web Audio API, achatando os picos e distorcendo a fala.',
    icon: Mic,
  },
  {
    title: 'Processamento automático',
    description:
      'AGC, echo cancellation e resamplers do navegador alteram o ganho e derrubam a taxa para 32 kHz/16 kHz, dificultando controle manual.',
    icon: Activity,
  },
  {
    title: 'Pipeline recomendado',
    description:
      'Captura em 48 kHz + limitador (ratio 20:1, threshold -6 dB) + headroom em 0.95 mantém folga de 3-6 dB e evita clipping.',
    icon: ShieldCheck,
  },
] as const;

const BASELINE_HIGHLIGHTS = [
  'MediaRecorder direto com sample rate idealizado em 16 kHz',
  'AGC e noiseSuppression do navegador ainda ativos',
  'Sem nó de compressor/limitador dedicado',
] as const;

const PRO_HIGHLIGHTS = [
  'Hook useReactMediaRecorder com constraints 48 kHz e AGC desligado',
  'Fallback extendable-media-recorder garante encoder Opus/WAV',
  'Bitrate travado em 128 kbps com blob WebM pronto para upload',
] as const;

const STATUS_COPY: Partial<Record<StatusMessages, string>> = {
  idle: 'Aguardando para iniciar a captura com react-media-recorder.',
  acquiring_media: 'Solicitando microfone com constraints profissionais (48 kHz).',
  delayed_start: 'Aguardando o MediaRecorder inicializar o encoder extendable.',
  recording: 'Gravando WebM/Opus com AGC/echo desligados (react-media-recorder).',
  stopping: 'Finalizando chunks e montando blob via react-media-recorder.',
  stopped: 'Blob WebM pronto para download/envio.',
  permission_denied: 'Permissão negada pelo navegador.',
  media_in_use: 'Outro app está usando o microfone no momento.',
  no_specified_media_found: 'Nenhum dispositivo compatível retornado com as constraints 48 kHz.',
  invalid_media_constraints: 'O dispositivo não suporta as constraints solicitadas.',
  recorder_error: 'Falha interna do MediaRecorder/encoder.',
  media_aborted: 'Navegador abortou a captura.',
  paused: 'Captura pausada pela API.',
};

const RECOMMENDED_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: 48_000,
};

type RecorderCardProps = {
  title: string;
  badge: string;
  description: string;
  highlights: readonly string[];
  onToggle: () => void;
  isRecording: boolean;
  isBusy: boolean;
  audioUrl: string | null;
  statusLabel: string;
  error: string | null;
  footer?: React.ReactNode;
};

function RecorderCard({
  title,
  badge,
  description,
  highlights,
  onToggle,
  isRecording,
  isBusy,
  audioUrl,
  statusLabel,
  error,
  footer,
}: RecorderCardProps) {
  return (
    <div className="glass-card flex h-full flex-col rounded-2xl border border-white/5 bg-dark-900/70 p-5 shadow-2xl shadow-black/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white/60">{badge}</p>
          <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
          <p className="mt-2 text-sm text-white/70">{description}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-white/70">
        {highlights.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 space-y-2 text-sm text-white/70">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Status</p>
        <p className="text-base font-medium text-white">{statusLabel}</p>
        {error && (
          <p className="text-sm text-danger-400">{error}</p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onToggle()}
          disabled={isBusy}
          className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-900 disabled:cursor-not-allowed disabled:opacity-50 ${
            isRecording
              ? 'bg-white text-dark-900'
              : 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/30'
          }`}
        >
          {isRecording ? 'Parar captura' : 'Gravar amostra'}
        </button>

        {audioUrl && (
          <audio controls src={audioUrl} className="w-full rounded-lg bg-dark-800/80" />
        )}
      </div>

      {footer && <div className="mt-4 border-t border-white/5 pt-4 text-sm text-white/70">{footer}</div>}
    </div>
  );
}

export function AudioRecordingLab() {
  const voiceRecorder = useVoiceRecorder();
  const {
    status: recommendedStatus,
    startRecording: startRecommendedRecording,
    stopRecording: stopRecommendedRecording,
    mediaBlobUrl: recommendedBlobUrl,
    error: recommendedErrorRaw,
    clearBlobUrl: clearRecommendedBlobUrl,
  } = useReactMediaRecorder({
    audio: RECOMMENDED_CONSTRAINTS,
    blobPropertyBag: { type: 'audio/webm;codecs=opus' },
    mediaRecorderOptions: {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128_000,
    },
    askPermissionOnMount: true,
  });

  const [baselineBlob, setBaselineBlob] = useState<Blob | null>(null);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [recommendedBusy, setRecommendedBusy] = useState(false);

  const baselineUrl = useObjectUrl(baselineBlob);
  const professionalUrl = recommendedBlobUrl ?? null;

  const normalizedRecommendedError =
    recommendedErrorRaw && recommendedErrorRaw !== RecorderErrors.NONE
      ? recommendedErrorRaw
      : null;

  const recommendedStatusLabel =
    recommendedStatus === 'recording'
      ? 'react-media-recorder capturando WebM/Opus em 48 kHz (AGC/echo OFF)'
      : STATUS_COPY[recommendedStatus] ?? 'Pronto para iniciar a captura profissional.';

  const handleBaselineToggle = useCallback(async () => {
    if (baselineBusy) {
      return;
    }
    setBaselineBusy(true);
    try {
      if (voiceRecorder.isRecording) {
        const blob = await voiceRecorder.stopRecording();
        if (blob) {
          setBaselineBlob(blob);
        }
      } else {
        setBaselineBlob(null);
        await voiceRecorder.startRecording();
      }
    } finally {
      setBaselineBusy(false);
    }
  }, [baselineBusy, voiceRecorder]);

  const handleRecommendedToggle = useCallback(() => {
    if (recommendedBusy) {
      return;
    }
    setRecommendedBusy(true);
    try {
      if (recommendedStatus === 'recording') {
        stopRecommendedRecording();
      } else {
        clearRecommendedBlobUrl();
        startRecommendedRecording();
      }
    } finally {
      setRecommendedBusy(false);
    }
  }, [clearRecommendedBlobUrl, recommendedBusy, recommendedStatus, startRecommendedRecording, stopRecommendedRecording]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12 lg:py-16">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary-300">Laboratório de Voz</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          Teste de Gravação Anti-Clipping
        </h1>
        <p className="mx-auto mt-4 max-w-3xl text-base text-white/70">
          Comparativo direto entre o fluxo atual (MediaRecorder sem processamento) e a instalação oficial da <strong>react-media-recorder</strong> configurada com constraints profissionais (48 kHz, AGC/echo OFF) e fallback <strong>extendable-media-recorder</strong> para encoder Opus/WAV.
        </p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <RecorderCard
          title="Fluxo atual"
          badge="Baseline"
          description="Reprodução fiel do que usamos hoje no fluxo de geração de vídeos. Ideal para comparar níveis de ruído e clipping."
          highlights={BASELINE_HIGHLIGHTS}
          onToggle={handleBaselineToggle}
          isRecording={voiceRecorder.isRecording}
          isBusy={baselineBusy}
          audioUrl={baselineUrl}
          statusLabel={
            voiceRecorder.isRecording
              ? 'Gravando com sample rate 16 kHz (AGC/NS ativos)'
              : 'Pronto para capturar com MediaRecorder padrão'
          }
          error={voiceRecorder.error}
          footer={<p>Saída: WebM/Opus (bitrate definido pelo navegador, sem proteção de pico).</p>}
        />

        <RecorderCard
          title="react-media-recorder Pro"
          badge="Biblioteca recomendada"
          description="Hook oficial v1.7.2 com extendable-media-recorder/wav-encoder já instalados, garantindo encoder Opus e constraints anti-clipping."
          highlights={PRO_HIGHLIGHTS}
          onToggle={handleRecommendedToggle}
          isRecording={recommendedStatus === 'recording'}
          isBusy={recommendedBusy}
          audioUrl={professionalUrl}
          statusLabel={recommendedStatusLabel}
          error={normalizedRecommendedError}
          footer={<p>Saída: WebM/Opus 128 kbps (blob gerado direto pela react-media-recorder / extendable-media-recorder).</p>}
        />
      </div>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {DIAGNOSTIC_INSIGHTS.map(({ title, description, icon: Icon }) => (
          <div
            key={title}
            className="rounded-2xl border border-white/5 bg-dark-900/60 p-4 shadow-inner shadow-black/40"
          >
            <div className="flex items-center gap-2 text-primary-300">
              <Icon size={18} />
              <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
            </div>
            <p className="mt-2 text-sm text-white/70">{description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
