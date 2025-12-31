import { type ChangeEvent, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  Palette,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import { type AspectRatio } from '@/config/constants/video';
import {
  generateSlideImage,
  refineSlideContent,
} from '@/features/video-generation/api/videoGenerationApi';
import type { Slide } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import { uuidv4 } from '@/shared/utils/uuid';

type EditorStepProps = {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onUpdateSlide: (id: string, updates: Partial<Slide>) => void;
  onFinish: () => void;
};

export function EditorStep({
  slides,
  aspectRatio,
  onUpdateSlide,
  onFinish,
}: EditorStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isProcessingFeedback, setIsProcessingFeedback] = useState(false);
  const [styleUploadError, setStyleUploadError] = useState<string | null>(null);

  const currentSlide = slides[currentIndex];
  const styleGuide = currentSlide?.styleGuide;
  const MAX_STYLE_REFERENCES = 5;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && currentIndex < slides.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
      if (event.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, slides.length]);

  if (!currentSlide) {
    return null;
  }

  const arClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16]'
      : aspectRatio === '16:9'
        ? 'aspect-[16/9]'
        : 'aspect-square';

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) {
      return;
    }

    setIsProcessingFeedback(true);

    try {
      const refinements = await refineSlideContent(currentSlide, feedback);

      const nextSlideState: Slide = {
        ...currentSlide,
        scriptText: refinements.scriptText,
        narrationText: refinements.narrationText,
        visualPrompt: refinements.visualPrompt,
        userNotes: feedback,
        isRegeneratingImage: true,
      };

      onUpdateSlide(currentSlide.id, {
        scriptText: refinements.scriptText,
        narrationText: refinements.narrationText,
        visualPrompt: refinements.visualPrompt,
        userNotes: feedback,
        isRegeneratingImage: true,
      });

      setFeedback('');

      try {
        const imageUrl = await generateSlideImage(nextSlideState, aspectRatio);
        onUpdateSlide(currentSlide.id, {
          imageUrl,
          isRegeneratingImage: false,
        });
      } catch (imageError) {
        appLogger.error('Falha ao regerar imagem com feedback.', {
          error: imageError,
          slideId: currentSlide.id,
        });
        onUpdateSlide(currentSlide.id, { isRegeneratingImage: false });
      }
    } catch (error) {
      appLogger.error('Não foi possível aplicar o feedback.', { error });
      window.alert('Falha ao processar feedback. Tente novamente.');
    } finally {
      setIsProcessingFeedback(false);
    }
  };

  const handleStyleNotesChange = (notes: string) => {
    if (!styleGuide) {
      return;
    }
    onUpdateSlide(currentSlide.id, {
      styleGuide: {
        ...styleGuide,
        notes,
      },
    });
  };

  const handleStyleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (!styleGuide) {
      return;
    }

    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const availableSlots = MAX_STYLE_REFERENCES - styleGuide.references.length;
    if (availableSlots <= 0) {
      setStyleUploadError(
        'Limite de 5 referências atingido. Remova alguma antes de adicionar novas.',
      );
      event.target.value = '';
      return;
    }

    const acceptedFiles = Array.from(files)
      .filter((file) => /image\/(png|jpe?g|webp)/i.test(file.type))
      .slice(0, availableSlots);

    if (acceptedFiles.length === 0) {
      setStyleUploadError('Use apenas imagens PNG, JPG ou WebP.');
      event.target.value = '';
      return;
    }

    const references = acceptedFiles.map((file) => ({
      id: uuidv4(),
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      file,
    }));

    onUpdateSlide(currentSlide.id, {
      styleGuide: {
        ...styleGuide,
        references: [...styleGuide.references, ...references],
      },
    });

    setStyleUploadError(null);
    event.target.value = '';
  };

  const handleRemoveStyleReference = (referenceId: string) => {
    if (!styleGuide) {
      return;
    }

    const reference = styleGuide.references.find(
      (ref) => ref.id === referenceId,
    );
    if (reference?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(reference.previewUrl);
    }

    onUpdateSlide(currentSlide.id, {
      styleGuide: {
        ...styleGuide,
        references: styleGuide.references.filter(
          (ref) => ref.id !== referenceId,
        ),
      },
    });
  };

  const handleFidelityChange = (value: 'high' | 'low') => {
    if (!styleGuide || styleGuide.inputFidelity === value) {
      return;
    }

    onUpdateSlide(currentSlide.id, {
      styleGuide: {
        ...styleGuide,
        inputFidelity: value,
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col pt-14">
      {/* Header */}
      <div className="glass-card mx-4 mb-4 flex items-center justify-between rounded-xl border-dark-700 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? 'w-6 bg-primary-500'
                    : index < currentIndex
                      ? 'w-2 bg-primary-500/50'
                      : 'w-2 bg-dark-600 hover:bg-dark-500'
                }`}
              />
            ))}
          </div>
          <span className="text-sm text-white/50">
            {currentIndex + 1} / {slides.length}
          </span>
        </div>
        <button type="button" className="btn-accent" onClick={onFinish}>
          <Mic size={18} />
          Ir para gravação
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 lg:flex-row">
        {/* Slide Preview */}
        <div className="relative flex flex-1 items-center justify-center">
          {/* Navigation buttons */}
          <button
            type="button"
            aria-label="Slide anterior"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className="btn-icon absolute left-2 z-10 disabled:opacity-30"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label="Próximo slide"
            disabled={currentIndex === slides.length - 1}
            onClick={() =>
              setCurrentIndex((prev) => Math.min(slides.length - 1, prev + 1))
            }
            className="btn-icon absolute right-2 z-10 disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>

          {/* Slide container */}
          <div
            className={`relative w-full max-w-3xl overflow-hidden rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl ${arClass}`}
          >
            {currentSlide.imageUrl ? (
              <img
                src={currentSlide.imageUrl}
                alt="Preview do slide"
                className={`h-full w-full object-cover transition-all duration-500 ${
                  currentSlide.isRegeneratingImage
                    ? 'scale-105 opacity-50 blur-md'
                    : 'scale-100 opacity-100'
                }`}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-dark-800 text-white/40">
                <ImageIcon size={48} className="animate-pulse" />
                <span>Gerando visual...</span>
              </div>
            )}

            {/* Regenerating overlay */}
            {currentSlide.isRegeneratingImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-dark-950/60 backdrop-blur-sm">
                <div className="relative">
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary-500/30" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary-500/20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
                  </div>
                </div>
                <span className="text-sm font-medium text-white/70">
                  Regenerando imagem...
                </span>
              </div>
            )}

            {/* Script overlay */}
            <div className="absolute bottom-0 left-0 right-0 space-y-3 bg-gradient-to-t from-black via-black/80 to-transparent p-6">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-white/60">
                  Briefing do slide
                </p>
                <p className="text-base leading-relaxed text-white drop-shadow-lg">
                  {currentSlide.scriptText}
                </p>
              </div>
              <div className="rounded-lg bg-dark-900/80 p-4">
                <p className="text-[11px] uppercase tracking-wide text-primary-300">
                  Texto literal para narrar
                </p>
                <p className="text-lg font-semibold leading-relaxed text-white">
                  {currentSlide.narrationText}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-[400px]">
          <div className="glass-card h-full space-y-5 p-5">
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <Edit3 size={18} className="text-primary-400" />
              Editor
            </div>

            {/* Script editor */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="label" htmlFor="scriptText">
                  Briefing / instruções do slide
                </label>
                <textarea
                  id="scriptText"
                  className="input min-h-[120px] resize-none text-sm"
                  value={currentSlide.scriptText}
                  onChange={(event) =>
                    onUpdateSlide(currentSlide.id, {
                      scriptText: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="label" htmlFor="narrationText">
                  Texto literal para narrar
                </label>
                <textarea
                  id="narrationText"
                  className="input min-h-[100px] resize-none text-sm"
                  value={currentSlide.narrationText}
                  onChange={(event) =>
                    onUpdateSlide(currentSlide.id, {
                      narrationText: event.target.value,
                    })
                  }
                />
              </div>
            </div>

            {/* AI Feedback */}
            <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-4">
              <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary-300">
                <Sparkles size={16} className="animate-pulse" />
                Revisão com IA
              </label>
              <textarea
                className="input min-h-[100px] resize-none border-primary-500/20 bg-dark-800/50 text-sm focus:border-primary-500/40"
                placeholder="Ex.: deixe a imagem mais colorida, resuma o texto, mude o estilo visual..."
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                disabled={isProcessingFeedback}
              />
              <button
                type="button"
                onClick={handleFeedbackSubmit}
                disabled={!feedback || isProcessingFeedback}
                className="btn-primary mt-3 w-full"
              >
                {isProcessingFeedback ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Aplicar feedback
                  </>
                )}
              </button>
            </div>

            {/* Style guide */}
            {styleGuide && (
              <div className="rounded-xl border border-white/10 bg-dark-900/60 p-4">
                <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
                  <div className="flex items-center gap-2">
                    <Palette size={16} className="text-primary-300" />
                    Biblioteca de estilo
                  </div>
                  <span className="text-xs text-white/50">
                    {styleGuide.references.length}/{MAX_STYLE_REFERENCES}
                  </span>
                </div>
                <p className="text-xs text-white/60">
                  Inspire o gpt-image-1.5 anexando imagens com a paleta e
                  textura desejadas. Elas viram "Image 1...N" no prompt e usamos{' '}
                  <code>input_fidelity</code> alto para preservar detalhes,
                  seguindo as recomendações do guia de controle de estilo.
                </p>
                {styleUploadError && (
                  <div className="mt-3 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-200">
                    {styleUploadError}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {styleGuide.references.map((reference) => (
                    <div
                      key={reference.id}
                      className="group relative overflow-hidden rounded-lg border border-white/10 bg-dark-800/60"
                    >
                      <img
                        src={reference.previewUrl}
                        alt={reference.name}
                        className="h-24 w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-dark-900/80 p-1 text-white/70 transition hover:text-danger-400"
                        onClick={() => handleRemoveStyleReference(reference.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                      <div className="truncate px-2 py-1 text-center text-[11px] text-white/60">
                        {reference.name}
                      </div>
                    </div>
                  ))}
                  {styleGuide.references.length < MAX_STYLE_REFERENCES && (
                    <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-dark-800/30 text-xs text-white/60 transition hover:border-white/40">
                      <UploadCloud size={18} className="text-primary-300" />
                      <span>Adicionar referências</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="sr-only"
                        onChange={handleStyleUpload}
                      />
                    </label>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  <label
                    className="label text-xs text-white/60"
                    htmlFor="style-notes"
                  >
                    Invariantes de estilo / paleta desejada
                  </label>
                  <textarea
                    id="style-notes"
                    className="input min-h-[90px] resize-none text-xs"
                    placeholder="Ex.: manter iluminação neon vaporwave, personagens com outline suave, fundo gradiente azul-magenta, sem tipografia."
                    value={styleGuide.notes}
                    onChange={(event) =>
                      handleStyleNotesChange(event.target.value)
                    }
                  />
                </div>
                <div className="mt-4 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                    Fidelidade das referências
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        styleGuide.inputFidelity === 'high'
                          ? 'border-primary-400 bg-primary-500/10 text-primary-200'
                          : 'border-white/10 text-white/60 hover:border-white/30'
                      }`}
                      onClick={() => handleFidelityChange('high')}
                    >
                      Alta (preserva traços)
                      <span className="block text-[10px] text-white/50">
                        Mantém cores, textura e rostos da referência.
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        styleGuide.inputFidelity === 'low'
                          ? 'border-primary-400 bg-primary-500/10 text-primary-200'
                          : 'border-white/10 text-white/60 hover:border-white/30'
                      }`}
                      onClick={() => handleFidelityChange('low')}
                    >
                      Baixa (mais liberdade)
                      <span className="block text-[10px] text-white/50">
                        Usa só parte da estética, permite variações.
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Visual prompt info */}
            <div className="rounded-lg bg-dark-800/50 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-white/50">
                <MessageSquare size={12} />
                Prompt visual
              </div>
              <p className="line-clamp-2 text-xs italic text-white/40">
                {currentSlide.visualPrompt}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
