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
} from '@/features/video-generation/api/videoGenerationApi';
import type {
  GenerationProgress,
  ProjectData,
  Slide,
  VideoGenerationPayload,
} from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import { runWithConcurrency } from '@/shared/utils/concurrency';
import { uuidv4 } from '@/shared/utils/uuid';

const initialProgress: GenerationProgress = {
  total: 0,
  completed: 0,
  currentAction: '',
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

  const generateVisuals = useCallback(
    async (slidesToProcess: Slide[], aspectRatio: AspectRatio) => {
      if (slidesToProcess.length === 0) {
        return;
      }

      setStep(VIDEO_GENERATION_STEP.GENERATING_VISUALS);
      setProgress({
        total: slidesToProcess.length,
        completed: 0,
        currentAction: 'Renderizando visuais...',
      });

      let completed = 0;
      await runWithConcurrency(
        slidesToProcess,
        VIDEO_CONFIG.IMAGE_GENERATION_CONCURRENCY_LIMIT,
        async (slide) => {
          try {
            const imageUrl = await generateSlideImage(
              slide.visualPrompt,
              aspectRatio,
            );
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
            appLogger.error('Falha ao gerar imagem.', {
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
              total: slidesToProcess.length,
              completed,
              currentAction: `Renderizando visuais (${completed}/${slidesToProcess.length})...`,
            });
          }
        },
      );
    },
    [],
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
        );

        const preparedSlides: Slide[] = rawSlides.map((slide, index) => ({
          ...slide,
          id: uuidv4(),
          order: index,
          isRegeneratingImage: true,
        }));

        setSlides(preparedSlides);
        await generateVisuals(preparedSlides, payload.aspectRatio);
        setStep(VIDEO_GENERATION_STEP.EDITOR);
      } catch (error) {
        appLogger.error('Fluxo de geração interrompido.', { error });
        setStep(VIDEO_GENERATION_STEP.INPUT);
        setProgress(initialProgress);
        throw error;
      }
    },
    [generateVisuals],
  );

  const startRecording = useCallback(() => {
    setStep(VIDEO_GENERATION_STEP.RECORDING);
  }, []);

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
        startRecording,
        openPreview,
        resetFlow,
        updateSlide,
      },
    }),
    [
      openPreview,
      progress,
      projectData,
      resetFlow,
      slides,
      startGeneration,
      startRecording,
      step,
      updateSlide,
    ],
  );

  return value;
}
