import { useEffect, useState } from 'react';

import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Film,
  ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import { MANIM_API_BASE_URL } from '@/config/constants/manim';
import { type AspectRatio } from '@/config/constants/video';
import { generateManimSlideAnimation } from '@/features/video-generation/api/manimAnimationApi';
import {
  generateSlideImage,
  refineSlideContent,
} from '@/features/video-generation/api/videoGenerationApi';
import type { ProjectData, Slide } from '@/features/video-generation/model/types';
import { VoiceInputButton } from '@/shared/components/VoiceInput/VoiceInputButton';
import { appLogger } from '@/shared/logging/logger';
import { mergeTranscript } from '@/shared/utils/transcription';

type EditorStepProps = {
  slides: Slide[];
  aspectRatio: AspectRatio;
  projectData: Partial<ProjectData>;
  onUpdateSlide: (id: string, updates: Partial<Slide>) => void;
  onFinish: () => void;
};

export function EditorStep({
  slides,
  aspectRatio,
  projectData,
  onUpdateSlide,
  onFinish,
}: EditorStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isProcessingFeedback, setIsProcessingFeedback] = useState(false);
  const [isGeneratingAnimation, setIsGeneratingAnimation] = useState(false);
  const [animationError, setAnimationError] = useState<string | null>(null);

  const currentSlide = slides[currentIndex];
  const hasCustomVideo = currentSlide?.customAsset?.type === 'video';

  const renderVisualPreview = () => {
    const asset = currentSlide?.customAsset;
    const visualSource = currentSlide?.visualSource ?? 'image-generation';

    const renderVideo = (src: string) => (
      <video
        key={src}
        src={src}
        className={`h-full w-full object-cover transition-all duration-500 ${
          currentSlide?.isRegeneratingImage
            ? 'scale-105 opacity-50 blur-md'
            : 'scale-100 opacity-100'
        }`}
        autoPlay
        loop
        muted
        playsInline
      />
    );

    const renderImage = (src: string) => (
      <img
        src={src}
        alt="Preview do slide"
        className={`h-full w-full object-cover transition-all duration-500 ${
          currentSlide?.isRegeneratingImage
            ? 'scale-105 opacity-50 blur-md'
            : 'scale-100 opacity-100'
        }`}
      />
    );

    if (visualSource === 'manual-upload') {
      if (asset?.previewUrl) {
        return asset.type === 'video'
          ? renderVideo(asset.previewUrl)
          : renderImage(asset.previewUrl);
      }

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-dark-800 text-white/50">
          <UploadCloud size={40} className="text-primary-300" />
          <span>Envie um asset manual para este slide.</span>
        </div>
      );
    }

    if (visualSource === 'math-video') {
      if (asset?.type === 'video' && asset.previewUrl) {
        return renderVideo(asset.previewUrl);
      }

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-dark-800 text-white/50">
          <Film size={40} className="text-indigo-300" />
          <span>O vídeo matemático será gerado na próxima etapa.</span>
        </div>
      );
    }

    const imageSrc =
      asset?.type === 'image' && asset.previewUrl
        ? asset.previewUrl
        : currentSlide?.imageUrl;

    if (imageSrc) {
      return renderImage(imageSrc);
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-dark-800 text-white/40">
        <ImageIcon size={48} className="animate-pulse" />
        <span>Gerando visual...</span>
      </div>
    );
  };

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

  const handleGenerateAnimation = async () => {
    if (!currentSlide) {
      return;
    }

    setAnimationError(null);
    setIsGeneratingAnimation(true);
    onUpdateSlide(currentSlide.id, { isRegeneratingImage: true });

    try {
      const asset = await generateManimSlideAnimation({
        slide: currentSlide,
        projectData,
        aspectRatio,
      });

      onUpdateSlide(currentSlide.id, {
        customAsset: asset,
        isRegeneratingImage: false,
      });
    } catch (error) {
      appLogger.error('Não foi possível gerar a animação 3Blue1Brown.', {
        error,
        slideId: currentSlide.id,
      });
      setAnimationError(
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao gerar animação.',
      );
      window.alert(
        'Não foi possível gerar a animação 3Blue1Brown. Consulte o console para detalhes.',
      );
      onUpdateSlide(currentSlide.id, { isRegeneratingImage: false });
    } finally {
      setIsGeneratingAnimation(false);
    }
  };


  return (
    <div className="flex min-h-screen flex-col pt-12 sm:pt-14">
      {/* Header */}
      <div className="glass-card mx-2 mb-3 flex items-center justify-between rounded-lg border-dark-700 px-3 py-2 sm:mx-4 sm:mb-4 sm:rounded-xl sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden items-center gap-1.5 sm:flex sm:gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-1.5 rounded-full transition-all duration-300 sm:h-2 ${
                  index === currentIndex
                    ? 'w-4 bg-primary-500 sm:w-6'
                    : index < currentIndex
                      ? 'w-1.5 bg-primary-500/50 sm:w-2'
                      : 'w-1.5 bg-dark-600 hover:bg-dark-500 sm:w-2'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-white/50 sm:text-sm">
            {currentIndex + 1}/{slides.length}
          </span>
        </div>
        <button type="button" className="btn-accent px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm" onClick={onFinish}>
          <Mic size={14} className="sm:h-[18px] sm:w-[18px]" />
          <span className="hidden sm:inline">Ir para gravação</span>
          <span className="sm:hidden">Gravar</span>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-2 pb-3 sm:gap-4 sm:px-4 sm:pb-4 lg:flex-row">
        {/* Slide Preview */}
        <div className="relative flex flex-1 items-center justify-center">
          {/* Navigation buttons */}
          <button
            type="button"
            aria-label="Slide anterior"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className="btn-icon absolute left-1 z-10 h-8 w-8 disabled:opacity-30 sm:left-2 sm:h-10 sm:w-10"
          >
            <ChevronLeft size={16} className="sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo slide"
            disabled={currentIndex === slides.length - 1}
            onClick={() =>
              setCurrentIndex((prev) => Math.min(slides.length - 1, prev + 1))
            }
            className="btn-icon absolute right-1 z-10 h-8 w-8 disabled:opacity-30 sm:right-2 sm:h-10 sm:w-10"
          >
            <ChevronRight size={16} className="sm:h-5 sm:w-5" />
          </button>

          {/* Slide container */}
          <div
            className={`relative w-full max-w-3xl overflow-hidden rounded-xl border border-dark-700 bg-dark-900 shadow-2xl sm:rounded-2xl ${arClass}`}
          >
            {renderVisualPreview()}

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
            <div className="absolute bottom-0 left-0 right-0 space-y-2 bg-gradient-to-t from-black via-black/80 to-transparent p-3 sm:space-y-3 sm:p-4 md:p-6">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-white/60 sm:text-[11px]">
                  Briefing do slide
                </p>
                <p className="text-sm leading-relaxed text-white drop-shadow-lg sm:text-base">
                  {currentSlide.scriptText}
                </p>
              </div>
              <div className="rounded-lg bg-dark-900/80 p-2.5 sm:p-3 md:p-4">
                <p className="text-[10px] uppercase tracking-wide text-primary-300 sm:text-[11px]">
                  Texto para narrar
                </p>
                <p className="text-base font-semibold leading-relaxed text-white sm:text-lg">
                  {currentSlide.narrationText}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-[360px] xl:w-[400px]">
          <div className="glass-card h-full space-y-3 p-3 sm:space-y-4 sm:p-4 md:space-y-5 md:p-5">
            <div className="flex items-center gap-1.5 text-base font-semibold text-white sm:gap-2 sm:text-lg">
              <Edit3 size={16} className="text-primary-400 sm:h-[18px] sm:w-[18px]" />
              Editor
            </div>

            {/* Script editor */}
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5 sm:space-y-2">
                <label className="label text-xs sm:text-sm" htmlFor="scriptText">
                  Briefing / instruções
                </label>
                <div className="flex items-start gap-2 sm:gap-3">
                  <textarea
                    id="scriptText"
                    className="input min-h-[80px] flex-1 resize-none text-xs sm:min-h-[100px] sm:text-sm md:min-h-[120px]"
                    value={currentSlide.scriptText}
                    onChange={(event) =>
                      onUpdateSlide(currentSlide.id, {
                        scriptText: event.target.value,
                      })
                    }
                  />
                  <VoiceInputButton
                    size="sm"
                    className="mt-0.5 shrink-0 sm:mt-1"
                    ariaLabel="Ditado para o briefing do slide"
                    onTranscription={(text) =>
                      onUpdateSlide(currentSlide.id, {
                        scriptText: mergeTranscript(currentSlide.scriptText, text),
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <label className="label text-xs sm:text-sm" htmlFor="narrationText">
                  Texto para narrar
                </label>
                <div className="flex items-start gap-2 sm:gap-3">
                  <textarea
                    id="narrationText"
                    className="input min-h-[60px] flex-1 resize-none text-xs sm:min-h-[80px] sm:text-sm md:min-h-[100px]"
                    value={currentSlide.narrationText}
                    onChange={(event) =>
                      onUpdateSlide(currentSlide.id, {
                        narrationText: event.target.value,
                      })
                    }
                  />
                  <VoiceInputButton
                    size="sm"
                    className="mt-0.5 shrink-0 sm:mt-1"
                    ariaLabel="Ditado para o texto literal"
                    onTranscription={(text) =>
                      onUpdateSlide(currentSlide.id, {
                        narrationText: mergeTranscript(
                          currentSlide.narrationText,
                          text,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* AI Feedback */}
            <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-3 sm:rounded-xl sm:p-4">
              <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary-300 sm:mb-3 sm:gap-2 sm:text-sm">
                <Sparkles size={14} className="animate-pulse sm:h-4 sm:w-4" />
                Revisão com IA
              </label>
              <div className="flex items-start gap-2 sm:gap-3">
                <textarea
                  className="input min-h-[60px] flex-1 resize-none border-primary-500/20 bg-dark-800/50 text-xs focus:border-primary-500/40 sm:min-h-[80px] sm:text-sm md:min-h-[100px]"
                  placeholder="Ex.: imagem mais colorida, resuma texto..."
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  disabled={isProcessingFeedback}
                />
                <VoiceInputButton
                  size="sm"
                  className="mt-0.5 shrink-0 sm:mt-1"
                  ariaLabel="Ditado para o feedback da IA"
                  disabled={isProcessingFeedback}
                  onTranscription={(text) => setFeedback(text)}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleFeedbackSubmit()}
                disabled={!feedback || isProcessingFeedback}
                className="btn-primary mt-2.5 w-full sm:mt-3"
              >
                {isProcessingFeedback ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Processando...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} className="sm:h-4 sm:w-4" />
                    Aplicar
                  </>
                )}
              </button>
            </div>

            {/* 3Blue1Brown animation */}
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 sm:rounded-xl sm:p-4">
              <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-200 sm:mb-3 sm:gap-2 sm:text-sm">
                <Film size={14} className="text-indigo-300 sm:h-4 sm:w-4" />
                Animação 3Blue1Brown
              </label>
              <p className="text-[11px] leading-relaxed text-indigo-100/70 sm:text-xs">
                Gere um clipe Manim no estilo 3Blue1Brown usando a API local em{' '}
                <span className="font-semibold text-indigo-100">{MANIM_API_BASE_URL}</span>.
                O vídeo substitui o visual do slide quando finalizado.
              </p>
              <button
                type="button"
                onClick={() => void handleGenerateAnimation()}
                disabled={isGeneratingAnimation}
                className="btn-accent mt-2.5 w-full justify-center sm:mt-3"
              >
                {isGeneratingAnimation ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Gerando...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Film size={14} className="sm:h-4 sm:w-4" />
                    {hasCustomVideo ? 'Substituir animação' : 'Gerar animação'}
                  </>
                )}
              </button>
              {animationError && (
                <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-100 sm:px-3 sm:py-2 sm:text-xs">
                  {animationError}
                </p>
              )}
            </div>

            {/* Visual prompt info */}
            <div className="hidden rounded-lg bg-dark-800/50 p-2.5 sm:block sm:p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-white/50 sm:gap-2 sm:text-xs">
                <MessageSquare size={10} className="sm:h-3 sm:w-3" />
                Prompt visual
              </div>
              <p className="line-clamp-2 text-[10px] italic text-white/40 sm:text-xs">
                {currentSlide.visualPrompt}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
