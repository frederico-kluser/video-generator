import OpenAI from 'openai';
import { z } from 'zod';

import {
  IMAGE_SIZE_BY_ASPECT_RATIO,
  type ImageAspectRatio,
} from '@/config/constants/imageGeneration';
import {
  type ContentBlock,
  type RefinedContent,
  RefinedContentSchema,
  type Script,
  ScriptSchema,
  type Slide,
  SlideSchema,
} from '@/schemas/eduScriptSchemas';
import type { SlideEditOperation } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import {
  SCRIPT_GENERATION_SYSTEM_PROMPT,
  SLIDE_EDIT_SYSTEM_PROMPT,
  SLIDE_FEEDBACK_SYSTEM_PROMPT,
  buildRefineContentSystemPrompt,
  buildRefineContentUserPrompt,
  buildScriptGenerationUserPrompt,
  buildSlideEditUserPrompt,
  buildSlideFeedbackUserPrompt,
  buildSlideImagePrompt,
} from '@/services/promptLibrary';

// =====================================================
// CONFIGURAÇÃO DOS CLIENTES
// =====================================================
const resolveApiKey = (): string => {
  // Prioridade: localStorage > variável de ambiente do servidor
  if (typeof window !== 'undefined') {
    const storedKey = localStorage.getItem('grava:openai-api-key');
    if (storedKey) {
      return storedKey;
    }
  }

  const serverKey =
    typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : undefined;

  if (!serverKey) {
    const message =
      'Chave OpenAI não configurada. Por favor, configure sua chave nas configurações.';
    appLogger.error(message);
    throw new Error(message);
  }

  return serverKey;
};

const truncateForPrompt = (text: string, maxLength = 900): string => {
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

const scriptJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    targetAudience: {
      type: 'string',
      enum: [
        'elementary',
        'middleSchool',
        'highSchool',
        'college',
        'professional',
      ],
    },
    estimatedDuration: { type: 'number' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          layout: {
            type: 'string',
            enum: ['title', 'content', 'twoColumn', 'imageLeft', 'imageRight'],
          },
          content: {
            type: 'array',
            minItems: 1,
            items: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', const: 'text' },
                    content: { type: 'string' },
                    style: {
                      type: 'string',
                      enum: ['heading', 'subheading', 'body', 'caption'],
                    },
                  },
                  required: ['type', 'content', 'style'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', const: 'bulletList' },
                    items: {
                      type: 'array',
                      minItems: 1,
                      items: {
                        type: 'object',
                        properties: {
                          text: { type: 'string' },
                          indent: {
                            type: 'number',
                            minimum: 0,
                            maximum: 2,
                          },
                        },
                        required: ['text', 'indent'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['type', 'items'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', const: 'imagePlaceholder' },
                    description: { type: 'string' },
                    alt: { type: 'string' },
                  },
                  required: ['type', 'description', 'alt'],
                  additionalProperties: false,
                },
              ],
            },
          },
          speakerNotes: { type: ['string', 'null'] },
          narrationText: { type: 'string' },
          duration: { type: ['number', 'null'] },
        },
        required: [
          'id',
          'title',
          'layout',
          'content',
          'speakerNotes',
          'narrationText',
          'duration',
        ],
        additionalProperties: false,
      },
    },
    keywords: { type: 'array', items: { type: 'string' } },
    isMathProject: { type: 'boolean' },
  },
  required: [
    'title',
    'description',
    'targetAudience',
    'estimatedDuration',
    'slides',
    'keywords',
  ],
  additionalProperties: false,
} as const;

const refinedContentJsonSchema = {
  type: 'object',
  properties: {
    originalText: { type: 'string' },
    refinedText: { type: 'string' },
    improvements: { type: 'array', items: { type: 'string' } },
    readabilityScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
    },
  },
  required: ['originalText', 'refinedText', 'improvements', 'readabilityScore'],
  additionalProperties: false,
} as const;

const slideRefinementJsonSchema = {
  type: 'object',
  properties: {
    scriptText: { type: 'string' },
    narrationText: { type: 'string' },
    visualPrompt: { type: 'string' },
  },
  required: ['scriptText', 'narrationText', 'visualPrompt'],
  additionalProperties: false,
} as const;

const slideEditOperationJsonSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['insert', 'update', 'delete'] },
    targetIndex: { type: 'integer', minimum: 0 },
    slideId: { type: 'string' },
    reason: { type: 'string' },
    slide: {
      type: 'object',
      properties: {
        scriptText: { type: 'string' },
        narrationText: { type: 'string' },
        visualPrompt: { type: 'string' },
      },
      required: ['scriptText', 'narrationText', 'visualPrompt'],
      additionalProperties: false,
    },
  },
  required: ['action', 'targetIndex'],
  additionalProperties: false,
} as const;

const slideEditPlanJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    operations: {
      type: 'array',
      items: slideEditOperationJsonSchema,
    },
  },
  required: ['summary', 'operations'],
  additionalProperties: false,
} as const;

/**
 * Cria e retorna uma instância do cliente OpenAI com a chave atual.
 * Sempre obtém a chave mais recente do localStorage ou variáveis de ambiente.
 */
const getOpenAIClient = (): OpenAI => {
  const apiKey = resolveApiKey();
  return new OpenAI({
    apiKey,
    timeout: 60_000,
    maxRetries: 3,
    dangerouslyAllowBrowser: true,
  });
};

// =====================================================
// TIPOS DE ERRO CUSTOMIZADOS
// =====================================================
export class OpenAIServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'OpenAIServiceError';
  }
}

// =====================================================
// FUNÇÃO 1: generateScriptFromMaterials
// =====================================================
export async function generateScriptFromMaterials(
  materials: string,
  options: {
    topic: string;
    targetAudience: Script['targetAudience'];
    desiredDuration: number;
    style?: 'formal' | 'casual' | 'engaging';
    revisionInstructions?: string;
    preferUserLength?: boolean;
  },
): Promise<Script> {
  const slideCountMin = Math.ceil(options.desiredDuration * 1.5);
  const slideCountMax = Math.ceil(options.desiredDuration * 2);
  try {
    const script = await withRetry(
      () =>
        generateScriptWithResponsesAPI(materials, {
          ...options,
          slideCountMin,
          slideCountMax,
        }),
      {
        maxRetries: 3,
        baseDelay: 1_500,
        maxDelay: 6_000,
      },
    );

    appLogger.info('🧠 Script estruturado gerado com sucesso.', {
      slides: script.slides.length,
      model: 'gpt-5.1-codex-max',
    });

    return script;
  } catch (error) {
    handleOpenAIError(error, 'generateScriptFromMaterials');
  }
}

// =====================================================
// FUNÇÃO 1B: Responses API
// =====================================================
export async function generateScriptWithResponsesAPI(
  materials: string,
  options: {
    topic: string;
    targetAudience: Script['targetAudience'];
    desiredDuration: number;
    style?: 'formal' | 'casual' | 'engaging';
    slideCountMin?: number;
    slideCountMax?: number;
    revisionInstructions?: string;
    preferUserLength?: boolean;
  },
): Promise<Script> {
  const slideCountMin =
    options.slideCountMin ?? Math.ceil(options.desiredDuration * 1.5);
  const slideCountMax =
    options.slideCountMax ?? Math.ceil(options.desiredDuration * 2);
  const preferUserLength = options.preferUserLength ?? false;

  const systemPrompt = SCRIPT_GENERATION_SYSTEM_PROMPT;

  const userPrompt = buildScriptGenerationUserPrompt({
    materials,
    topic: options.topic,
    targetAudience: options.targetAudience,
    desiredDuration: options.desiredDuration,
    style: options.style,
    revisionInstructions: options.revisionInstructions,
    preferUserLength,
    slideCountRange: { min: slideCountMin, max: slideCountMax },
  });

  try {
    const response = await getOpenAIClient().responses.create({
      model: 'gpt-5.1-codex-max',
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'script',
          strict: true,
          schema: scriptJsonSchema,
        },
      },
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new OpenAIServiceError(
        'Resposta vazia do Responses API',
        'EMPTY_RESPONSE',
      );
    }

    const parsed = JSON.parse(outputText);
    const script = ScriptSchema.parse(parsed);
    appLogger.info('🧩 Script gerado via Responses API.');
    return script;
  } catch (error) {
    handleOpenAIError(error, 'generateScriptWithResponsesAPI');
  }
}

// =====================================================
// FUNÇÃO 2: generateSlideImage
// =====================================================
export interface SlideImageOptions {
  description: string;
  style: 'realistic' | 'illustrated' | 'diagram' | 'infographic';
  targetAudience: Script['targetAudience'];
  slideTitle: string;
  aspectRatio: ImageAspectRatio;
  styleGuide?: {
    notes?: string;
    inputFidelity?: 'high' | 'low';
    references?: (File | Blob)[];
  };
}

export interface GeneratedImage {
  base64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
}

export async function generateSlideImage(
  options: SlideImageOptions,
): Promise<GeneratedImage> {
  const sizeConfig = IMAGE_SIZE_BY_ASPECT_RATIO[options.aspectRatio];
  const referenceFiles = options.styleGuide?.references?.filter(Boolean) ?? [];
  const hasReferences = referenceFiles.length > 0;
  const styleNotes = options.styleGuide?.notes?.trim();

  const prompt = buildSlideImagePrompt({
    slideTitle: options.slideTitle,
    description: options.description,
    style: options.style,
    targetAudience: options.targetAudience,
    aspectRatio: options.aspectRatio,
    styleNotes,
    hasReferences,
  });

  try {
    const commonPayload = {
      model: 'gpt-image-1.5',
      prompt,
      size: sizeConfig.apiSize,
      quality: 'high' as const,
      n: 1,
      output_format: 'png' as const,
    };

    const openaiClient = getOpenAIClient();
    const result = hasReferences
      ? await openaiClient.images.edit({
          ...commonPayload,
          image: referenceFiles,
          input_fidelity: options.styleGuide?.inputFidelity ?? 'high',
        })
      : await openaiClient.images.generate({
          ...commonPayload,
          background: 'opaque',
        });

    const imageData = result.data[0];

    if (!imageData.b64_json) {
      throw new OpenAIServiceError(
        'Imagem não retornada em formato base64',
        'IMAGE_FORMAT_ERROR',
      );
    }

    appLogger.info('🖼️ Imagem de slide gerada.', {
      aspectRatio: options.aspectRatio,
      apiSize: sizeConfig.apiSize,
    });
    return {
      base64: imageData.b64_json,
      mimeType: 'image/png',
      width: sizeConfig.width,
      height: sizeConfig.height,
    };
  } catch (error) {
    handleOpenAIError(error, 'generateSlideImage');
  }
}

export async function generateSlideImages(
  slides: Slide[],
  style: SlideImageOptions['style'],
  targetAudience: Script['targetAudience'],
  aspectRatio: ImageAspectRatio = '16:9',
): Promise<Map<string, GeneratedImage>> {
  const results = new Map<string, GeneratedImage>();
  const slidesNeedingImages = slides.filter((slide) =>
    slide.content.some((block) => block.type === 'imagePlaceholder'),
  );
  const batchSize = 3;

  for (let index = 0; index < slidesNeedingImages.length; index += batchSize) {
    const batch = slidesNeedingImages.slice(index, index + batchSize);

    await Promise.all(
      batch.map(async (slide) => {
        const imagePlaceholder = slide.content.find(
          (block) => block.type === 'imagePlaceholder',
        );

        if (imagePlaceholder && 'description' in imagePlaceholder) {
          const image = await generateSlideImage({
            description: imagePlaceholder.description,
            style,
            targetAudience,
            slideTitle: slide.title,
            aspectRatio,
          });
          results.set(slide.id, image);
        }
      }),
    );

    if (index + batchSize < slidesNeedingImages.length) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }

  appLogger.info('🖼️ Lote de imagens concluído.', {
    generated: results.size,
    aspectRatio,
  });
  return results;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/ogg': 'ogg',
  'audio/ogg;codecs=opus': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

const fallbackExtension = 'webm';

const resolveExtensionFromMime = (mime?: string) => {
  if (!mime) {
    return fallbackExtension;
  }
  const entry = Object.entries(MIME_EXTENSION_MAP).find(([key]) =>
    mime.toLowerCase().startsWith(key),
  );
  return entry?.[1] ?? fallbackExtension;
};

export async function transcribeAudioBlob(
  blob: Blob,
  options: { language?: string } = {},
): Promise<string> {
  const extension = resolveExtensionFromMime(blob.type);
  const file =
    blob instanceof File
      ? blob
      : new File([blob], `voice-input.${extension}`, {
          type: blob.type || 'audio/webm',
        });

  try {
    const transcription = await getOpenAIClient().audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      response_format: 'text',
      temperature: 0,
      language: options.language,
    });

    if (typeof transcription === 'string') {
      return transcription.trim();
    }

    return transcription.text?.trim() ?? '';
  } catch (error) {
    handleOpenAIError(error, 'transcribeAudioBlob');
  }
}

// =====================================================
// FUNÇÃO 3: refineContent
// =====================================================
export async function refineContent(
  content: string,
  options: {
    targetAudience: Script['targetAudience'];
    refinementGoals: ('clarity' | 'engagement' | 'brevity' | 'formality')[];
    preserveKeyPoints?: boolean;
  },
): Promise<RefinedContent> {
  const systemPrompt = buildRefineContentSystemPrompt({
    preserveKeyPoints: options.preserveKeyPoints,
  });

  const userPrompt = buildRefineContentUserPrompt({
    content,
    targetAudience: options.targetAudience,
    refinementGoals: options.refinementGoals,
  });

  try {
    const response = await getOpenAIClient().responses.create({
      model: 'gpt-5.1-codex-max',
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'refined_content',
          strict: true,
          schema: refinedContentJsonSchema,
        },
      },
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new OpenAIServiceError(
        'Resposta vazia do Responses API',
        'EMPTY_RESPONSE',
      );
    }

    const parsed = RefinedContentSchema.parse(JSON.parse(outputText));
    appLogger.info('🪄 Conteúdo refinado com sucesso.');
    return parsed;
  } catch (error) {
    handleOpenAIError(error, 'refineContent');
  }
}

export async function refineContentDirect(
  content: string,
  targetAudience: Script['targetAudience'],
): Promise<RefinedContent> {
  return refineContent(content, {
    targetAudience,
    refinementGoals: ['clarity', 'engagement'],
    preserveKeyPoints: true,
  });
}

// =====================================================
// FUNÇÃO EXTRA: refinamento de slide (texto + prompt visual)
// =====================================================
const SlideRefinementSchema = z.object({
  scriptText: z.string(),
  narrationText: z.string(),
  visualPrompt: z.string(),
});

const SlideEditOperationSchema = z.object({
  action: z.enum(['insert', 'update', 'delete']),
  targetIndex: z.number().int().nonnegative(),
  slideId: z.string().optional(),
  reason: z.string().optional(),
  slide: z
    .object({
      scriptText: z.string(),
      narrationText: z.string(),
      visualPrompt: z.string(),
    })
    .optional(),
});

const SlideEditPlanSchema = z.object({
  summary: z.string(),
  operations: SlideEditOperationSchema.array(),
});

export async function refineSlideContentWithFeedback(
  slide: {
    scriptText: string;
    narrationText: string;
    visualPrompt: string;
    userNotes?: string;
  },
  feedback: string,
  targetAudience: Script['targetAudience'],
): Promise<{
  scriptText: string;
  narrationText: string;
  visualPrompt: string;
}> {
  const systemPrompt = SLIDE_FEEDBACK_SYSTEM_PROMPT;
  const userPrompt = buildSlideFeedbackUserPrompt({
    slide,
    feedback,
    targetAudience,
  });

  try {
    const response = await getOpenAIClient().responses.create({
      model: 'gpt-5.1-codex-max',
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'slide_refinement',
          strict: true,
          schema: slideRefinementJsonSchema,
        },
      },
    });

    const parsed = SlideRefinementSchema.parse(
      JSON.parse(response.output_text),
    );
    appLogger.info('✏️ Slide refinado com feedback.');
    return parsed;
  } catch (error) {
    handleOpenAIError(error, 'refineSlideContentWithFeedback');
  }
}

export async function editSlidesWithInstructions(params: {
  slides: Array<{
    id: string;
    order: number;
    scriptText: string;
    narrationText: string;
    visualPrompt: string;
  }>;
  instructions: string;
  topic: string;
  materials: string;
  targetAudience: Script['targetAudience'];
}): Promise<{ summary: string; operations: SlideEditOperation[] }> {
  const trimmedInstructions = params.instructions.trim();
  if (!trimmedInstructions) {
    return { summary: 'Nenhuma instrução fornecida.', operations: [] };
  }

  const slidesOverview = params.slides
    .sort((a, b) => a.order - b.order)
    .map((slide, index) => ({
      index,
      id: slide.id,
      scriptText: truncateForPrompt(slide.scriptText, 900),
      narrationText: truncateForPrompt(slide.narrationText, 600),
      visualPrompt: truncateForPrompt(slide.visualPrompt, 400),
    }));

  const slidesBlock = slidesOverview
    .map(
      (slide) =>
        `Slide ${slide.index + 1} (id: ${slide.id})
SCRIPT:
${slide.scriptText || '[vazio]'}
NARRAÇÃO:
${slide.narrationText || '[vazio]'}
VISUAL:
${slide.visualPrompt || '[vazio]'}`,
    )
    .join('\n\n');

  const systemPrompt = SLIDE_EDIT_SYSTEM_PROMPT;
  const materialsExcerpt = truncateForPrompt(params.materials, 2000);

  const userPrompt = buildSlideEditUserPrompt({
    topic: params.topic,
    targetAudience: params.targetAudience,
    materialsExcerpt,
    slidesBlock,
    instructions: trimmedInstructions,
  });

  try {
    const response = await getOpenAIClient().responses.create({
      model: 'gpt-5.1-codex-max',
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'slide_edit_plan',
          strict: true,
          schema: slideEditPlanJsonSchema,
        },
      },
    });

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new OpenAIServiceError(
        'Resposta vazia ao gerar plano de edição',
        'EMPTY_RESPONSE',
      );
    }

    const parsed = SlideEditPlanSchema.parse(JSON.parse(outputText));
    appLogger.info('🧩 Plano de edição de slides gerado.', {
      operations: parsed.operations.length,
    });
    return parsed;
  } catch (error) {
    handleOpenAIError(error, 'editSlidesWithInstructions');
  }
}

function normalizeOpenAIError(
  error: unknown,
  functionName: string,
  logLevel: 'error' | 'warn' = 'error',
): OpenAIServiceError {
  const logMessage = `Falha em ${functionName}.`;
  if (logLevel === 'warn') {
    appLogger.warn(logMessage, { error });
  } else {
    appLogger.error(logMessage, { error });
  }

  if (error instanceof OpenAIServiceError) {
    return error;
  }

  if (error instanceof OpenAI.APIError) {
    const errorMap: Record<number, { code: string; message: string }> = {
      400: { code: 'BAD_REQUEST', message: 'Requisição inválida' },
      401: { code: 'AUTH_ERROR', message: 'Chave de API inválida' },
      403: { code: 'FORBIDDEN', message: 'Acesso negado' },
      404: { code: 'NOT_FOUND', message: 'Recurso não encontrado' },
      429: { code: 'RATE_LIMIT', message: 'Limite de requisições excedido' },
      500: { code: 'SERVER_ERROR', message: 'Erro interno do servidor OpenAI' },
    };

    const errorInfo = errorMap[error.status] ?? {
      code: 'UNKNOWN',
      message: error.message,
    };

    return new OpenAIServiceError(
      `${errorInfo.message}: ${error.message}`,
      errorInfo.code,
      error.status,
    );
  }

  if (error instanceof z.ZodError) {
    return new OpenAIServiceError(
      `Erro de validação: ${error.issues.map((issue) => issue.message).join(', ')}`,
      'VALIDATION_ERROR',
    );
  }

  return new OpenAIServiceError(
    error instanceof Error ? error.message : 'Erro desconhecido',
    'UNKNOWN_ERROR',
  );
}

function handleOpenAIError(error: unknown, functionName: string): never {
  throw normalizeOpenAIError(error, functionName);
}

// =====================================================
// RETRY HELPER
// =====================================================
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
  } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1_000, maxDelay = 10_000 } = options;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryable =
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.InternalServerError ||
        error instanceof OpenAI.APIConnectionError;

      if (isLastAttempt || !isRetryable) {
        throw error;
      }

      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      appLogger.warn('Tentativa com OpenAI falhou. Repetindo.', {
        attempt: attempt + 1,
        delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Máximo de tentativas excedido');
}

export type { ContentBlock, RefinedContent, Script, Slide };
