import {
  MANIM_API_BASE_URL,
  MANIM_RESOLUTION_BY_ASPECT_RATIO,
} from '@/config/constants/manim';
import type { AspectRatio } from '@/config/constants/video';
import { MANIM_PROMPT_PREAMBLE } from '@/services/promptLibrary';
import type {
  ProjectData,
  Slide,
  SlideCustomAsset,
} from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import { readVideoDurationMs } from '@/shared/utils/media';
import { uuidv4 } from '@/shared/utils/uuid';

interface ManimVideoResponse {
  success: boolean;
  video_base64?: string;
  scene_name?: string;
  error?: string;
  render_logs?: string;
}

const truncate = (value?: string, limit = 600): string => {
  if (!value) {
    return '';
  }

  return value.length > limit ? `${value.slice(0, limit)}…` : value;
};

const buildDescriptionPrompt = (
  slide: Slide,
  projectData: Partial<ProjectData>,
): string => {
  const topic = projectData.topic ?? 'Tema ainda não definido';
  const targetAudience = projectData.targetAudience ?? 'Profissionais';
  const materials = truncate(projectData.materials, 400);

  const sections = [
    MANIM_PROMPT_PREAMBLE,
    '--- CONTEXTO DO PROJETO ---',
    `Tópico macro: ${topic}`,
    `Público-alvo: ${targetAudience}`,
    materials ? `Referências principais: ${materials}` : null,
    '--- SLIDE ATUAL ---',
    `Objetivo pedagógico: ${truncate(slide.scriptText, 500) || 'Adicionar roteiro'}`,
    `Texto narrado: ${truncate(slide.narrationText, 400) || 'Narrativa será gravada posteriormente'}`,
    `Brief visual: ${truncate(slide.visualPrompt, 300) || 'Use metáforas geométricas para explicar a ideia.'}`,
    slide.userNotes ? `Notas do professor: ${truncate(slide.userNotes, 300)}` : null,
    '--- DIRETRIZES DE EXECUÇÃO ---',
    '• Prepare uma cena de 6 a 12 segundos, com abertura, transformação principal e fechamento com foco na ideia central.',
    '• Prefira elementos geométricos simples, NumberPlane, VGroups e Trace, destacando cores principais do 3Blue1Brown.',
    '• Inclua labels curtas em MathTex/Text quando necessário e mantenha a câmera suave (usar self.play(CameraFrame.animate... quando fizer sentido).',
    '• Finalize com self.wait(1) congelando a composição final para ser usada em um slide.',
  ];

  return sections.filter(Boolean).join('\n');
};

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
};

export async function generateManimSlideAnimation(params: {
  slide: Slide;
  projectData: Partial<ProjectData>;
  aspectRatio: AspectRatio;
}): Promise<SlideCustomAsset> {
  const { slide, projectData, aspectRatio } = params;
  const userDescription = slide.mathAnimationPrompt?.trim();
  const description =
    userDescription && userDescription.length > 0
      ? userDescription
      : buildDescriptionPrompt(slide, projectData);
  const resolution =
    MANIM_RESOLUTION_BY_ASPECT_RATIO[aspectRatio] ??
    MANIM_RESOLUTION_BY_ASPECT_RATIO['16:9'];

  appLogger.info('🎬 Enviando slide para animação 3Blue1Brown.', {
    slideId: slide.id,
    aspectRatio,
    width: resolution.width,
    height: resolution.height,
  });

  const response = await fetch(`${MANIM_API_BASE_URL}/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description,
      width: resolution.width,
      height: resolution.height,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Falha ao chamar Manim API (${response.status}): ${errorBody || 'sem detalhes'}`,
    );
  }

  const payload = (await response.json()) as ManimVideoResponse;

  if (!payload.success || !payload.video_base64) {
    throw new Error(payload.error || 'Manim API retornou falha sem detalhes.');
  }

  const videoBlob = base64ToBlob(payload.video_base64, 'video/mp4');
  const fileName = `${payload.scene_name ?? `Slide_${slide.order + 1}`}.mp4`;
  const videoFile = new File([videoBlob], fileName, { type: 'video/mp4' });
  const objectUrl = URL.createObjectURL(videoFile);

  const durationMs = await readVideoDurationMs(objectUrl);

  const asset: SlideCustomAsset = {
    id: uuidv4(),
    type: 'video',
    name: fileName,
    previewUrl: objectUrl,
    sourceUrl: objectUrl,
    file: videoFile,
    durationMs: durationMs ?? undefined,
  };

  appLogger.info('✅ Animação 3Blue1Brown pronta.', {
    slideId: slide.id,
    scene: payload.scene_name,
    durationMs: asset.durationMs,
  });

  return asset;
}
