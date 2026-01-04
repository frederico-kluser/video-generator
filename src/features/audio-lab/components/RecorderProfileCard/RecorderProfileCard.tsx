import { AlertCircle, Mic, RotateCcw, Square, Waves } from 'lucide-react';

import type { RecorderProfileDefinition } from '../../constants/recorderProfiles';
import type { RecorderState } from '../../hooks/useRecorderLab';

type RecorderProfileCardProps = {
  profile: RecorderProfileDefinition;
  state: RecorderState;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onReset: () => void;
};

const STATUS_LABEL: Record<RecorderState['status'], string> = {
  idle: 'Pronto para gravar',
  initializing: 'Inicializando microfone…',
  recording: 'Gravando',
  processing: 'Processando áudio…',
  error: 'Erro na gravação',
};

export function RecorderProfileCard({ profile, state, onStart, onStop, onReset }: RecorderProfileCardProps) {
  const isRecording = state.status === 'recording';
  const isInitializing = state.status === 'initializing';
  const canStop = state.status === 'recording';
  const canStart = state.status === 'idle' || state.status === 'error';
  const canReset = Boolean(state.blobUrl) && !isRecording && !isInitializing;
  const meterWidth = `${Math.min(100, Math.round((state.meterLevel ?? 0) * 100))}%`;
  const durationLabel = state.durationMs ? `${(state.durationMs / 1000).toFixed(1)}s` : '—';

  return (
    <article className="glass-card flex flex-col gap-4 rounded-2xl p-4 text-white shadow-xl transition hover:shadow-2xl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">{profile.formatLabel} · {profile.codecLabel}</p>
          <h2 className="text-xl font-semibold">{profile.title}</h2>
          <p className="text-sm text-white/70">{profile.description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Status</p>
          <p className="text-sm font-semibold text-primary-200">{STATUS_LABEL[state.status]}</p>
        </div>
      </header>

      <section className="flex flex-wrap gap-2">
        {profile.technologies.map((tech) => (
          <span
            key={tech}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
          >
            {tech}
          </span>
        ))}
      </section>

      <p className="text-sm text-white/70">{profile.goal}</p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            void onStart();
          }}
          disabled={!canStart}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            canStart
              ? 'bg-gradient-to-r from-danger-500 to-danger-600 text-white shadow-lg hover:scale-[1.01]'
              : 'bg-white/10 text-white/50'
          }`}
        >
          <Mic size={16} />
          Gravar
        </button>
        <button
          type="button"
          onClick={() => {
            void onStop();
          }}
          disabled={!canStop}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            canStop ? 'bg-white text-dark-900' : 'bg-white/10 text-white/40'
          }`}
        >
          <Square size={14} />
          Parar
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
            canReset ? 'border-white/30 text-white hover:bg-white/10' : 'border-white/5 text-white/30'
          }`}
        >
          <RotateCcw size={14} />
          Resetar
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-white/60">
          <span>Nível de entrada</span>
          <span>{Math.round((state.meterLevel ?? 0) * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-primary-400 to-accent-400" style={{ width: meterWidth }} />
        </div>
      </div>

      {typeof state.silenceMs === 'number' && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-100/5 p-3 text-xs text-amber-100">
          <div className="flex items-center gap-2 font-semibold uppercase tracking-wide">
            <Waves size={14} />
            VAD nativa
          </div>
          <p className="mt-1 text-base font-semibold text-white">
            {state.isSpeechDetected ? 'Voz detectada' : 'Silêncio de voz'} · {Math.round(state.silenceMs / 100) / 10}s
          </p>
          {state.autoStopReason && <p className="text-xs text-white/70">{state.autoStopReason}</p>}
        </div>
      )}

      {state.error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger-500/30 bg-danger-500/10 p-3 text-sm text-danger-100">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-dark-900/70 p-3">
        <p className="text-xs uppercase tracking-wide text-white/50">Preview</p>
        {state.blobUrl ? (
          <div className="mt-2 space-y-2">
            <audio
              controls
              src={state.blobUrl}
              className="w-full"
              aria-label={`Prévia gravada para ${profile.title}`}
            >
              <track
                kind="captions"
                label="Transcrição automática"
                srcLang="pt-BR"
                src="data:text/vtt,WEBVTT"
                default
              />
            </audio>
            <p className="text-sm text-white/70">
              Duração: {durationLabel} · Formato: {profile.formatLabel}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/50">Grave algo para comparar com as demais versões.</p>
        )}
      </div>
    </article>
  );
}
