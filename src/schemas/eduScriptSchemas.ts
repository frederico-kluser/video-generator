import { z } from 'zod';

// =====================================================
// SCHEMA: Conteúdo de Slide
// =====================================================
const TextContentSchema = z
  .object({
    type: z.literal('text'),
    content: z.string().describe('Texto principal do slide'),
    style: z
      .enum(['heading', 'subheading', 'body', 'caption'])
      .describe('Estilo de formatação do texto'),
  })
  .strict();

const BulletPointSchema = z
  .object({
    text: z.string().describe('Texto do ponto'),
    indent: z.number().min(0).max(2).describe('Nível de indentação (0-2)'),
  })
  .strict();

const BulletListSchema = z
  .object({
    type: z.literal('bulletList'),
    items: z
      .array(BulletPointSchema)
      .describe('Lista de pontos com marcadores'),
  })
  .strict();

const ImagePlaceholderSchema = z
  .object({
    type: z.literal('imagePlaceholder'),
    description: z.string().describe('Descrição da imagem a ser gerada'),
    alt: z.string().describe('Texto alternativo para acessibilidade'),
  })
  .strict();

const ContentBlockSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  BulletListSchema,
  ImagePlaceholderSchema,
]);

// =====================================================
// SCHEMA: Slide Individual
// =====================================================
export const SlideSchema = z
  .object({
    id: z.string().describe('Identificador único do slide (ex: slide-1)'),
    title: z.string().describe('Título principal do slide'),
    layout: z
      .enum(['title', 'content', 'twoColumn', 'imageLeft', 'imageRight'])
      .describe('Template de layout do slide'),
    content: z
      .array(ContentBlockSchema)
      .describe('Blocos de conteúdo do slide'),
    speakerNotes: z
      .string()
      .nullable()
      .describe('Notas do apresentador para este slide'),
    narrationText: z
      .string()
      .describe('Texto literal que o apresentador deve ler, sem instruções'),
    duration: z.number().nullable().describe('Duração estimada em segundos'),
  })
  .strict();

// =====================================================
// SCHEMA: Script Completo
// =====================================================
export const ScriptSchema = z
  .object({
    title: z.string().describe('Título do vídeo educacional'),
    description: z.string().describe('Descrição breve do conteúdo'),
    targetAudience: z
      .enum([
        'elementary',
        'middleSchool',
        'highSchool',
        'college',
        'professional',
      ])
      .describe('Público-alvo do conteúdo'),
    estimatedDuration: z.number().describe('Duração total estimada em minutos'),
    slides: z
      .array(SlideSchema)
      .min(3)
      .max(20)
      .describe('Array de slides ordenados'),
    keywords: z.array(z.string()).describe('Palavras-chave para SEO e busca'),
  })
  .strict();

// =====================================================
// SCHEMA: Conteúdo Refinado
// =====================================================
export const RefinedContentSchema = z
  .object({
    originalText: z.string().describe('Texto original antes do refinamento'),
    refinedText: z.string().describe('Texto melhorado e refinado'),
    improvements: z.array(z.string()).describe('Lista de melhorias aplicadas'),
    readabilityScore: z
      .number()
      .min(0)
      .max(100)
      .describe('Score de legibilidade (0-100)'),
  })
  .strict();

// =====================================================
// TIPOS INFERIDOS
// =====================================================
export type Slide = z.infer<typeof SlideSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type RefinedContent = z.infer<typeof RefinedContentSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
