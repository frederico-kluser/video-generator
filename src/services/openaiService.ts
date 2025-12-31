import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import {
  IMAGE_SIZE_BY_ASPECT_RATIO,
  type ImageAspectRatio,
} from '@/config/constants/imageGeneration';
import {
  COMPOSITION_GUIDES,
  SAFE_ZONE_INSTRUCTIONS,
  SUBTITLE_SPACE_INSTRUCTIONS,
} from '@/config/constants/imagePrompts';
import {
  type ContentBlock,
  type RefinedContent,
  RefinedContentSchema,
  type Script,
  ScriptSchema,
  type Slide,
  SlideSchema,
} from '@/schemas/eduScriptSchemas';
import { appLogger } from '@/shared/logging/logger';

// =====================================================
// CONFIGURAÇÃO DOS CLIENTES
// =====================================================
const resolveApiKey = (): string => {
  const serverKey =
    typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : undefined;
  const viteKey =
    typeof import.meta !== 'undefined'
      ? import.meta.env?.VITE_OPENAI_API_KEY
      : undefined;
  const apiKey = serverKey ?? viteKey;

  if (!apiKey) {
    const message =
      'OPENAI_API_KEY não configurada. Defina OPENAI_API_KEY ou VITE_OPENAI_API_KEY.';
    appLogger.error(message);
    throw new Error(message);
  }

  return apiKey;
};

const apiKey = resolveApiKey();

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
          duration: { type: ['number', 'null'] },
        },
        required: [
          'id',
          'title',
          'layout',
          'content',
          'speakerNotes',
          'duration',
        ],
        additionalProperties: false,
      },
    },
    keywords: { type: 'array', items: { type: 'string' } },
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

const slideRefinementJsonSchema = {
  type: 'object',
  properties: {
    scriptText: { type: 'string' },
    visualPrompt: { type: 'string' },
  },
  required: ['scriptText', 'visualPrompt'],
  additionalProperties: false,
} as const;

const openai = new OpenAI({
  apiKey,
  timeout: 60_000,
  maxRetries: 3,
  dangerouslyAllowBrowser: true,
});

const langchainModel = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0.7,
  maxRetries: 2,
  apiKey,
});

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
      temperature: 0,
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
  },
): Promise<Script> {
  const slideCountMin =
    options.slideCountMin ?? Math.ceil(options.desiredDuration * 1.5);
  const slideCountMax =
    options.slideCountMax ?? Math.ceil(options.desiredDuration * 2);

  const systemPrompt = `Você é um especialista em criação de conteúdo educacional.
Crie scripts de vídeo envolventes, didáticos e bem estruturados.
Adapte a linguagem ao público-alvo especificado.
Inclua notas do apresentador detalhadas para cada slide.
Garanta progressão lógica do conteúdo.`;

  const userPrompt = `Crie um script de vídeo educacional com as seguintes especificações:

TÓPICO: ${options.topic}
PÚBLICO-ALVO: ${options.targetAudience}
DURAÇÃO DESEJADA: ${options.desiredDuration} minutos
ESTILO: ${options.style ?? 'engaging'}

MATERIAIS DE REFERÊNCIA:
${materials}

Gere um script completo com:
- Título atrativo
- Descrição concisa
- ${slideCountMin} a ${slideCountMax} slides
- Conteúdo progressivo e didático
- Notas do apresentador para cada slide
- Indicações de onde inserir imagens
- Palavras-chave para SEO educativo`;

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.1-codex-max',
      temperature: 0,
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

  const styleGuides: Record<SlideImageOptions['style'], string> = {
    realistic: 'fotorrealista, alta qualidade, iluminação profissional',
    illustrated:
      'ilustração digital, cores vibrantes, estilo educacional amigável',
    diagram:
      'diagrama técnico limpo, linhas precisas, áreas bem delimitadas, fundo branco',
    infographic:
      'infográfico moderno, ícones flat, blocos de cor coordenados, sem texto',
  };

  const audienceStyle: Record<Script['targetAudience'], string> = {
    elementary:
      'cores brilhantes, personagens cartoon, visual divertido e amigável',
    middleSchool: 'visual moderno, levemente estilizado, engajante',
    highSchool: 'design contemporâneo, profissional mas acessível',
    college: 'visual acadêmico profissional, limpo e sofisticado',
    professional: 'design corporativo, minimalista, alta qualidade',
  };

  const prompt = `
Crie uma imagem educacional para um slide de vídeo:

TÍTULO DO SLIDE: ${options.slideTitle}
DESCRIÇÃO: ${options.description}
ESTILO VISUAL: ${styleGuides[options.style]}
PÚBLICO-ALVO: ${audienceStyle[options.targetAudience]}

COMPOSIÇÃO E ORIENTAÇÃO:
${COMPOSITION_GUIDES[options.aspectRatio]}
${SAFE_ZONE_INSTRUCTIONS[options.aspectRatio]}
${SUBTITLE_SPACE_INSTRUCTIONS[options.aspectRatio]}

REQUISITOS OBRIGATÓRIOS:
- Imagem clara e legível em apresentações
- Contraste adequado para projeção
- Sujeito principal ocupando no máximo 60% da área total para facilitar crops
- A imagem não deve conter texto, labels, tipografia, logos ou bordas
- Fundo limpo com espaço negativo que permita overlays posteriormente
- Composição equilibrada respeitando as zonas seguras descritas
`.trim();

  try {
    const result = await openai.images.generate({
      model: 'gpt-image-1.5',
      prompt,
      size: sizeConfig.apiSize,
      quality: 'high',
      n: 1,
      background: 'opaque',
      output_format: 'png',
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
  const goalDescriptions: Record<string, string> = {
    clarity: 'Melhorar clareza e compreensibilidade',
    engagement: 'Tornar mais envolvente e interessante',
    brevity: 'Reduzir verbosidade mantendo significado',
    formality: 'Ajustar tom formal/informal conforme público',
  };

  const goals = options.refinementGoals
    .map((goal) => `- ${goalDescriptions[goal]}`)
    .join('\n');

  const systemPrompt = `Você é um editor especializado em conteúdo educacional.
Refine textos mantendo precisão técnica enquanto otimiza para o público-alvo.
${options.preserveKeyPoints ? 'IMPORTANTE: Preserve todos os pontos-chave do original.' : ''}`;

  const userPrompt = `Refine o seguinte conteúdo educacional:

TEXTO ORIGINAL:
${content}

PÚBLICO-ALVO: ${options.targetAudience}

OBJETIVOS DE REFINAMENTO:
${goals}

Retorne o texto refinado com lista de melhorias aplicadas.`;

  try {
    const structuredModel = langchainModel.withStructuredOutput(
      RefinedContentSchema,
      {
        strict: true,
        name: 'refined_content',
      },
    );

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['user', userPrompt],
    ]);

    const result = await prompt.pipe(structuredModel).invoke({});
    appLogger.info('🪄 Conteúdo refinado com sucesso.');
    return result;
  } catch (error) {
    handleOpenAIError(error, 'refineContent');
  }
}

export async function refineContentDirect(
  content: string,
  targetAudience: Script['targetAudience'],
): Promise<RefinedContent> {
  try {
    const completion = await openai.beta.chat.completions.parse({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Você é um editor especializado em conteúdo educacional.',
        },
        {
          role: 'user',
          content: `Refine este texto para ${targetAudience}:\n\n${content}`,
        },
      ],
      response_format: zodResponseFormat(
        RefinedContentSchema,
        'refined_content',
      ),
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new OpenAIServiceError(
        'Falha ao parsear resposta estruturada',
        'PARSE_ERROR',
      );
    }

    appLogger.info('✨ Conteúdo refinado via SDK direto.');
    return result;
  } catch (error) {
    handleOpenAIError(error, 'refineContentDirect');
  }
}

// =====================================================
// FUNÇÃO EXTRA: refinamento de slide (texto + prompt visual)
// =====================================================
const SlideRefinementSchema = z.object({
  scriptText: z.string(),
  visualPrompt: z.string(),
});

export async function refineSlideContentWithFeedback(
  slide: { scriptText: string; visualPrompt: string; userNotes?: string },
  feedback: string,
  targetAudience: Script['targetAudience'],
): Promise<{ scriptText: string; visualPrompt: string }> {
  try {
    const response = await openai.responses.create({
      model: 'gpt-5.1-codex-max',
      instructions:
        'Você é um roteirista educacional. Ajuste a narração e o prompt visual considerando o feedback do usuário.',
      input: [
        {
          role: 'user',
          content: `Slide atual:\nSCRIPT:\n${slide.scriptText}\n\nPROMPT VISUAL:\n${slide.visualPrompt}\n\nFEEDBACK:\n${feedback}\n\nPÚBLICO-ALVO: ${targetAudience}`,
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

// =====================================================
// TRATAMENTO DE ERROS
// =====================================================
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
