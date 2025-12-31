import { Type } from '@google/genai';
import { AspectRatio } from '@/config/constants/video';
import { PEDAGOGICAL_SYSTEM_INSTRUCTION } from '@/config/constants/pedagogy';
import { Slide } from '@/features/video-generation/model/types';
import { ApiError } from '@/shared/errors/ApiError';
import { getGenAiClient } from '@/shared/lib/genAiClient';
import { appLogger } from '@/shared/logging/logger';

const SCRIPT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

export async function generateScriptFromMaterials(
  topic: string,
  materials: string,
  audience: string,
): Promise<Omit<Slide, 'id' | 'order' | 'isRegeneratingImage'>[]> {
  appLogger.info('Iniciando geração de roteiro pedagógico.', { topic, audience });
  const client = getGenAiClient();

  const prompt = `
    Topic: ${topic}
    Target Audience: ${audience}
    Source Materials: ${materials}

    Generate a video script broken down into slides. Return ONLY JSON.
  `;

  const response = await client.models.generateContent({
    model: SCRIPT_MODEL,
    contents: prompt,
    config: {
      systemInstruction: PEDAGOGICAL_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            scriptText: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
          },
          required: ['scriptText', 'visualPrompt'],
        },
      },
    },
  });

  const text = response.text;
  if (!text) {
    const message = 'A API não retornou conteúdo para o roteiro.';
    appLogger.error(message);
    throw new ApiError(message, 502);
  }

  const parsed = JSON.parse(text);
  appLogger.info('Roteiro gerado com sucesso.', { slides: parsed.length });
  return parsed;
}

export async function generateSlideImage(visualPrompt: string, aspectRatio: AspectRatio): Promise<string> {
  const client = getGenAiClient();
  appLogger.info('Solicitando geração de imagem.', { aspectRatio });

  const enhancedPrompt = `
    Create an educational illustration.
    Style: Clean vector art, flat design, minimalist background, vibrant colors.
    Subject: ${visualPrompt}
    Aspect Ratio: ${aspectRatio}
    Avoid embedding text into the image.
  `;

  const response = await client.models.generateContent({
    model: IMAGE_MODEL,
    contents: enhancedPrompt,
  });

  const candidates = response.candidates ?? [];
  for (const candidate of candidates) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType ?? 'image/png';
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  const message = 'Não foi possível gerar a imagem para o slide.';
  appLogger.error(message);
  throw new ApiError(message, 502);
}

export async function refineSlideContent(currentSlide: Slide, feedback: string) {
  const client = getGenAiClient();
  const prompt = `
    Current Script: "${currentSlide.scriptText}"
    Current Visual Prompt: "${currentSlide.visualPrompt}"
    User Feedback/Notes: "${feedback}"

    Based on the feedback, REWRITE the script and the visual prompt.
    If the feedback focuses on visuals, update visualPrompt significantly.
    If the feedback focuses on text, update scriptText.

    Return JSON.
  `;

  const response = await client.models.generateContent({
    model: SCRIPT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scriptText: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
        },
        required: ['scriptText', 'visualPrompt'],
      },
    },
  });

  const text = response.text;
  if (!text) {
    const message = 'A API não retornou refinamentos.';
    appLogger.error(message);
    throw new ApiError(message, 502);
  }

  return JSON.parse(text) as { scriptText: string; visualPrompt: string };
}
