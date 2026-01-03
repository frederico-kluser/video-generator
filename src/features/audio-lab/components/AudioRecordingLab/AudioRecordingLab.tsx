import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Activity, Mic, ShieldCheck } from 'lucide-react';

import { useAntiClippingRecorder } from '@/features/audio-lab/hooks/useAntiClippingRecorder';
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
  'Captura em 48 kHz com AGC/echo desativados',
  'Input gain em 0.8 + DynamicsCompressor em modo limitador',
  'Monitoramento em tempo real do pico e da redução de ganho',
] as const;

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
  meter?: React.ReactNode;
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
  meter,
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

      {meter}

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
  const antiClippingRecorder = useAntiClippingRecorder();

  const [baselineBlob, setBaselineBlob] = useState<Blob | null>(null);
  const [proBlob, setProBlob] = useState<Blob | null>(null);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [proBusy, setProBusy] = useState(false);

  const baselineUrl = useObjectUrl(baselineBlob);
  const proUrl = useObjectUrl(proBlob);

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

  const handleProToggle = useCallback(async () => {
    if (proBusy) {
      return;
    }
    setProBusy(true);
    try {
      if (antiClippingRecorder.isRecording) {
        const blob = await antiClippingRecorder.stopRecording();
        if (blob) {
          setProBlob(blob);
        }
      } else {
        setProBlob(null);
        await antiClippingRecorder.startRecording();
      }
    } finally {
      setProBusy(false);
    }
  }, [antiClippingRecorder, proBusy]);

  const proMeter = useMemo(() => {
    const peakPercent = Math.min(antiClippingRecorder.level, 1) * 100;
    return (
      <div className="mt-4 rounded-xl border border-white/5 bg-dark-800/70 p-4">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>Pico instantâneo</span>
          <span>{peakPercent.toFixed(0)}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${antiClippingRecorder.isClipping ? 'bg-danger-500' : 'bg-primary-400'}`}
            style={{ width: `${peakPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-white/70">
          {antiClippingRecorder.isClipping
            ? '⚠️ Pico encostando em 0 dBFS (limitador segurando)'
            : 'Headroom ativo em -6 dB (0.95 de saída)'}
        </p>
        <p className="text-[11px] text-white/50">
          Redução do compressor: {antiClippingRecorder.gainReduction.toFixed(1)} dB
        </p>
      </div>
    );
  }, [antiClippingRecorder.gainReduction, antiClippingRecorder.isClipping, antiClippingRecorder.level]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12 lg:py-16">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary-300">Laboratório de Voz</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          Teste de Gravação Anti-Clipping
        </h1>
        <p className="mx-auto mt-4 max-w-3xl text-base text-white/70">
          Comparativo direto entre o fluxo atual (MediaRecorder sem processamento) e o pipeline definitivo recomendado no diagnóstico: captura em 48 kHz, headroom controlado e limitador dedicado. Bibliotecas indicadas para produção são <strong>react-media-recorder</strong> e <strong>react-audio-voice-recorder</strong>, ambas com API por hooks e manutenção ativa.
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
          title="Pipeline anti-clipping"
          badge="Técnica recomendada"
          description="Implementa o fluxo proposto: desliga processamento automático, roda limitador em -6 dB e mantém folga de headroom."
          highlights={PRO_HIGHLIGHTS}
          onToggle={handleProToggle}
          isRecording={antiClippingRecorder.isRecording}
          isBusy={proBusy}
          audioUrl={proUrl}
          statusLabel={
            antiClippingRecorder.isRecording
              ? 'Capturando em 48 kHz com limitador + monitoramento instantâneo'
              : 'Pronto para capturar com o pipeline profissional'
          }
          error={antiClippingRecorder.error}
          meter={proMeter}
          footer={<p>Saída: WebM/Opus 128 kbps vindo do stream pós-limitador (headroom 0.95).</p>}
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
