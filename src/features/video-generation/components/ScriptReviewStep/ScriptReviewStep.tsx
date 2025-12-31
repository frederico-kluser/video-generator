import { useMemo, useState } from 'react';

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  LayoutList,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';

import type {
  ProjectData,
  Slide,
} from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';

type ScriptReviewStepProps = {
  slides: Slide[];
  projectData: Partial<ProjectData>;
  onSlideChange: (id: string, updates: Partial<Slide>) => void;
  onInsertSlideAfter: (index: number) => void;
  onRemoveSlide: (id: string) => void;
  onMoveSlide: (id: string, direction: 'up' | 'down') => void;
  onAddSlide: () => void;
  onApplyInstructions: (instructions: string) => Promise<void>;
  onContinue: () => Promise<void>;
};

export function ScriptReviewStep({
  slides,
  projectData,
  onSlideChange,
  onInsertSlideAfter,
  onRemoveSlide,
  onMoveSlide,
  onAddSlide,
  onApplyInstructions,
  onContinue,
}: ScriptReviewStepProps) {
  const [instructions, setInstructions] = useState('');
  const orderedSlides = useMemo(
    () => [...slides].sort((a, b) => a.order - b.order),
    [slides],
  );

  const handleApplyInstructions = async () => {
    if (!instructions.trim()) {
      return;
    }

    try {
      await onApplyInstructions(instructions.trim());
    } catch (error) {
      appLogger.error('💥 Não foi possível refinar o roteiro.', { error });
      window.alert(
        'Falha ao refinar o roteiro. Verifique o console para detalhes.',
      );
    }
  };

  const handleContinue = async () => {
    try {
      await onContinue();
    } catch (error) {
      appLogger.error('💥 Não foi possível gerar os visuais.', { error });
      window.alert(
        'Falha ao iniciar a geração de imagens. Ajuste o roteiro e tente novamente.',
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-950 via-dark-900 to-dark-950 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-dark-700/60 bg-dark-900/80 p-8 shadow-2xl shadow-primary-500/5">
          <div className="flex items-center gap-3 text-primary-300">
            <Sparkles className="h-5 w-5 animate-pulse" />
            <span className="text-sm font-semibold uppercase tracking-[0.25em]">
              Revisão do roteiro
            </span>
          </div>
          <h1 className="text-3xl font-semibold text-white">
            Ajuste o conteúdo antes de gerar qualquer imagem
          </h1>
          <p className="text-base text-white/70">
            Cada slide pode ser editado, reordenado ou removido livremente.
            Adicione novos blocos caso precise de mais contexto e só avance para
            a etapa visual quando o fluxo estiver perfeito.
          </p>
          <div className="flex flex-wrap gap-4">
            <InfoBadge label="Tópico" value={projectData.topic ?? '—'} />
            <InfoBadge
              label="Público"
              value={projectData.targetAudience ?? '—'}
            />
            <InfoBadge
              label="Aspect Ratio"
              value={projectData.aspectRatio ?? '—'}
            />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4 rounded-3xl border border-dark-800/60 bg-dark-900/70 p-6 shadow-xl shadow-black/40">
            {orderedSlides.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-white/60">
                <LayoutList className="h-12 w-12" />
                <p>Adicione pelo menos um slide para continuar.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onAddSlide}
                >
                  <Plus className="h-4 w-4" /> Criar slide
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {orderedSlides.map((slide, index) => (
                  <article
                    key={slide.id}
                    className="rounded-2xl border border-dark-700/70 bg-dark-950/60 p-5"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                          Slide {index + 1}
                        </p>
                        <h2 className="text-lg font-semibold text-white">
                          Conteúdo e narração
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onMoveSlide(slide.id, 'up')}
                          disabled={index === 0}
                          className="btn-icon bg-dark-800/80 text-white"
                          title="Mover para cima"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveSlide(slide.id, 'down')}
                          disabled={index === orderedSlides.length - 1}
                          className="btn-icon bg-dark-800/80 text-white"
                          title="Mover para baixo"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveSlide(slide.id)}
                          className="btn-icon bg-danger-500/10 text-danger-300"
                          title="Remover slide"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <label className="mb-2 block text-sm font-semibold text-white/80">
                      Texto orientativo
                    </label>
                    <textarea
                      value={slide.scriptText}
                      onChange={(event) =>
                        onSlideChange(slide.id, {
                          scriptText: event.target.value,
                        })
                      }
                      className="mb-4 min-h-[120px] w-full rounded-xl border border-dark-700 bg-dark-900/80 p-3 text-sm text-white outline-none transition focus:border-primary-400"
                    />

                    <label className="mb-2 block text-sm font-semibold text-white/80">
                      Narração literal
                    </label>
                    <textarea
                      value={slide.narrationText}
                      onChange={(event) =>
                        onSlideChange(slide.id, {
                          narrationText: event.target.value,
                        })
                      }
                      className="mb-4 min-h-[90px] w-full rounded-xl border border-dark-700 bg-dark-900/80 p-3 text-sm text-white outline-none transition focus:border-primary-400"
                    />

                    <label className="mb-2 block text-sm font-semibold text-white/80">
                      Prompt visual sugerido
                    </label>
                    <textarea
                      value={slide.visualPrompt}
                      onChange={(event) =>
                        onSlideChange(slide.id, {
                          visualPrompt: event.target.value,
                        })
                      }
                      className="mb-4 min-h-[80px] w-full rounded-xl border border-dark-700 bg-dark-900/80 p-3 text-sm text-white outline-none transition focus:border-primary-400"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onInsertSlideAfter(index)}
                      >
                        <Plus className="h-4 w-4" /> Adicionar abaixo
                      </button>
                    </div>
                  </article>
                ))}

                <button
                  type="button"
                  className="w-full rounded-2xl border border-dashed border-primary-400/50 bg-dark-950/30 px-4 py-3 text-sm font-semibold text-primary-300 transition hover:bg-primary-500/10"
                  onClick={onAddSlide}
                >
                  <Plus className="mr-2 inline h-4 w-4" /> Adicionar novo slide
                </button>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4 rounded-3xl border border-primary-500/20 bg-dark-950/70 p-6 shadow-lg shadow-primary-500/10">
            <div>
              <h3 className="text-xl font-semibold text-white">
                Refine por instruções
              </h3>
              <p className="mt-1 text-sm text-white/70">
                Descreva o estilo desejado, quantidade de slides ou ajustes de
                tom e deixe a IA reescrever tudo de uma vez.
              </p>
            </div>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Ex: quero 6 slides, tom motivacional e foco em exemplos práticos."
              className="min-h-[180px] rounded-2xl border border-dark-700 bg-dark-900/80 p-4 text-sm text-white outline-none transition focus:border-primary-400"
            />
            <button
              type="button"
              className="btn-primary w-full justify-center"
              onClick={handleApplyInstructions}
              disabled={!instructions.trim()}
            >
              <Wand2 className="h-5 w-5" /> Aplicar instruções
            </button>

            <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
              <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Pronto para gerar visuais?
              </div>
              <p className="text-emerald-100/70">
                Assim que continuar, as imagens serão renderizadas e o próximo
                passo abrirá o editor completo de slides.
              </p>
            </div>
            <button
              type="button"
              className="btn-accent w-full justify-center"
              onClick={handleContinue}
              disabled={orderedSlides.length === 0}
            >
              <Sparkles className="h-5 w-5" /> Gerar visuais e avançar
            </button>
          </aside>
        </section>
      </div>
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
      <p className="text-xs uppercase tracking-[0.3em] text-white/50">
        {label}
      </p>
      <p className="text-base font-semibold text-white">{value}</p>
    </div>
  );
}
