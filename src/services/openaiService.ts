import OpenAI from 'openai';
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
import type { SlideEditOperation } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';

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

  const systemPrompt = `Você é um diretor pedagógico especializado em vídeos educacionais guiados por ciência cognitiva.
Siga rigorosamente o "Guia completo para criação de vídeos educacionais de alta qualidade (2025)" e aplique estes princípios:

- Teoria da Carga Cognitiva de Sweller/Cowan: memória de trabalho processa 2-4 elementos e 7±2 chunks. Limite 3-4 conceitos novos por vídeo, use chunking de 5-10 minutos e insira pausas de 2-3 segundos entre ideias densas.
- Princípios de Mayer (coerência, sinalização d = 0.38, contiguidade temporal/espacial, redundância, segmentação, pré-treinamento, modalidade, multimídia, personalização, voz e imagem) para reduzir carga extrínseca e destacar cues críticos.
- Nove eventos instrucionais de Gagné alinhados aos Primeiros Princípios de Merrill e à Taxonomia revisada de Bloom; mapeie objetivos por nível (Lembrar→Criar) e descreva quando usar exemplos trabalhados, prática guiada e transferência.
- Dados de engajamento de Guo et al. (2014): mantenha vídeos ≤6 minutos quando possível, sinalize quando o conteúdo exigir 6-15 minutos, inclua ganchos nos primeiros 10 segundos, pattern interrupt até 30 segundos e CTA em três pontos (após hook, no pico de valor e no final).
- Estratégias de scaffolding e UDL: pré-treine termos, use analogias concretas, worked examples antes de tarefas independentes, fading gradual, recomendações específicas para TDAH, dislexia e aprendizes no espectro autista.
- Acessibilidade e compliance: lembrar legendas, ritmo alvo de 120-150 WPM (110-130 WPM para crianças/ESL), safe zones (Action Safe 93%, Title Safe 90%), contraste ≥4.5:1, divulgações (FTC/ASA/Seção 508), CTAs claros e notas de adaptabilidade multiplataforma.
- Qualidade da evidência: cite a fonte quando usar números de pesquisa, marque como "[verificar]" quando não houver confirmação e nunca invente dados.

Entregue roteiros prontos para gravação, com linguagem conversacional, precisão técnica e indicações claras de ganchos, quizzes, CTAs, pausas e prompts visuais.`;

  const revisionBlock = options.revisionInstructions
    ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${options.revisionInstructions.trim()}\n`
    : '';

  const userPrompt = `Crie um script de vídeo educacional aplicando o guia científico fornecido.

ESPECIFICAÇÕES DO PROJETO:
- TÓPICO: ${options.topic}
- PÚBLICO-ALVO: ${options.targetAudience}
- ${preferUserLength ? `DURAÇÃO ESTIMADA: ~${options.desiredDuration} minutos (ajuste se o usuário especificar outro valor nas notas).` : `DURAÇÃO DESEJADA: ${options.desiredDuration} minutos (indique quando exceder o limite ideal de 6 minutos)`}
- ESTILO: ${options.style ?? 'engaging'}
- REFERÊNCIAS DE TAMANHO: Inspecione os materiais/notas e obedeça instruções explícitas sobre número de slides ou duração (ex.: "quero 6 slides em 5 minutos"). Quando nada for informado, escolha a combinação que maximize clareza e ritmo cognitivo.
${revisionBlock}

REQUISITOS DIDÁTICOS E DE PRODUÇÃO:
${preferUserLength ? `1. Determine a quantidade ideal de slides analisando o volume de conteúdo e quaisquer instruções nas notas, garantindo cobertura explícita dos 9 eventos de Gagné (ganhar atenção, informar objetivos, ativar conhecimento prévio, apresentar conteúdo, fornecer orientação, provocar desempenho, oferecer feedback, avaliar e promover retenção/transferência) e mapeando cada objetivo aos níveis da Taxonomia de Bloom.` : `1. Estruture ${slideCountMin} a ${slideCountMax} slides cobrindo os 9 eventos de Gagné (ganhar atenção, informar objetivos, ativar conhecimento prévio, apresentar conteúdo, fornecer orientação, provocar desempenho, oferecer feedback, avaliar e promover retenção/transferência) e conecte cada objetivo ao nível correspondente da Taxonomia de Bloom.`}
2. Garanta narrativa problema → solução com ganchos PVSS/Open Loop nos primeiros 10 segundos, pattern interrupt até 30 segundos e CTAs em três pontos (hook, meio, final) alinhados ao objetivo pedagógico.
3. Para cada slide forneça:
   - Layout apropriado (title, content, twoColumn, imageLeft ou imageRight).
   - Blocos textuais ou listas com no máximo 3-5 itens e 3-5 palavras por elemento, sem redundância com a narração.
   - Um "imagePlaceholder" contendo "description" clara do visual (diagramas, metáforas, dados) e "alt" descritivo (≤120 caracteres) enfatizando o foco educacional e cores acessíveis (azul/laranja, azul/teal, evitar vermelho+verde).
   - "speakerNotes" com instruções de ritmo (120-150 WPM – reduza para 110-130 WPM em crianças/ESL), marcações de [PAUSA 2s], dicas de entonação e indicação explícita do evento de Gagné e do princípio de Mayer aplicado.
   - "narrationText" literal com 45-90 palavras, tom conversacional e sem metalinguagem.
4. Sinalize momentos ideais para quizzes embutidos, prompts de pausa, microlearning de 1-5 minutos, exemplos trabalhados e fading, especificando quando são voltados a iniciantes ou aprendizes avançados.
5. Inclua recomendações de acessibilidade (legendagem, contraste ≥4.5:1, Title Safe 90%/Action Safe 93%, descrições de áudio, orientações para TDAH/dislexia/autismo) e notas de compliance (divulgações FTC/ASA/Seção 508 quando houver patrocínio).
6. Forneça palavras-chave SEO (mínimo 6), sugestão de thumbnail/hook textual de até 5 palavras e resumo final que conecte retenção e transferência.
7. Sempre que citar números ou pesquisas, referencie a fonte (ex.: Guo et al., 2014) ou marque como "[verificar]"; nunca invente métricas.

MATERIAIS DE REFERÊNCIA:
${materials}

Respeite rigorosamente estas instruções e retorne JSON compatível com o schema.`;

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

  const basePrompt = `
Crie uma imagem educacional para um slide de vídeo:

TÍTULO DO SLIDE: ${options.slideTitle}
DESCRIÇÃO: ${options.description}
ESTILO VISUAL: ${styleGuides[options.style]}
PÚBLICO-ALVO: ${audienceStyle[options.targetAudience]}
PROPÓSITO DIDÁTICO: Visual que apoie a narrativa sem texto redundante, reforçando metáforas, diagramas ou dados-chave.

COMPOSIÇÃO E ORIENTAÇÃO:
${COMPOSITION_GUIDES[options.aspectRatio]}
${SAFE_ZONE_INSTRUCTIONS[options.aspectRatio]}
${SUBTITLE_SPACE_INSTRUCTIONS[options.aspectRatio]}
- Aplique a regra dos terços (grade 3×3) e mantenha elementos críticos dentro do Action Safe (93%) e do Title Safe (90%).
- Reserve os 20% inferiores para legendas e mantenha os 10% superiores limpos para overlays futuros.
- Limite-se a no máximo 3 grupos visuais e 3-5 elementos principais para reduzir carga extrínseca.
- Use princípios Gestalt (proximidade, similaridade, continuidade, fechamento) e guie o olhar com linhas/iluminação suave.

PALETA E ESTILO:
- Adote a regra 60-30-10 de cores com contraste mínimo 4.5:1; prefira combinações azul/laranja, azul/teal ou verde/azul e evite vermelho + verde puros. Utilize padrões além da cor para diferenciar categorias.
- Considere psicologia das cores: azul para foco/confiança, verde para segurança/criatividade, amarelo para alerta/memorização.
- Ajuste saturação ao público (estética vibrante e personagens antropomórficos para 3-11 anos; minimalismo premium para profissionais).
- Mantenha fundo limpo com espaço negativo suficiente para texto e motion graphics posteriores.

REQUISITOS OBRIGATÓRIOS:
- Sem textos, tipografia, logos, bordas ou marcas d'água; represente números via formas ou ícones.
- Sujeito principal ocupando no máximo 60% da área para facilitar crops 16:9, 9:16 e 1:1.
- Iluminação uniforme, sombras difusas e nitidez adequada para exportação 4K/1080p.
- Considere acessibilidade neurodiversa: evite flicker, ruído visual excessivo e contraste agressivo; mantenha contornos definidos para apoiar TDAH/dislexia/autismo.
`.trim();

  const styleNotesBlock = styleNotes
    ? `ÂNCORAS DO USUÁRIO:\n${styleNotes}`
    : '';

  const referencesBlock = hasReferences
    ? 'Use as imagens fornecidas (Image 1...N) como referência direta de paleta, iluminação, textura e pinceladas. Preserve os traços principais e aplique-os somente ao novo conteúdo descrito.'
    : '';

  const prompt = [basePrompt, styleNotesBlock, referencesBlock]
    .filter(Boolean)
    .join('\n\n');

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
  const goalDescriptions: Record<string, string> = {
    clarity: 'Melhorar clareza e compreensibilidade',
    engagement: 'Tornar mais envolvente e interessante',
    brevity: 'Reduzir verbosidade mantendo significado',
    formality: 'Ajustar tom formal/informal conforme público',
  };

  const goals = options.refinementGoals
    .map((goal) => `- ${goalDescriptions[goal]}`)
    .join('\n');

  const systemPrompt = `Você é um editor especializado em conteúdo educacional guiado por ciência cognitiva.
Aplique o guia de vídeos educacionais de alta qualidade para reduzir carga extrínseca, reforçar sinalização/contiguidade e alinhar cada trecho aos princípios de Mayer, Gagné e Bloom.
- Ajuste ritmo para 120-150 WPM (ou 110-130 WPM para crianças/ESL) e marque [PAUSA] onde necessário.
- Reforce ganchos, CTAs em três pontos, analogias concretas, exemplos trabalhados e recomendações de acessibilidade (WCAG 2.1 AA, Title Safe 90%, descrições alternativas, orientações para TDAH/dislexia/autismo).
- Revise afirmações factuais usando apenas o texto fornecido; cite a fonte quando disponível e marque como "[verificar]" se houver dúvida.
${options.preserveKeyPoints ? 'IMPORTANTE: Preserve todos os pontos-chave do original.' : ''}`;

  const userPrompt = `Refine o seguinte conteúdo educacional:

TEXTO ORIGINAL:
${content}

PÚBLICO-ALVO: ${options.targetAudience}

OBJETIVOS DE REFINAMENTO:
${goals}

Retorne o texto refinado com lista de melhorias aplicadas.`;

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
  try {
    const response = await getOpenAIClient().responses.create({
      model: 'gpt-5.1-codex-max',
      instructions:
        'Você é um roteirista educacional guiado pela Teoria da Carga Cognitiva, pelos princípios de Mayer e pelo framework de Gagné. Ajuste narração e prompt visual segundo o feedback, mantendo ganchos fortes, CTAs em três pontos, ritmo adequado e garantindo que o visual siga regra dos terços, safe zones, contraste ≥4.5:1 e ausência de texto.',
      input: [
        {
          role: 'user',
          content: `Slide atual:\nSCRIPT:\n${slide.scriptText}\n\nTEXTO LITERAL:\n${slide.narrationText}\n\nPROMPT VISUAL:\n${slide.visualPrompt}\n\nFEEDBACK:\n${feedback}\n\nPÚBLICO-ALVO: ${targetAudience}`,
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

  const systemPrompt = `Você é um lead writer educacional. Faça edições cirúrgicas em roteiros existentes seguindo o guia de ciência cognitiva 2025. Preserve tudo que não for citado e detalhe apenas o necessário.`;
  const materialsExcerpt = truncateForPrompt(params.materials, 2000);

  const userPrompt = `CONTEXTO DO PROJETO:
- Tópico: ${params.topic}
- Público-alvo: ${params.targetAudience}

MATERIAIS BASE (trecho):
${materialsExcerpt}

ROTEIRO ATUAL (ordem e IDs fixos):
${slidesBlock}

PEDIDO DO USUÁRIO:
${trimmedInstructions}

INSTRUÇÕES DE EDIÇÃO:
1. Responda apenas com JSON válido no formato slide_edit_plan.
2. Use targetIndex zero-based considerando a ordem após aplicar operações anteriores.
3. Sempre inclua slideId para delete/update.
4. Operações insert DEVEM incluir o campo "slide" completo (scriptText, narrationText, visualPrompt).
5. Priorize edições mínimas; só reconstrua tudo se o usuário pedir explicitamente.
6. Inclua uma "summary" curta explicando o resultado.`;

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
