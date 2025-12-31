import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

import {
  VIDEO_ASPECT_RATIOS,
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
  VideoGenerationSnapshot,
  VideoGenerationPayload,
} from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import { runWithConcurrency } from '@/shared/utils/concurrency';
import { blobToDataUrl, dataUrlToBlob } from '@/shared/utils/blob';
import { uuidv4 } from '@/shared/utils/uuid';

const initialProgress: GenerationProgress = {
  total: 0,
  completed: 0,
  currentAction: '',
};

const SNAPSHOT_VERSION = 1 as const;

const STEP_VALUES = Object.values(VIDEO_GENERATION_STEP) as readonly [
  VideoGenerationStep,
  ...VideoGenerationStep[],
];

const slideSnapshotSchema = z.object({
  id: z.string(),
  order: z.number(),
  scriptText: z.string(),
  narrationText: z.string(),
  visualPrompt: z.string(),
  imageUrl: z.string().optional(),
  userNotes: z.string().optional(),
  isRegeneratingImage: z.boolean(),
  audioDataUrl: z.string().optional(),
});

const snapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  timestamp: z.string(),
  projectData: z
    .object({
      topic: z.string().optional(),
      materials: z.string().optional(),
      aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).optional(),
      targetAudience: z.string().optional(),
      promptId: z.string().optional(),
    })
    .partial()
    .passthrough()
    .default({}),
  slides: z.array(slideSnapshotSchema),
  progress: z.object({
    total: z.number(),
    completed: z.number(),
    currentAction: z.string(),
  }),
  step: z.enum(STEP_VALUES),
});

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

  const exportSnapshot = useCallback(async () => {
    const serializedSlides: VideoGenerationSnapshot['slides'] =
      await Promise.all(
        slides.map(async ({ audioBlob, ...rest }) => ({
          ...rest,
          audioDataUrl: audioBlob ? await blobToDataUrl(audioBlob) : undefined,
        })),
      );

    const snapshot: VideoGenerationSnapshot = {
      version: SNAPSHOT_VERSION,
      timestamp: new Date().toISOString(),
      projectData: projectData ?? {},
      slides: serializedSlides,
      progress,
      step,
    };

    return JSON.stringify(snapshot, null, 2);
  }, [slides, projectData, progress, step]);

  const importSnapshot = useCallback(async (fileContent: string) => {
    try {
      const parsed = snapshotSchema.parse(
        JSON.parse(fileContent),
      ) as VideoGenerationSnapshot;

      const hydratedSlides: Slide[] = parsed.slides.map(
        ({ audioDataUrl, ...rest }) => ({
          ...rest,
          audioBlob: audioDataUrl ? dataUrlToBlob(audioDataUrl) : undefined,
        }),
      );

      setProjectData(parsed.projectData ?? {});
      setSlides(hydratedSlides);
      setProgress(parsed.progress);
      setStep(parsed.step);
    } catch (error) {
      appLogger.error('💥 Falha ao importar snapshot de vídeo.', { error });
      throw error;
    }
  }, []);

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
        appLogger.error('💥 Fluxo de geração interrompido.', { error });
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
        exportSnapshot,
        importSnapshot,
        startGeneration,
        startRecording,
        openPreview,
        resetFlow,
        updateSlide,
      },
    }),
    [
      exportSnapshot,
      importSnapshot,
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
