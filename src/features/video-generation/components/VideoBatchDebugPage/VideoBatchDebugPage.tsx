import { useMemo, useRef, useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Minus,
  Play,
  Plus,
  Video as VideoIcon,
} from 'lucide-react';

import { Spinner } from '@/shared/components/ui/Spinner';

import type { AspectRatio } from '@/config/constants/video';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_CONFIG,
} from '@/config/constants/video';
import {
  MANIM_API_BASE_URL,
  MANIM_RESOLUTION_BY_ASPECT_RATIO,
} from '@/config/constants/manim';
import { VoiceInputButton } from '@/shared/components/VoiceInput/VoiceInputButton';
import { appLogger } from '@/shared/logging/logger';
import { uuidv4 } from '@/shared/utils/uuid';
import { readVideoDurationMs } from '@/shared/utils/media';

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

async function requestManimVideo(prompt: string, aspectRatio: AspectRatio) {
  const resolution =
    MANIM_RESOLUTION_BY_ASPECT_RATIO[aspectRatio] ??
    MANIM_RESOLUTION_BY_ASPECT_RATIO['16:9'];

  const response = await fetch(`${MANIM_API_BASE_URL}/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: prompt,
      width: resolution.width,
      height: resolution.height,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Falha (${response.status}) ao chamar Manim API: ${
        errorBody || 'sem detalhes'
      }`,
    );
  }

  const payload = (await response.json()) as {
    success: boolean;
    video_base64?: string;
    scene_name?: string;
    error?: string;
  };

  if (!payload.success || !payload.video_base64) {
    throw new Error(payload.error || 'Resposta inválida da Manim API.');
  }

  const blob = base64ToBlob(payload.video_base64, 'video/mp4');
  const fileName = `${payload.scene_name ?? 'debug-scene'}.mp4`;
  const file = new File([blob], fileName, { type: 'video/mp4' });
  const previewUrl = URL.createObjectURL(file);
  const durationMs = await readVideoDurationMs(previewUrl);

  return { previewUrl, durationMs, fileName };
}

type PromptRun = {
  id: string;
  prompt: string;
  status: 'idle' | 'running' | 'success' | 'error';
  error?: string;
  previewUrl?: string;
  durationMs?: number;
  fileName?: string;
};

const createPromptRun = (): PromptRun => ({
  id: uuidv4(),
  prompt: '',
  status: 'idle',
});

export function VideoBatchDebugPage() {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    VIDEO_CONFIG.DEFAULT_ASPECT_RATIO,
  );
  const [runs, setRuns] = useState<PromptRun[]>(() => [createPromptRun()]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const runsRef = useRef(runs);

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  useEffect(() => {
    return () => {
      runsRef.current.forEach((run) => {
        if (run.previewUrl) {
          URL.revokeObjectURL(run.previewUrl);
        }
      });
    };
  }, []);

  const completedCount = runs.filter((run) => run.status === 'success').length;
  const runningCount = runs.filter((run) => run.status === 'running').length;

  const aspectRatioOptions = useMemo(() => {
    return VIDEO_ASPECT_RATIOS.map((ratio) => ({
      value: ratio,
      label: ratio,
    }));
  }, []);

  const setRun = (id: string, updater: (prev: PromptRun) => PromptRun) => {
    setRuns((prev) =>
      prev.map((run) => {
        if (run.id !== id) {
          return run;
        }
        const next = updater(run);
        if (run.previewUrl && run.previewUrl !== next.previewUrl) {
          URL.revokeObjectURL(run.previewUrl);
        }
        return next;
      }),
    );
  };

  const handlePromptChange = (id: string, prompt: string) => {
    setRun(id, (run) => ({
      ...run,
      prompt,
      status: 'idle',
      error: undefined,
      previewUrl: run.status === 'success' ? undefined : run.previewUrl,
      durationMs: run.status === 'success' ? undefined : run.durationMs,
      fileName: run.status === 'success' ? undefined : run.fileName,
    }));
  };

  const handlePromptDictation = (id: string, transcript: string) => {
    const cleaned = transcript.trim();
    if (!cleaned) {
      return;
    }
    setRun(id, (run) => ({
      ...run,
      prompt: run.prompt ? `${run.prompt}\n${cleaned}` : cleaned,
      status: 'idle',
      error: undefined,
    }));
  };

  const addPrompt = () => {
    setRuns((prev) => [...prev, createPromptRun()]);
  };

  const removePrompt = (id: string) => {
    setRuns((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      const target = prev.find((run) => run.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((run) => run.id !== id);
    });
  };

  const clearAllPreviews = () => {
    setRuns((prev) => {
      prev.forEach((run) => {
        if (run.previewUrl) {
          URL.revokeObjectURL(run.previewUrl);
        }
      });
      return prev.map((run) => ({
        ...run,
        status: 'idle',
        error: undefined,
        previewUrl: undefined,
        durationMs: undefined,
        fileName: undefined,
      }));
    });
  };

  const executeAll = async () => {
    setBatchError(null);
    const trimmedRuns = runs.map((run) => ({
      ...run,
      prompt: run.prompt.trim(),
    }));

    if (trimmedRuns.every((run) => run.prompt.length === 0)) {
      setBatchError('Adicione pelo menos um prompt válido antes de executar.');
      return;
    }

    setRuns((prev) =>
      prev.map((run) => {
        if (run.prompt.trim().length === 0) {
          return {
            ...run,
            status: 'error',
            error: 'Informe um prompt válido.',
            previewUrl: undefined,
            durationMs: undefined,
            fileName: undefined,
          };
        }
        return {
          ...run,
          status: 'running',
          error: undefined,
        };
      }),
    );

    setIsExecuting(true);

    await Promise.all(
      trimmedRuns
        .filter((run) => run.prompt.length > 0)
        .map(async (run) => {
          try {
            const result = await requestManimVideo(run.prompt, aspectRatio);
            setRun(run.id, (current) => ({
              ...current,
              status: 'success',
              previewUrl: result.previewUrl,
              durationMs: result.durationMs,
              fileName: result.fileName,
            }));
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Erro desconhecido';
            appLogger.error('🎯 Falha ao testar prompt debug.', {
              message,
            });
            setRun(run.id, (current) => ({
              ...current,
              status: 'error',
              error: message,
              previewUrl: undefined,
              durationMs: undefined,
              fileName: undefined,
            }));
          }
        }),
    );

    setIsExecuting(false);
  };

  const goBack = () => {
    window.location.assign('/?debug=1');
  };

  return (
    <div className="min-h-screen w-full bg-dark-950/95 px-3 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary-300/70">
                Debug Mode
              </p>
              <h1 className="text-2xl font-bold sm:text-3xl">
                Teste paralelo de geração de vídeos
              </h1>
              <p className="text-sm text-white/70">
                Dispare múltiplas descrições simultaneamente contra a API 3Blue1Brown
                para validar throughput e latência.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goBack}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <ArrowLeft size={16} /> Voltar para o fluxo
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-white/70">
            <span className="rounded-full bg-white/10 px-3 py-1">
              Rodando: {runningCount}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1">
              Sucesso: {completedCount}
            </span>
            <label className="inline-flex items-center gap-2 text-sm text-white/80">
              Formato:
              <select
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value as AspectRatio)}
                className="input h-8 w-fit border-white/20 bg-dark-900/80 px-2 text-sm"
              >
                {aspectRatioOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-white/60">
              Resolução alvo: {MANIM_RESOLUTION_BY_ASPECT_RATIO[aspectRatio]?.width}×
              {MANIM_RESOLUTION_BY_ASPECT_RATIO[aspectRatio]?.height}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addPrompt}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} /> Adicionar prompt
          </button>
          <button
            type="button"
            onClick={() => runs.length > 1 && removePrompt(runs[runs.length - 1].id)}
            className="btn-secondary inline-flex items-center gap-2"
            disabled={runs.length === 1}
          >
            <Minus size={16} /> Remover último
          </button>
          <button
            type="button"
            onClick={clearAllPreviews}
            className="btn-ghost inline-flex items-center gap-2 text-white/80"
            disabled={runs.every((run) => !run.previewUrl && !run.error)}
          >
            Limpar resultados
          </button>
          <button
            type="button"
            onClick={() => void executeAll()}
            disabled={isExecuting}
            className="btn-accent inline-flex items-center gap-2"
          >
            {isExecuting ? (
              <>
                <Spinner size="sm" className="text-white mr-2" aria-hidden /> Disparando...
              </>
            ) : (
              <>
                <Play size={16} /> Rodar tudo simultaneamente
              </>
            )}
          </button>
          <span className="text-xs text-white/50">
            Todas as requisições são disparadas via Promise.all para stress test.
          </span>
        </div>

        {batchError && (
          <div className="flex items-center gap-2 rounded-xl border border-danger-500/30 bg-danger-500/10 p-3 text-danger-200">
            <AlertTriangle size={16} />
            <span className="text-sm">{batchError}</span>
          </div>
        )}

        <div className="space-y-4">
          {runs.map((run, index) => (
            <div
              key={run.id}
              className="glass-card space-y-3 border border-white/10 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/50">
                    Prompt #{index + 1}
                  </p>
                  <p className="text-sm text-white/70">
                    {run.status === 'success'
                      ? 'Render finalizado'
                      : run.status === 'running'
                        ? 'Enviando para API...'
                        : 'Em aberto'}
                  </p>
                </div>
                {runs.length > 1 && (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => removePrompt(run.id)}
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="flex items-start gap-2">
                <textarea
                  value={run.prompt}
                  onChange={(event) => handlePromptChange(run.id, event.target.value)}
                  placeholder="Descreva a cena Manim a ser testada..."
                  className="input min-h-[120px] w-full resize-y"
                />
                <VoiceInputButton
                  size="sm"
                  ariaLabel="Ditado para prompt de teste"
                  onTranscription={(text) => handlePromptDictation(run.id, text)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                <span
                  className={`rounded-full px-3 py-1 font-semibold ${
                    run.status === 'success'
                      ? 'bg-success-500/20 text-success-300'
                      : run.status === 'error'
                        ? 'bg-danger-500/20 text-danger-200'
                        : run.status === 'running'
                          ? 'bg-primary-500/20 text-primary-200'
                          : 'bg-white/10 text-white/60'
                  }`}
                >
                  {run.status === 'success'
                    ? 'Sucesso'
                    : run.status === 'error'
                      ? 'Erro'
                      : run.status === 'running'
                        ? 'Rodando'
                        : 'Pronto'}
                </span>
                {run.durationMs && (
                  <span>
                    Duração: {(run.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {run.fileName && <span>Arquivo: {run.fileName}</span>}
                {run.status === 'success' && run.previewUrl && (
                  <a
                    href={run.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary-300 hover:text-primary-100"
                  >
                    <VideoIcon size={14} /> Abrir em nova aba
                  </a>
                )}
              </div>
              {run.error && (
                <p className="rounded-lg border border-danger-500/30 bg-danger-500/10 p-2 text-sm text-danger-100">
                  {run.error}
                </p>
              )}
              {run.previewUrl && (
                <video
                  key={run.previewUrl}
                  src={run.previewUrl}
                  className="w-full rounded-xl border border-white/10"
                  controls
                  loop
                  muted
                  playsInline
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
