import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, Mic, RefreshCw } from 'lucide-react';
import { AspectRatio } from '@/config/constants/video';
import { refineSlideContent, generateSlideImage } from '@/features/video-generation/api/videoGenerationApi';
import { Slide } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';

type EditorStepProps = {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onUpdateSlide: (id: string, updates: Partial<Slide>) => void;
  onFinish: () => void;
};

export function EditorStep({ slides, aspectRatio, onUpdateSlide, onFinish }: EditorStepProps) {
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

  const arClass = aspectRatio === '9:16' ? 'aspect-[9/16]' : aspectRatio === '16:9' ? 'aspect-[16/9]' : 'aspect-square';

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) {
      return;
    }

    setIsProcessingFeedback(true);

    try {
      const refinements = await refineSlideContent(currentSlide, feedback);

      onUpdateSlide(currentSlide.id, {
        scriptText: refinements.scriptText,
        visualPrompt: refinements.visualPrompt,
        userNotes: feedback,
        isRegeneratingImage: true,
      });

      setFeedback('');
      generateSlideImage(refinements.visualPrompt, aspectRatio)
        .then((imageUrl) => {
          onUpdateSlide(currentSlide.id, { imageUrl, isRegeneratingImage: false });
        })
        .catch((error) => {
          appLogger.error('Falha ao regerar imagem com feedback.', { error, slideId: currentSlide.id });
          onUpdateSlide(currentSlide.id, { isRegeneratingImage: false });
        });
    } catch (error) {
      appLogger.error('Não foi possível aplicar o feedback.', { error });
      window.alert('Falha ao processar feedback. Tente novamente.');
    } finally {
      setIsProcessingFeedback(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/70 p-4">
        <p className="text-sm text-gray-400">
          Slide {currentIndex + 1} de {slides.length}
        </p>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          onClick={onFinish}
        >
          <Mic size={16} /> Ir para gravação
        </button>
      </div>

      <div className="flex flex-1 flex-col md:flex-row">
        <div className="relative flex flex-1 items-center justify-center bg-gray-900 p-4">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className="absolute left-4 z-10 rounded-full bg-black/50 p-2 text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            disabled={currentIndex === slides.length - 1}
            onClick={() => setCurrentIndex((prev) => Math.min(slides.length - 1, prev + 1))}
            className="absolute right-4 z-10 rounded-full bg-black/50 p-2 text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronRight />
          </button>

          <div className={`relative w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-800 shadow-2xl ${arClass}`}>
            {currentSlide.imageUrl ? (
              <img
                src={currentSlide.imageUrl}
                alt="Preview do slide"
                className={`h-full w-full object-cover transition ${currentSlide.isRegeneratingImage ? 'opacity-50 blur-sm' : 'opacity-100'}`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-800 text-gray-500">
                Gerando visual...
              </div>
            )}

            {currentSlide.isRegeneratingImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="animate-spin text-white" size={44} />
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6">
              <p className="text-lg leading-relaxed text-white">{currentSlide.scriptText}</p>
            </div>
          </div>
        </div>

        <aside className="w-full border-l border-gray-800 bg-gray-950 p-4 md:w-96">
          <h3 className="mb-4 text-sm font-semibold text-gray-200">Editor & Feedback</h3>
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-500" htmlFor="scriptText">
                Narração
              </label>
              <textarea
                id="scriptText"
                className="h-32 w-full resize-none rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={currentSlide.scriptText}
                onChange={(event) => onUpdateSlide(currentSlide.id, { scriptText: event.target.value })}
              />
            </div>

            <div className="rounded-2xl border border-blue-900/30 bg-blue-900/10 p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-300">
                <MessageSquare size={14} /> Revisão com IA
              </label>
              <textarea
                className="h-28 w-full resize-none rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Ex.: deixe a imagem mais colorida ou resuma o texto"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                disabled={isProcessingFeedback}
              />
              <button
                type="button"
                onClick={handleFeedbackSubmit}
                disabled={!feedback || isProcessingFeedback}
                className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:bg-gray-700"
              >
                {isProcessingFeedback ? <RefreshCw className="animate-spin" size={16} /> : 'Aplicar feedback' }
              </button>
            </div>

            <div className="text-xs text-gray-500">
              <p className="font-semibold">Prompt visual atual:</p>
              <p className="truncate italic">{currentSlide.visualPrompt}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
