import { ChangeEvent, useMemo, useState } from 'react';

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  LayoutList,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  Film,
  ImageIcon,
} from 'lucide-react';

import type {
  ProjectData,
  Slide,
  SlideCustomAsset,
} from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import { VoiceInputButton } from '@/shared/components/VoiceInput/VoiceInputButton';
import { mergeTranscript } from '@/shared/utils/transcription';
import { uuidv4 } from '@/shared/utils/uuid';

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
  const [styleUploadErrors, setStyleUploadErrors] = useState<
    Record<string, string | null>
  >({});
  const [assetUploadErrors, setAssetUploadErrors] = useState<
    Record<string, string | null>
  >({});
  const orderedSlides = useMemo(
    () => [...slides].sort((a, b) => a.order - b.order),
    [slides],
  );
  const MAX_STYLE_REFERENCES = 5;
  const SUPPORTED_IMAGE_TYPES = /image\/(png|jpe?g|webp)/i;
  const SUPPORTED_VIDEO_TYPES = /video\/(mp4|webm|quicktime)/i;

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

  const setSlideUploadError = (slideId: string, message: string | null) => {
    setStyleUploadErrors((prev) => ({ ...prev, [slideId]: message }));
  };

  const handleStyleUpload = (
    slide: Slide,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const availableSlots =
      MAX_STYLE_REFERENCES - slide.styleGuide.references.length;
    if (availableSlots <= 0) {
      setSlideUploadError(
        slide.id,
        'Limite de 5 referências atingido. Remova alguma antes de adicionar novas.',
      );
      event.target.value = '';
      return;
    }

    const acceptedFiles = Array.from(files)
      .filter((file) => SUPPORTED_IMAGE_TYPES.test(file.type))
      .slice(0, availableSlots);

    if (acceptedFiles.length === 0) {
      setSlideUploadError(slide.id, 'Use apenas imagens PNG, JPG ou WebP.');
      event.target.value = '';
      return;
    }

    const references = acceptedFiles.map((file) => ({
      id: uuidv4(),
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      file,
    }));

    onSlideChange(slide.id, {
      styleGuide: {
        ...slide.styleGuide,
        references: [...slide.styleGuide.references, ...references],
      },
    });

    setSlideUploadError(slide.id, null);
    event.target.value = '';
  };

  const readVideoDurationMs = (assetUrl: string): Promise<number | null> =>
    new Promise((resolve) => {
      const video = document.createElement('video');
      let settled = false;

      const finalize = (duration: number | null) => {
        if (settled) {
          return;
        }
        settled = true;
        video.src = '';
        video.remove();
        resolve(duration);
      };

      video.preload = 'metadata';
      video.muted = true;
      video.src = assetUrl;

      const timeoutId = window.setTimeout(() => finalize(null), 5000);

      video.onloadedmetadata = () => {
        window.clearTimeout(timeoutId);
        const duration = Number.isFinite(video.duration)
          ? Math.max(0, Math.round(video.duration * 1000))
          : null;
        finalize(duration);
      };

      video.onerror = () => {
        window.clearTimeout(timeoutId);
        finalize(null);
      };
    });

  const handleAssetUpload = async (
    slide: Slide,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }

    const isImage = SUPPORTED_IMAGE_TYPES.test(file.type);
    const isVideo = SUPPORTED_VIDEO_TYPES.test(file.type);

    if (!isImage && !isVideo) {
      setAssetUploadErrors((prev) => ({
        ...prev,
        [slide.id]: 'Use imagens PNG/JPG/WebP ou vídeos MP4/WebM/MOV.',
      }));
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      let asset: SlideCustomAsset = {
        id: uuidv4(),
        type: isVideo ? 'video' : 'image',
        name: file.name,
        previewUrl: objectUrl,
        sourceUrl: objectUrl,
        file,
      };

      if (isVideo) {
        const durationMs = await readVideoDurationMs(objectUrl);
        asset = {
          ...asset,
          durationMs: durationMs ?? undefined,
        };
      }

      onSlideChange(slide.id, {
        customAsset: asset,
        imageUrl: asset.type === 'image' ? asset.previewUrl : slide.imageUrl,
        isRegeneratingImage: false,
      });
      setAssetUploadErrors((prev) => ({ ...prev, [slide.id]: null }));
    } catch (error) {
      appLogger.error('💥 Falha ao processar asset personalizado.', {
        error,
      });
      URL.revokeObjectURL(objectUrl);
      setAssetUploadErrors((prev) => ({
        ...prev,
        [slide.id]: 'Não foi possível processar o arquivo enviado.',
      }));
    } finally {
      event.target.value = '';
    }
  };

  const handleRemoveCustomAsset = (slide: Slide) => {
    const asset = slide.customAsset;
    if (!asset) {
      return;
    }

    if (asset.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(asset.previewUrl);
    }
    if (
      asset.sourceUrl &&
      asset.sourceUrl !== asset.previewUrl &&
      asset.sourceUrl.startsWith('blob:')
    ) {
      URL.revokeObjectURL(asset.sourceUrl);
    }

    const updates: Partial<Slide> = {
      customAsset: null,
    };
    if (asset.type === 'image' && slide.imageUrl === asset.previewUrl) {
      updates.imageUrl = undefined;
    }

    onSlideChange(slide.id, updates);
  };

  const handleRemoveStyleReference = (slide: Slide, referenceId: string) => {
    const reference = slide.styleGuide.references.find(
      (ref) => ref.id === referenceId,
    );
    if (reference?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(reference.previewUrl);
    }

    onSlideChange(slide.id, {
      styleGuide: {
        ...slide.styleGuide,
        references: slide.styleGuide.references.filter(
          (ref) => ref.id !== referenceId,
        ),
      },
    });
  };

  const handleStyleNotesChange = (slide: Slide, notes: string) => {
    onSlideChange(slide.id, {
      styleGuide: {
        ...slide.styleGuide,
        notes,
      },
    });
  };

  const handleFidelityChange = (slide: Slide, value: 'high' | 'low') => {
    if (slide.styleGuide.inputFidelity === value) {
      return;
    }

    onSlideChange(slide.id, {
      styleGuide: {
        ...slide.styleGuide,
        inputFidelity: value,
      },
    });
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-950 via-dark-900 to-dark-950 px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5 md:gap-6">
        <header className="flex flex-col gap-2 rounded-xl border border-dark-700/60 bg-dark-900/80 p-4 shadow-xl shadow-primary-500/5 sm:gap-3 sm:rounded-2xl sm:p-5 md:gap-4 md:rounded-3xl md:p-6 lg:p-8">
          <div className="flex items-center gap-2 text-primary-300 sm:gap-3">
            <Sparkles className="h-4 w-4 animate-pulse sm:h-5 sm:w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] sm:text-sm sm:tracking-[0.25em]">
              Revisão do roteiro
            </span>
          </div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl md:text-3xl">
            Ajuste o conteúdo antes de gerar qualquer imagem
          </h1>
          <p className="text-sm text-white/70 sm:text-base">
            Cada slide pode ser editado, reordenado ou removido livremente.
            Adicione novos blocos caso precise de mais contexto e só avance para
            a etapa visual quando o fluxo estiver perfeito.
          </p>
          <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
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

        <section className="grid gap-4 sm:gap-5 md:gap-6 md:grid-cols-[1fr] lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3 rounded-xl border border-dark-800/60 bg-dark-900/70 p-3 shadow-xl shadow-black/40 sm:space-y-4 sm:rounded-2xl sm:p-4 md:rounded-3xl md:p-5 lg:p-6">
            {orderedSlides.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-white/60 sm:gap-3 sm:py-16 md:py-20">
                <LayoutList className="h-10 w-10 sm:h-12 sm:w-12" />
                <p className="text-sm sm:text-base">Adicione pelo menos um slide para continuar.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onAddSlide}
                >
                  <Plus className="h-4 w-4" /> Criar slide
                </button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {orderedSlides.map((slide, index) => {
                  const customAsset = slide.customAsset;
                  const referencesDisabled = Boolean(customAsset);
                  const assetError = assetUploadErrors[slide.id];

                  return (
                    <article
                    key={slide.id}
                    className="rounded-xl border border-dark-700/70 bg-dark-950/60 p-3 sm:rounded-2xl sm:p-4 md:p-5"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 sm:text-xs sm:tracking-[0.3em]">
                          Slide {index + 1}
                        </p>
                        <h2 className="truncate text-base font-semibold text-white sm:text-lg">
                          Conteúdo e narração
                        </h2>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => onMoveSlide(slide.id, 'up')}
                          disabled={index === 0}
                          className="btn-icon bg-dark-800/80 text-white"
                          title="Mover para cima"
                        >
                          <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveSlide(slide.id, 'down')}
                          disabled={index === orderedSlides.length - 1}
                          className="btn-icon bg-dark-800/80 text-white"
                          title="Mover para baixo"
                        >
                          <ArrowDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveSlide(slide.id)}
                          className="btn-icon bg-danger-500/10 text-danger-300"
                          title="Remover slide"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                      </div>
                    </div>

                    <label className="mb-1.5 block text-xs font-semibold text-white/80 sm:mb-2 sm:text-sm">
                      Texto orientativo
                    </label>
                    <div className="mb-3 flex items-start gap-2 sm:mb-4 sm:gap-3">
                      <textarea
                        value={slide.scriptText}
                        onChange={(event) =>
                          onSlideChange(slide.id, {
                            scriptText: event.target.value,
                          })
                        }
                        className="min-h-[80px] w-full flex-1 rounded-lg border border-dark-700 bg-dark-900/80 p-2.5 text-sm text-white outline-none transition focus:border-primary-400 sm:min-h-[100px] sm:rounded-xl sm:p-3 md:min-h-[120px]"
                      />
                      <VoiceInputButton
                        size="sm"
                        className="mt-0.5 shrink-0 sm:mt-1"
                        ariaLabel="Ditado para o texto orientativo"
                        onTranscription={(text) =>
                          onSlideChange(slide.id, {
                            scriptText: mergeTranscript(slide.scriptText, text),
                          })
                        }
                      />
                    </div>

                    <label className="mb-1.5 block text-xs font-semibold text-white/80 sm:mb-2 sm:text-sm">
                      Narração literal
                    </label>
                    <div className="mb-3 flex items-start gap-2 sm:mb-4 sm:gap-3">
                      <textarea
                        value={slide.narrationText}
                        onChange={(event) =>
                          onSlideChange(slide.id, {
                            narrationText: event.target.value,
                          })
                        }
                        className="min-h-[60px] w-full flex-1 rounded-lg border border-dark-700 bg-dark-900/80 p-2.5 text-sm text-white outline-none transition focus:border-primary-400 sm:min-h-[80px] sm:rounded-xl sm:p-3 md:min-h-[90px]"
                      />
                      <VoiceInputButton
                        size="sm"
                        className="mt-0.5 shrink-0 sm:mt-1"
                        ariaLabel="Ditado para a narração literal"
                        onTranscription={(text) =>
                          onSlideChange(slide.id, {
                            narrationText: mergeTranscript(
                              slide.narrationText,
                              text,
                            ),
                          })
                        }
                      />
                    </div>

                    <label className="mb-1.5 block text-xs font-semibold text-white/80 sm:mb-2 sm:text-sm">
                      Prompt visual sugerido
                    </label>
                    <div className="mb-3 flex items-start gap-2 sm:mb-4 sm:gap-3">
                      <textarea
                        value={slide.visualPrompt}
                        onChange={(event) =>
                          onSlideChange(slide.id, {
                            visualPrompt: event.target.value,
                          })
                        }
                        className="min-h-[50px] w-full flex-1 rounded-lg border border-dark-700 bg-dark-900/80 p-2.5 text-sm text-white outline-none transition focus:border-primary-400 sm:min-h-[70px] sm:rounded-xl sm:p-3 md:min-h-[80px]"
                      />
                      <VoiceInputButton
                        size="sm"
                        className="mt-0.5 shrink-0 sm:mt-1"
                        ariaLabel="Ditado para o prompt visual"
                        onTranscription={(text) =>
                          onSlideChange(slide.id, {
                            visualPrompt: mergeTranscript(
                              slide.visualPrompt,
                              text,
                            ),
                          })
                        }
                      />
                    </div>

                    {slide.styleGuide && (
                      <div className="mb-3 rounded-lg border border-white/10 bg-dark-900/60 p-3 sm:mb-4 sm:rounded-xl sm:p-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-white sm:mb-2 sm:text-sm">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <Palette size={14} className="text-primary-300 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">Referência visual (opcional)</span>
                            <span className="sm:hidden">Referência visual</span>
                          </div>
                          <span className="text-[10px] text-white/50 sm:text-xs">
                            {slide.styleGuide.references.length}/{MAX_STYLE_REFERENCES}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-white/60 sm:text-xs">
                          {referencesDisabled
                            ? 'Referências são ignoradas com asset final.'
                            : 'Anexe imagens inspiração antes de gerar os visuais.'}
                        </p>

                        <div className="mt-3 rounded-lg border border-white/10 bg-dark-950/40 p-3 sm:mt-4 sm:rounded-xl sm:p-4">
                          <div className="flex items-center justify-between text-xs font-semibold text-white sm:text-sm">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              {customAsset?.type === 'video' ? (
                                <Film size={14} className="text-primary-300 sm:h-4 sm:w-4" />
                              ) : (
                                <ImageIcon size={14} className="text-primary-300 sm:h-4 sm:w-4" />
                              )}
                              <span className="hidden sm:inline">Asset final (imagem ou vídeo)</span>
                              <span className="sm:hidden">Asset final</span>
                            </div>
                            <span className="text-[10px] text-white/50 sm:text-xs">
                              {customAsset ? '1/1' : 'opcional'}
                            </span>
                          </div>
                          <p className="mt-1 hidden text-xs text-white/60 sm:block">
                            Envie o visual definitivo. Ajustaremos para o aspect ratio escolhido.
                          </p>
                          {customAsset ? (
                            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-white/10 bg-dark-900/60 p-2 sm:mt-3 sm:gap-3 sm:p-3 md:flex-row">
                              <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-dark-800/50 md:w-32 lg:w-40">
                                {customAsset.type === 'video' ? (
                                  <video
                                    key={customAsset.previewUrl}
                                    src={customAsset.previewUrl}
                                    className="h-24 w-full object-cover sm:h-28 md:h-32"
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                  />
                                ) : (
                                  <img
                                    src={customAsset.previewUrl}
                                    alt={customAsset.name}
                                    className="h-24 w-full object-cover sm:h-28 md:h-32"
                                  />
                                )}
                              </div>
                              <div className="flex flex-1 flex-col justify-between gap-1.5 text-xs text-white/80 sm:gap-2 sm:text-sm">
                                <div>
                                  <p className="truncate font-semibold">{customAsset.name}</p>
                                  <p className="text-[10px] text-white/50 sm:text-xs">
                                    {customAsset.type === 'video'
                                      ? `Vídeo • ${formatDuration(customAsset.durationMs)}`
                                      : 'Imagem'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="btn-secondary inline-flex items-center gap-1.5 border-danger-500/40 px-3 py-1.5 text-xs text-danger-300 hover:bg-danger-500/10 sm:gap-2 sm:px-4 sm:py-2"
                                  onClick={() => handleRemoveCustomAsset(slide)}
                                >
                                  <Trash2 size={12} className="sm:h-3.5 sm:w-3.5" /> Remover
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="mt-2 flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-dark-800/30 text-xs text-white/60 transition hover:border-white/40 sm:mt-3 sm:h-24 sm:gap-2">
                              <UploadCloud size={16} className="text-primary-300 sm:h-[18px] sm:w-[18px]" />
                              <span className="text-[11px] sm:text-xs">Enviar asset final</span>
                              <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 sm:text-[10px] sm:tracking-[0.3em]">
                                PNG · JPG · MP4 · MOV
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
                                className="sr-only"
                                onChange={(event) => handleAssetUpload(slide, event)}
                              />
                            </label>
                          )}
                          {assetError && (
                            <div className="mt-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-2 py-1.5 text-[11px] text-danger-200 sm:mt-3 sm:px-3 sm:py-2 sm:text-xs">
                              {assetError}
                            </div>
                          )}
                        </div>
                        {styleUploadErrors[slide.id] && (
                          <div className="mt-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-2 py-1.5 text-[11px] text-danger-200 sm:mt-3 sm:px-3 sm:py-2 sm:text-xs">
                            {styleUploadErrors[slide.id]}
                          </div>
                        )}
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3 md:grid-cols-3">
                          {slide.styleGuide.references.map((reference) => (
                            <div
                              key={reference.id}
                              className="group relative overflow-hidden rounded-lg border border-white/10 bg-dark-800/60"
                            >
                              <img
                                src={reference.previewUrl}
                                alt={reference.name}
                                className="h-20 w-full object-cover sm:h-24"
                              />
                              <button
                                type="button"
                                className="absolute right-1 top-1 rounded-full bg-dark-900/80 p-1 text-white/70 transition hover:text-danger-400"
                                onClick={() => handleRemoveStyleReference(slide, reference.id)}
                              >
                                <Trash2 size={10} className="sm:h-3 sm:w-3" />
                              </button>
                              <div className="truncate px-1.5 py-0.5 text-center text-[10px] text-white/60 sm:px-2 sm:py-1 sm:text-[11px]">
                                {reference.name}
                              </div>
                            </div>
                          ))}
                          {!referencesDisabled &&
                            slide.styleGuide.references.length < MAX_STYLE_REFERENCES && (
                              <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-dark-800/30 text-xs text-white/60 transition hover:border-white/40 sm:h-24 sm:gap-2">
                                <UploadCloud size={16} className="text-primary-300 sm:h-[18px] sm:w-[18px]" />
                                <span className="text-[11px] sm:text-xs">Referência</span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  multiple
                                  className="sr-only"
                                  onChange={(event) => handleStyleUpload(slide, event)}
                                />
                              </label>
                            )}
                          {referencesDisabled && (
                            <div className="col-span-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100 sm:px-3 sm:py-2 sm:text-xs">
                              Remova o asset final para adicionar referências.
                            </div>
                          )}
                        </div>
                        <div className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-2">
                          <label
                            className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50 sm:text-xs sm:tracking-[0.2em]"
                            htmlFor={`style-notes-${slide.id}`}
                          >
                            Observações de estilo
                          </label>
                          <div className="flex items-start gap-2 sm:gap-3">
                            <textarea
                              id={`style-notes-${slide.id}`}
                              className="input min-h-[50px] flex-1 resize-none text-xs sm:min-h-[70px] md:min-h-[80px]"
                              placeholder="Ex.: iluminação neon, fundo gradiente."
                              value={slide.styleGuide.notes}
                              onChange={(event) =>
                                handleStyleNotesChange(slide, event.target.value)
                              }
                            />
                            <VoiceInputButton
                              size="sm"
                              className="mt-0.5 shrink-0 sm:mt-1"
                              ariaLabel="Ditado para observações de estilo"
                              onTranscription={(text) =>
                                handleStyleNotesChange(
                                  slide,
                                  mergeTranscript(slide.styleGuide.notes, text),
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-2">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40 sm:text-[10px] sm:tracking-[0.3em]">
                            Fidelidade
                          </span>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                            <button
                              type="button"
                              className={`rounded-lg border px-2 py-1.5 text-left transition sm:px-3 sm:py-2 ${
                                slide.styleGuide.inputFidelity === 'high'
                                  ? 'border-primary-400 bg-primary-500/10 text-primary-200'
                                  : 'border-white/10 text-white/60 hover:border-white/30'
                              }`}
                              onClick={() => handleFidelityChange(slide, 'high')}
                            >
                              <span className="sm:hidden">Alta</span>
                              <span className="hidden sm:inline">Alta (preserva traços)</span>
                              <span className="hidden text-[10px] text-white/50 sm:block">
                                Mantém cores, textura e rostos.
                              </span>
                            </button>
                            <button
                              type="button"
                              className={`rounded-lg border px-2 py-1.5 text-left transition sm:px-3 sm:py-2 ${
                                slide.styleGuide.inputFidelity === 'low'
                                  ? 'border-primary-400 bg-primary-500/10 text-primary-200'
                                  : 'border-white/10 text-white/60 hover:border-white/30'
                              }`}
                              onClick={() => handleFidelityChange(slide, 'low')}
                            >
                              <span className="sm:hidden">Baixa</span>
                              <span className="hidden sm:inline">Baixa (mais liberdade)</span>
                              <span className="hidden text-[10px] text-white/50 sm:block">
                                Usa só parte da estética.
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm"
                        onClick={() => onInsertSlideAfter(index)}
                      >
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Adicionar abaixo</span><span className="sm:hidden">Abaixo</span>
                      </button>
                    </div>
                  </article>
                  );
                })}

                <button
                  type="button"
                  className="w-full rounded-xl border border-dashed border-primary-400/50 bg-dark-950/30 px-3 py-2.5 text-xs font-semibold text-primary-300 transition hover:bg-primary-500/10 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
                  onClick={onAddSlide}
                >
                  <Plus className="mr-1.5 inline h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> Adicionar slide
                </button>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-3 rounded-xl border border-primary-500/20 bg-dark-950/70 p-4 shadow-lg shadow-primary-500/10 sm:gap-4 sm:rounded-2xl sm:p-5 md:rounded-3xl md:p-6">
            <div>
              <h3 className="text-base font-semibold text-white sm:text-lg md:text-xl">
                Refine por instruções
              </h3>
              <p className="mt-0.5 text-xs text-white/70 sm:mt-1 sm:text-sm">
                Descreva ajustes de tom ou quantidade de slides e deixe a IA reescrever.
              </p>
            </div>
            <div className="flex items-start gap-2 sm:gap-3">
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Ex: quero 6 slides, tom motivacional."
                className="min-h-[100px] flex-1 rounded-xl border border-dark-700 bg-dark-900/80 p-3 text-sm text-white outline-none transition focus:border-primary-400 sm:min-h-[140px] sm:rounded-2xl sm:p-4 md:min-h-[180px]"
              />
              <VoiceInputButton
                className="mt-0.5 shrink-0 sm:mt-1"
                ariaLabel="Ditado para instruções globais"
                onTranscription={(text) => setInstructions(text)}
              />
            </div>
            <button
              type="button"
              className="btn-primary w-full justify-center"
              onClick={handleApplyInstructions}
              disabled={!instructions.trim()}
            >
              <Wand2 className="h-4 w-4 sm:h-5 sm:w-5" /> Aplicar
            </button>

            <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-100 sm:mt-4 sm:rounded-2xl sm:p-4 sm:text-sm md:mt-6 md:p-5">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-emerald-300 sm:mb-2 sm:gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Pronto para gerar visuais?
              </div>
              <p className="text-emerald-100/70">
                As imagens serão renderizadas e o próximo passo abrirá o editor.
              </p>
            </div>
            <button
              type="button"
              className="btn-accent w-full justify-center"
              onClick={handleContinue}
              disabled={orderedSlides.length === 0}
            >
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" /> Gerar visuais
            </button>
          </aside>
        </section>
      </div>
    </div>
  );
}

function formatDuration(durationMs?: number): string {
  if (!durationMs || !Number.isFinite(durationMs)) {
    return 'duração indefinida';
  }

  if (durationMs >= 1000) {
    const seconds = durationMs / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  }

  return `${Math.round(durationMs)}ms`;
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 sm:rounded-2xl sm:px-3 sm:py-2 md:px-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 sm:text-xs sm:tracking-[0.3em]">
        {label}
      </p>
      <p className="text-sm font-semibold text-white sm:text-base">{value}</p>
    </div>
  );
}
