import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { FileAudio, Settings2, Sparkles, UploadCloud, VideoIcon, Waves } from 'lucide-react';

import { AudioLabsCta } from '@/shared/components/AudioLabsCta/AudioLabsCta';
import { Button } from '@/shared/components/ui/Button';
import { LabAlert } from '@/shared/components/ui/LabAlert';
import { LabCard } from '@/shared/components/ui/LabCard';
import { LabPageLayout } from '@/shared/components/ui/LabPageLayout';
import { classNames } from '@/shared/utils/classNames';

import {
  useVideoDubbingPipeline,
  type PipelineStep,
  type SegmentState,
} from '../../hooks/useVideoDubbingPipeline';

const languageOptions = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'es-ES', label: 'Espanhol (Espanha)' },
  { value: 'en-US', label: 'Inglês (EUA)' },
  { value: 'fr-FR', label: 'Francês' },
];

const voiceOptions = [
  { value: 'alloy', label: 'Alloy (neutro)' },
  { value: 'sol', label: 'Sol (quente)' },
  { value: 'aria', label: 'Aria (feminino)' },
  { value: 'verse', label: 'Verse (narrador leve)' },
];

export function VideoDubbingWorkbenchPage() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('pt-BR');
  const [voice, setVoice] = useState('alloy');
  const [styleHints, setStyleHints] = useState(
    'Tradução direta ➜ reflexão ➜ adaptação cultural (VideoLingo). Preserve ritmo, termos técnicos e mantenha duração original.',
  );
  const [silenceThreshold, setSilenceThreshold] = useState(-42);
  const [minSilenceMs, setMinSilenceMs] = useState(650);

  const { steps, segments, result, isRunning, error, runPipeline, reset } = useVideoDubbingPipeline();

  useEffect(() => reset, [reset]);

  const fileSummary = useMemo(() => {
    if (!file) {
      return 'Nenhum arquivo selecionado';
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return `${file.name} · ${sizeMb} MB`;
  }, [file]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    setFile(nextFile ?? null);
  };

  const handleRun = () => {
    if (!file) {
      return;
    }
    runPipeline({
      file,
      targetLanguage,
      voice,
      styleHints,
      silenceThresholdDb: silenceThreshold,
      minSilenceMs,
      minSegmentMs: 1400,
    });
  };

  const handleReset = () => {
    setFile(null);
    reset();
  };

  return (
    <LabPageLayout
      title="Video Dubbing Workbench"
      eyebrow="Debug"
      description={
        <p>
          Pipeline completo baseado na análise "Open source video dubbing with LLM integration: 2025 landscape analysis" —
          extraímos o áudio do vídeo, detectamos silêncios como o WhisperX, executamos tradução multi-pass de estilo VideoLingo e
          sintetizamos a nova voz em gpt-4o-mini-tts antes de remuxar o MP4.
        </p>
      }
      maxWidthClassName="max-w-6xl"
    >
      <AudioLabsCta current="videoDubbing" />

      <LabCard
        title={
          <div className="flex items-center gap-2">
            <UploadCloud className="text-primary-300" size={18} />
            <span>1. Anexe um vídeo</span>
          </div>
        }
        contentClassName="space-y-4"
      >
        <label className="flex w-full cursor-pointer flex-col rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-center shadow-inner transition hover:border-primary-400/70">
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={handleFileChange} />
          <span className="text-sm uppercase tracking-[0.3em] text-white/60">Video asset</span>
          <p className="mt-2 text-lg font-semibold text-white">{fileSummary}</p>
          <p className="text-xs text-white/60">MP4 com áudio AAC funciona melhor. O áudio original é preservado apenas como referência.</p>
        </label>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.3em] text-white/60">Idioma alvo</label>
            <select
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value)}
            >
              {languageOptions.map((language) => (
                <option key={language.value} value={language.value} className="bg-dark-900">
                  {language.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.3em] text-white/60">Voz (gpt-4o-mini-tts)</label>
            <select
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
            >
              {voiceOptions.map((voiceOption) => (
                <option key={voiceOption.value} value={voiceOption.value} className="bg-dark-900">
                  {voiceOption.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </LabCard>

      <LabCard
        title={
          <div className="flex items-center gap-2">
            <Waves className="text-primary-300" size={18} />
            <span>2. Ajuste o detector de silêncio</span>
          </div>
        }
        contentClassName="space-y-6"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/60">
              <span>Limiar (dB)</span>
              <span className="font-semibold text-white">{silenceThreshold} dB</span>
            </label>
            <input
              type="range"
              min={-60}
              max={-20}
              step={1}
              value={silenceThreshold}
              onChange={(event) => setSilenceThreshold(Number(event.target.value))}
              className="mt-2 w-full"
            />
            <p className="mt-2 text-xs text-white/60">
              Cortes só são criados quando o RMS fica abaixo do limiar por {minSilenceMs} ms. Isso impede cortes arbitrários e protege o ritmo.
            </p>
          </div>
          <div>
            <label className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/60">
              <span>Silêncio mínimo (ms)</span>
              <span className="font-semibold text-white">{minSilenceMs} ms</span>
            </label>
            <input
              type="range"
              min={300}
              max={1200}
              step={50}
              value={minSilenceMs}
              onChange={(event) => setMinSilenceMs(Number(event.target.value))}
              className="mt-2 w-full"
            />
            <p className="mt-2 text-xs text-white/60">Use valores maiores para vídeos com pausas longas. Nunca dividimos sem detectar silêncio.</p>
          </div>
        </div>
      </LabCard>

      <LabCard
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary-300" size={18} />
            <span>3. Tradução multi-pass</span>
          </div>
        }
        contentClassName="space-y-4"
      >
        <textarea
          className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={styleHints}
          onChange={(event) => setStyleHints(event.target.value)}
        />
        <p className="text-xs text-white/60">
          O modelo segue a arquitetura VideoLingo: tradução direta ➜ reflexão (corrige erros, timing e cultura) ➜ adaptação cultural pronta para síntese.
        </p>
      </LabCard>

      <LabCard
        title={
          <div className="flex items-center gap-2">
            <Settings2 className="text-primary-300" size={18} />
            <span>4. Orquestrar pipeline</span>
          </div>
        }
        contentClassName="space-y-4"
        actions={
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={handleReset} disabled={isRunning}>
              Limpar
            </Button>
            <Button type="button" variant="accent" onClick={handleRun} disabled={!file || isRunning} loading={isRunning}>
              Rodar pipeline
            </Button>
          </div>
        }
      >
        <p className="text-sm text-white/70">
          Demux ➜ detector de silêncio ➜ gpt-4o-mini-transcribe ➜ tradução VideoLingo ➜ gpt-4o-mini-tts ➜ FFmpeg atempo ➜ mux final.
        </p>
        <PipelineSteps steps={steps} />
        {error && <LabAlert variant="danger">{error}</LabAlert>}
      </LabCard>

      <LabCard
        title={
          <div className="flex items-center gap-2">
            <FileAudio className="text-primary-300" size={18} />
            <span>5. Segmentos gerados</span>
          </div>
        }
        contentClassName="space-y-3"
      >
        {segments.length === 0 ? (
          <p className="text-sm text-white/60">Os blocos aparecem aqui após detectar o primeiro silêncio.</p>
        ) : (
          <div className="space-y-3">
            {segments.map((segment) => (
              <SegmentRow key={segment.id} segment={segment} />
            ))}
          </div>
        )}
      </LabCard>

      <LabCard
        title={
          <div className="flex items-center gap-2">
            <VideoIcon className="text-primary-300" size={18} />
            <span>6. Pré-visualizações</span>
          </div>
        }
        contentClassName="grid gap-6 md:grid-cols-2"
      >
        <OutputPreview
          title="Áudio original"
          description="Extraído via FFmpeg"
          type="audio"
          url={result.sourceAudioUrl ?? null}
        />
        <OutputPreview
          title="Vídeo sem áudio"
          description="Referência visual"
          type="video"
          url={result.mutedVideoUrl ?? null}
        />
        <OutputPreview
          title="Nova narração"
          description="Concat + atempo"
          type="audio"
          url={result.dubbedAudioUrl ?? null}
        />
        <OutputPreview
          title="Vídeo dublado"
          description="Mux final"
          type="video"
          url={result.dubbedVideoUrl ?? null}
        />
      </LabCard>
    </LabPageLayout>
  );
}

function PipelineSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <ul className="space-y-2">
      {steps.map((step) => (
        <li key={step.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-4 py-2">
          <div>
            <p className="text-sm font-semibold text-white">{step.label}</p>
            {step.detail && <p className="text-xs text-white/60">{step.detail}</p>}
          </div>
          <StatusBadge status={step.status} />
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: PipelineStep['status'] }) {
  const labelMap: Record<PipelineStep['status'], string> = {
    pending: 'Aguardando',
    running: 'Executando',
    success: 'Concluído',
    error: 'Erro',
  };

  const colorMap: Record<PipelineStep['status'], string> = {
    pending: 'text-white/50 border-white/20',
    running: 'text-accent-200 border-accent-400/40',
    success: 'text-green-200 border-green-400/40',
    error: 'text-red-200 border-red-400/40',
  };

  return (
    <span className={classNames('rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide', colorMap[status])}>
      {labelMap[status]}
    </span>
  );
}

const segmentPhaseLabels: Record<SegmentState['phase'], string> = {
  waiting: 'Aguardando VAD',
  transcribing: 'Transcrevendo',
  translated: 'Traduzido',
  synthesizing: 'Sintetizando voz',
  ready: 'Pronto',
  error: 'Erro',
};

function SegmentRow({ segment }: { segment: SegmentState }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            Bloco {segment.index + 1} · {formatMs(segment.startMs)} – {formatMs(segment.endMs)}
          </p>
          <p className="text-xs text-white/60">{segment.durationMs.toFixed(0)} ms</p>
        </div>
        <span className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70">
          {segmentPhaseLabels[segment.phase] ?? segment.phase}
        </span>
      </div>
      {segment.transcript && (
        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Transcrição</p>
          <p className="text-sm text-white/80">{segment.transcript}</p>
        </div>
      )}
      {segment.translation && (
        <div className="mt-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Tradução final</p>
          <p className="text-sm text-primary-100">{segment.translation}</p>
          {segment.notes && segment.notes.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-white/60">
              {segment.notes.map((note, index) => (
                <li key={`${segment.id}-note-${index}`}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {segment.ttsUrl && (
        <audio controls src={segment.ttsUrl} className="mt-3 w-full" preload="metadata" />
      )}
      {segment.error && <LabAlert variant="danger">{segment.error}</LabAlert>}
    </div>
  );
}

function OutputPreview({
  title,
  description,
  url,
  type,
}: {
  title: string;
  description: string;
  url: string | null | undefined;
  type: 'audio' | 'video';
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-white/60">{description}</p>
      <div className="mt-3">
        {url ? (
          type === 'audio' ? (
            <audio controls className="w-full" src={url} preload="metadata" />
          ) : (
            <video controls className="w-full rounded-2xl" src={url} preload="metadata" />
          )
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/50">
            Aguardando geração…
          </div>
        )}
      </div>
      {url && (
        <a
          href={url}
          download
          className="mt-3 inline-flex items-center text-xs font-semibold uppercase tracking-[0.3em] text-primary-200"
        >
          Download
        </a>
      )}
    </div>
  );
}

function formatMs(value: number) {
  const seconds = Math.floor(value / 1000);
  const ms = String(value % 1000).padStart(3, '0');
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}.${ms}`;
}
