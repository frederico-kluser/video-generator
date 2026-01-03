import { useCallback, useMemo, useState } from 'react';

import {
  VIDEO_CONFIG,
  VIDEO_GENERATION_STEP,
  type AspectRatio,
  type VideoGenerationStep,
} from '@/config/constants/video';
import {
  generateScriptFromMaterials,
  generateSlideImage,
  applyScriptInstructionsToSlides,
} from '@/features/video-generation/api/videoGenerationApi';
import { generateManimSlideAnimation } from '@/features/video-generation/api/manimAnimationApi';
import type {
  GenerationProgress,
  ProjectData,
  Slide,
  SlideEditOperation,
  VideoGenerationPayload,
} from '@/features/video-generation/model/types';
import { createDefaultStyleGuide } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import { runWithConcurrency } from '@/shared/utils/concurrency';
import { uuidv4 } from '@/shared/utils/uuid';

const initialProgress: GenerationProgress = {
  total: 0,
  completed: 0,
  currentAction: '',
};

const createBlankSlide = (order: number): Slide => ({
  id: uuidv4(),
  order,
  scriptText: '',
  narrationText: '',
  visualPrompt: '',
  mathAnimationPrompt: '',
  visualSource: 'image-generation',
  imageUrl: undefined,
  userNotes: undefined,
  audioBlob: undefined,
  isRegeneratingImage: false,
  styleGuide: createDefaultStyleGuide(),
  customAsset: null,
});

const normalizeSlideOrder = (slideList: Slide[]): Slide[] =>
  slideList.map((slide, index) => ({ ...slide, order: index }));

const applySlideOperations = (
  baseSlides: Slide[],
  operations: SlideEditOperation[],
): Slide[] => {
  let next = [...baseSlides];

  const resolveIndex = (list: Slide[], op: SlideEditOperation): number => {
    if (list.length === 0) {
      return -1;
    }
    if (op.slideId) {
      const byId = list.findIndex((slide) => slide.id === op.slideId);
      if (byId !== -1) {
        return byId;
      }
    }
    const clamped = Math.max(0, Math.min(op.targetIndex, list.length - 1));
    return clamped;
  };

  operations.forEach((operation) => {
    switch (operation.action) {
      case 'delete': {
        const index = resolveIndex(next, operation);
        if (index === -1) {
          appLogger.warn('⚠️ Não foi possível remover o slide solicitado.', {
            operation,
          });
          return;
        }
        next = next.filter((_, idx) => idx !== index);
        break;
      }
      case 'update': {
        if (!operation.slide) {
          appLogger.warn('⚠️ Operação de update sem conteúdo ignorada.', {
            operation,
          });
          return;
        }
        const index = resolveIndex(next, operation);
        if (index === -1) {
          appLogger.warn('⚠️ Não foi possível atualizar o slide solicitado.', {
            operation,
          });
          return;
        }
        next = next.map((slide, idx) =>
          idx === index
            ? {
                ...slide,
                scriptText: operation.slide!.scriptText,
                narrationText: operation.slide!.narrationText,
                visualPrompt: operation.slide!.visualPrompt,
              }
            : slide,
        );
        break;
      }
      case 'insert': {
        if (!operation.slide) {
          appLogger.warn('⚠️ Operação de insert sem conteúdo ignorada.', {
            operation,
          });
          return;
        }
        const insertIndex = Math.min(
          Math.max(operation.targetIndex, 0),
          next.length,
        );
        const blank = createBlankSlide(insertIndex);
        const newSlide: Slide = {
          ...blank,
          scriptText: operation.slide.scriptText,
          narrationText: operation.slide.narrationText,
          visualPrompt: operation.slide.visualPrompt,
          isRegeneratingImage: false,
          styleGuide: createDefaultStyleGuide(),
          customAsset: null,
        };
        next = [
          ...next.slice(0, insertIndex),
          newSlide,
          ...next.slice(insertIndex),
        ];
        break;
      }
      default:
        appLogger.warn('⚠️ Ação de edição desconhecida ignorada.', {
          operation,
        });
    }
  });

  return normalizeSlideOrder(next);
};

export function useVideoGeneration() {
  const [step, setStep] = useState<VideoGenerationStep>(
    VIDEO_GENERATION_STEP.INPUT,
  );
  const [projectData, setProjectData] = useState<Partial<ProjectData>>({});
  const [slides, setSlides] = useState<Slide[]>([]);
  const [progress, setProgress] = useState<GenerationProgress>(initialProgress);

  const updateSlide = useCallback((id: string, updates: Partial<Slide>) => {
    setSlides((prev) =>
      prev.map((slide) => (slide.id === id ? { ...slide, ...updates } : slide)),
    );
  }, []);

  const addSlide = useCallback(() => {
    setSlides((prev) => {
      const next = [...prev, createBlankSlide(prev.length)];
      appLogger.info('➕ Slide em branco adicionado na revisão.', {
        total: next.length,
      });
      return normalizeSlideOrder(next);
    });
  }, []);

  const insertSlideAfter = useCallback((index: number) => {
    setSlides((prev) => {
      const next = [...prev];
      const insertIndex = Math.min(Math.max(index + 1, 0), next.length);
      next.splice(insertIndex, 0, createBlankSlide(insertIndex));
      appLogger.info('➕ Slide inserido no roteiro.', {
        position: insertIndex + 1,
        total: next.length,
      });
      return normalizeSlideOrder(next);
    });
  }, []);

  const removeSlide = useCallback((id: string) => {
    setSlides((prev) => {
      const next = prev.filter((slide) => slide.id !== id);
      appLogger.warn('🗑️ Slide removido durante a revisão.', {
        remaining: next.length,
      });
      return normalizeSlideOrder(next);
    });
  }, []);

  const moveSlide = useCallback((id: string, direction: 'up' | 'down') => {
    setSlides((prev) => {
      const currentIndex = prev.findIndex((slide) => slide.id === id);
      if (currentIndex === -1) {
        return prev;
      }
      const targetIndex =
        direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [slideToMove] = next.splice(currentIndex, 1);
      if (!slideToMove) {
        return prev;
      }
      next.splice(targetIndex, 0, slideToMove);
      appLogger.info('🔀 Slides reordenados.', {
        from: currentIndex + 1,
        to: targetIndex + 1,
      });
      return normalizeSlideOrder(next);
    });
  }, []);

  const generateVisuals = useCallback(
    async (slidesToProcess: Slide[], aspectRatio: AspectRatio) => {
      if (slidesToProcess.length === 0) {
        return;
      }

      setStep(VIDEO_GENERATION_STEP.GENERATING_VISUALS);

      const totalSlides = slidesToProcess.length;
      const slidesWithCustomAsset = slidesToProcess.filter(
        (slide) => Boolean(slide.customAsset),
      );
      const slidesNeedingGeneration = slidesToProcess.filter(
        (slide) =>
          !slide.customAsset && slide.visualSource !== 'manual-upload',
      );
      const imageSlides = slidesNeedingGeneration.filter(
        (slide) => slide.visualSource === 'image-generation',
      );
      const mathSlides = slidesNeedingGeneration.filter(
        (slide) => slide.visualSource === 'math-video',
      );

      if (slidesWithCustomAsset.length > 0) {
        const customAssetMap = new Map(
          slidesWithCustomAsset.map((slide) => [slide.id, slide.customAsset]),
        );

        setSlides((prev) =>
          prev.map((current) => {
            if (!customAssetMap.has(current.id)) {
              return current;
            }

            const asset = customAssetMap.get(current.id);
            return {
              ...current,
              imageUrl:
                asset?.type === 'image' ? asset.previewUrl : current.imageUrl,
              isRegeneratingImage: false,
            };
          }),
        );

        appLogger.info('🖼️ Aplicando assets enviados pelo usuário.', {
          slides: slidesWithCustomAsset.length,
        });
      }

      let completed = slidesWithCustomAsset.length;

      setProgress({
        total: totalSlides,
        completed,
        currentAction: `Renderizando visuais (${completed}/${totalSlides})...`,
      });

      if (slidesNeedingGeneration.length === 0) {
        setProgress({
          total: totalSlides,
          completed,
          currentAction: 'Visuais prontos.',
        });
        return;
      }

      if (imageSlides.length > 0) {
        await runWithConcurrency(
          imageSlides,
          VIDEO_CONFIG.IMAGE_GENERATION_CONCURRENCY_LIMIT,
          async (slide) => {
            try {
              const imageUrl = await generateSlideImage(slide, aspectRatio);
              setSlides((prev) =>
                prev.map((current) =>
                  current.id === slide.id
                    ? {
                        ...current,
                        imageUrl,
                        isRegeneratingImage: false,
                      }
                    : current,
                ),
              );
            } catch (error) {
              appLogger.error('💥 Falha ao gerar imagem.', {
                error,
                slideId: slide.id,
              });
              setSlides((prev) =>
                prev.map((current) =>
                  current.id === slide.id
                    ? {
                        ...current,
                        isRegeneratingImage: false,
                      }
                    : current,
                ),
              );
            } finally {
              completed += 1;
              setProgress({
                total: totalSlides,
                completed,
                currentAction: `Renderizando visuais (${completed}/${totalSlides})...`,
              });
            }
          },
        );
      }

      if (mathSlides.length > 0) {
        await runWithConcurrency(
          mathSlides,
          VIDEO_CONFIG.MATH_VIDEO_CONCURRENCY_LIMIT,
          async (slide) => {
            try {
              const asset = await generateManimSlideAnimation({
                slide,
                projectData,
                aspectRatio,
              });
              setSlides((prev) =>
                prev.map((current) =>
                  current.id === slide.id
                    ? {
                        ...current,
                        customAsset: asset,
                        isRegeneratingImage: false,
                      }
                    : current,
                ),
              );
            } catch (error) {
              appLogger.error('💥 Falha ao gerar vídeo matemático.', {
                error,
                slideId: slide.id,
              });
              setSlides((prev) =>
                prev.map((current) =>
                  current.id === slide.id
                    ? {
                        ...current,
                        isRegeneratingImage: false,
                      }
                    : current,
                ),
              );
            } finally {
              completed += 1;
              setProgress({
                total: totalSlides,
                completed,
                currentAction: `Renderizando visuais (${completed}/${totalSlides})...`,
              });
            }
          },
        );
      }

      setProgress({
        total: totalSlides,
        completed: totalSlides,
        currentAction: 'Visuais prontos.',
      });
    },
    [projectData],
  );

  const startGeneration = useCallback(
    async (payload: VideoGenerationPayload) => {
      try {
        setProjectData(payload);
        setStep(VIDEO_GENERATION_STEP.GENERATING_SCRIPT);
        setProgress({
          total: 1,
          completed: 0,
          currentAction: 'Escrevendo roteiro pedagógico...',
        });

        const rawSlides = await generateScriptFromMaterials(
          payload.topic,
          payload.materials,
          payload.targetAudience ?? VIDEO_CONFIG.DEFAULT_AUDIENCE,
          payload.promptId,
          undefined,
          { isMathProject: payload.isMathProject },
        );

        const preparedSlides = normalizeSlideOrder(
          rawSlides.map((slide, index) => ({
            ...slide,
            id: uuidv4(),
            order: index,
            mathAnimationPrompt: slide.mathAnimationPrompt ?? '',
            visualSource: slide.visualSource ?? 'image-generation',
            isRegeneratingImage: false,
            styleGuide: slide.styleGuide ?? createDefaultStyleGuide(),
            customAsset: null,
          })),
        );

        setSlides(preparedSlides);
        setProgress({
          total: preparedSlides.length,
          completed: preparedSlides.length,
          currentAction: 'Roteiro pronto para revisão.',
        });
        appLogger.info('📋 Roteiro pronto para revisão manual.', {
          slides: preparedSlides.length,
        });
        setStep(VIDEO_GENERATION_STEP.SCRIPT_REVIEW);
      } catch (error) {
        appLogger.error('💥 Fluxo de geração interrompido.', { error });
        setStep(VIDEO_GENERATION_STEP.INPUT);
        setProgress(initialProgress);
        throw error;
      }
    },
    [],
  );

  const regenerateScript = useCallback(
    async (instructions: string) => {
      if (
        !projectData.topic ||
        !projectData.materials ||
        !projectData.promptId
      ) {
        const message = 'Projeto incompleto para refinamento do roteiro.';
        appLogger.error(message, { projectData });
        throw new Error(message);
      }

      const targetAudience =
        projectData.targetAudience ?? VIDEO_CONFIG.DEFAULT_AUDIENCE;

      try {
        setStep(VIDEO_GENERATION_STEP.GENERATING_SCRIPT);
        setProgress({
          total: 1,
          completed: 0,
          currentAction: 'Ajustando roteiro com suas instruções...',
        });

        if (slides.length > 0) {
          const plan = await applyScriptInstructionsToSlides({
            slides,
            instructions,
            topic: projectData.topic,
            materials: projectData.materials,
            targetAudience,
          });

          if (plan.operations.length === 0) {
            appLogger.info('ℹ️ Nenhuma alteração retornada para o roteiro.', {
              summary: plan.summary,
            });
            setProgress({
              total: slides.length,
              completed: slides.length,
              currentAction: 'Nenhuma alteração aplicada.',
            });
            setStep(VIDEO_GENERATION_STEP.SCRIPT_REVIEW);
            return;
          }

          setSlides((prev) => applySlideOperations(prev, plan.operations));
          setProgress({
            total: slides.length,
            completed: slides.length,
            currentAction: 'Roteiro atualizado com sucesso.',
          });
          appLogger.info('📝 Roteiro ajustado com instruções pontuais.', {
            summary: plan.summary,
            operations: plan.operations.length,
          });
          setStep(VIDEO_GENERATION_STEP.SCRIPT_REVIEW);
          return;
        }

        const rawSlides = await generateScriptFromMaterials(
          projectData.topic,
          projectData.materials,
          targetAudience,
          projectData.promptId,
          instructions,
          { isMathProject: projectData.isMathProject },
        );

        const preparedSlides = normalizeSlideOrder(
          rawSlides.map((slide, index) => ({
            ...slide,
            id: uuidv4(),
            order: index,
            mathAnimationPrompt: slide.mathAnimationPrompt ?? '',
            visualSource: slide.visualSource ?? 'image-generation',
            isRegeneratingImage: false,
            styleGuide: slide.styleGuide ?? createDefaultStyleGuide(),
            customAsset: null,
          })),
        );

        setSlides(preparedSlides);
        setProgress({
          total: preparedSlides.length,
          completed: preparedSlides.length,
          currentAction: 'Roteiro atualizado com sucesso.',
        });
        appLogger.info('📝 Roteiro regenerado com instruções personalizadas.', {
          slides: preparedSlides.length,
        });
        setStep(VIDEO_GENERATION_STEP.SCRIPT_REVIEW);
      } catch (error) {
        appLogger.error('💥 Falha ao refinar o roteiro.', { error });
        setStep(VIDEO_GENERATION_STEP.SCRIPT_REVIEW);
        throw error;
      }
    },
    [projectData, slides],
  );

  const startRecording = useCallback(() => {
    setStep(VIDEO_GENERATION_STEP.RECORDING);
  }, []);

  const proceedToVisualEditing = useCallback(async () => {
    if (!projectData.aspectRatio) {
      const message = 'Aspect ratio ausente para gerar visuais.';
      appLogger.error(message, { projectData });
      throw new Error(message);
    }

    const slidesReady = normalizeSlideOrder(
      slides.map((slide, index) => {
        const shouldAutoGenerate =
          slide.visualSource !== 'manual-upload' && !slide.customAsset;
        return {
          ...slide,
          order: index,
          isRegeneratingImage: shouldAutoGenerate,
        };
      }),
    );

    try {
      setSlides(slidesReady);
      appLogger.info('🎨 Iniciando geração de visuais após revisão.', {
        slides: slidesReady.length,
      });
      await generateVisuals(slidesReady, projectData.aspectRatio);
      setStep(VIDEO_GENERATION_STEP.EDITOR);
    } catch (error) {
      appLogger.error('💥 Falha ao gerar visuais após revisão.', { error });
      setStep(VIDEO_GENERATION_STEP.SCRIPT_REVIEW);
      throw error;
    }
  }, [generateVisuals, projectData, slides]);

  const openPreview = useCallback(() => {
    setStep(VIDEO_GENERATION_STEP.PREVIEW);
  }, []);

  const resetFlow = useCallback(() => {
    setStep(VIDEO_GENERATION_STEP.INPUT);
    setSlides([]);
    setProjectData({});
    setProgress(initialProgress);
  }, []);

  const value = useMemo(
    () => ({
      step,
      projectData,
      slides,
      progress,
      actions: {
        startGeneration,
        regenerateScript,
        proceedToVisualEditing,
        startRecording,
        openPreview,
        resetFlow,
        updateSlide,
        addSlide,
        insertSlideAfter,
        removeSlide,
        moveSlide,
      },
    }),
    [
      addSlide,
      insertSlideAfter,
      moveSlide,
      openPreview,
      proceedToVisualEditing,
      progress,
      projectData,
      regenerateScript,
      resetFlow,
      removeSlide,
      slides,
      startGeneration,
      startRecording,
      step,
      updateSlide,
    ],
  );

  return value;
}
