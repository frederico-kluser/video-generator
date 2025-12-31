import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
} from 'lucide-react';

import { type AspectRatio } from '@/config/constants/video';
import {
  generateSlideImage,
  refineSlideContent,
} from '@/features/video-generation/api/videoGenerationApi';
import type { Slide } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';

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

  const currentSlide = slides[currentIndex];

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

      onUpdateSlide(currentSlide.id, {
        scriptText: refinements.scriptText,
        narrationText: refinements.narrationText,
        visualPrompt: refinements.visualPrompt,
        userNotes: feedback,
        isRegeneratingImage: true,
      });

      setFeedback('');

      try {
        const imageUrl = await generateSlideImage(
          refinements.visualPrompt,
          aspectRatio,
        );
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
        <aside className="w-full lg:w-[380px]">
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
