import { IMAGE_SIZE_BY_ASPECT_RATIO } from '@/config/constants/imageGeneration';
import type { AspectRatio } from '@/config/constants/video';
import {
  DEFAULT_PROMPT_BLUEPRINT_ID,
  getPromptBlueprintById,
  type PromptBlueprintId,
} from '@/content/prompts';
import type { Slide } from '@/features/video-generation/model/types';
import {
  generateScriptFromMaterials as generateStructuredScript,
  generateSlideImage as generateOpenAiSlideImage,
  refineSlideContentWithFeedback,
  type Script,
  type ContentBlock,
} from '@/services/openaiService';
import { appLogger } from '@/shared/logging/logger';

type RawSlide = Omit<Slide, 'id' | 'order' | 'isRegeneratingImage'>;

const AUDIENCE_KEYWORDS: Array<{
  matcher: RegExp;
  mapped: Script['targetAudience'];
}> = [
  { matcher: /elementary|fundamental|k-5/i, mapped: 'elementary' },
  { matcher: /middle|6-9|fundamental ii/i, mapped: 'middleSchool' },
  { matcher: /high|ensino médio|10-12/i, mapped: 'highSchool' },
  { matcher: /college|universit|adulto/i, mapped: 'college' },
  { matcher: /.*/, mapped: 'professional' },
];

const STYLE_BY_RATIO: Record<
  AspectRatio,
  'realistic' | 'illustrated' | 'diagram' | 'infographic'
> = {
  '16:9': 'illustrated',
  '9:16': 'infographic',
  '1:1': 'diagram',
};

const DEFAULT_AUDIENCE: Script['targetAudience'] = 'professional';

const normalizeAudience = (audience: string): Script['targetAudience'] => {
  const match = AUDIENCE_KEYWORDS.find(({ matcher }) => matcher.test(audience));
  return match?.mapped ?? DEFAULT_AUDIENCE;
};

const estimateDurationFromMaterials = (materials: string): number => {
  const wordCount = materials.split(/\s+/).filter(Boolean).length;
  return Math.min(12, Math.max(3, Math.ceil(wordCount / 120)));
};

const buildScriptText = (
  blocks: ContentBlock[],
  speakerNotes?: string | null,
): string => {
  const narration = speakerNotes?.trim();
  if (narration) {
    return narration;
  }

  const parts: string[] = [];

  blocks.forEach((block) => {
    if (block.type === 'text') {
      parts.push(block.content);
    }

    if (block.type === 'bulletList') {
      block.items.forEach((item) => {
        const indent = '  '.repeat(item.indent);
        parts.push(`${indent}• ${item.text}`);
      });
    }
  });

  return parts.join('\n').trim();
};

const buildNarrationText = (
  narrationText?: string | null,
  speakerNotes?: string | null,
  fallback?: string,
): string => {
  const trimmedNarration = narrationText?.trim();
  if (trimmedNarration) {
    return trimmedNarration;
  }

  const trimmedNotes = speakerNotes?.trim();
  if (trimmedNotes) {
    return trimmedNotes;
  }

  return fallback?.trim() ?? '';
};

const buildVisualPrompt = (
  slideTitle: string,
  blocks: ContentBlock[],
): string => {
  const placeholder = blocks.find((block) => block.type === 'imagePlaceholder');

  if (placeholder && placeholder.type === 'imagePlaceholder') {
    return `${placeholder.description}. Alt text: ${placeholder.alt}`;
  }

  return `Educational illustration for "${slideTitle}" highlighting the core concept.`;
};

export async function generateScriptFromMaterials(
  topic: string,
  materials: string,
  audience: string,
  promptId: PromptBlueprintId = DEFAULT_PROMPT_BLUEPRINT_ID,
  revisionInstructions?: string,
): Promise<RawSlide[]> {
  const targetAudience = normalizeAudience(audience);
  const blueprint = getPromptBlueprintById(promptId);
  const estimatedDuration = estimateDurationFromMaterials(materials);
  const blueprintDuration = Math.round(
    (blueprint.durationMinutes.min + blueprint.durationMinutes.max) / 2,
  );
  const blendedDuration = Math.round(
    (estimatedDuration + blueprintDuration) / 2,
  );
  const desiredDuration = Math.min(
    blueprint.durationMinutes.max,
    Math.max(blueprint.durationMinutes.min, blendedDuration),
  );

  appLogger.info('🧠 Iniciando geração de roteiro pedagógico com OpenAI.', {
    topic,
    targetAudience,
    desiredDuration,
    promptId: blueprint.id,
  });

  const script = await generateStructuredScript(materials, {
    topic,
    targetAudience,
    desiredDuration,
    style: blueprint.defaultStyle,
    revisionInstructions,
  });

  const slides: RawSlide[] = script.slides.map((slide) => {
    const scriptText = buildScriptText(slide.content, slide.speakerNotes);
    return {
      scriptText,
      narrationText: buildNarrationText(
        slide.narrationText,
        slide.speakerNotes,
        scriptText,
      ),
      visualPrompt: buildVisualPrompt(slide.title, slide.content),
      imageUrl: undefined,
      userNotes: undefined,
      audioBlob: undefined,
      isRegeneratingImage: false,
    };
  });

  appLogger.info('📝 Roteiro convertido para o formato interno.', {
    slides: slides.length,
  });

  return slides;
}

export async function generateSlideImage(
  visualPrompt: string,
  aspectRatio: AspectRatio,
): Promise<string> {
  const style = STYLE_BY_RATIO[aspectRatio] ?? 'illustrated';
  const sizeConfig = IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio];
  appLogger.info('🖼️ Solicitando imagem via OpenAI.', {
    aspectRatio,
    style,
    apiSize: sizeConfig.apiSize,
  });

  const image = await generateOpenAiSlideImage({
    description: visualPrompt,
    style,
    targetAudience: DEFAULT_AUDIENCE,
    slideTitle: visualPrompt.slice(0, 80) || 'EduScript Slide',
    aspectRatio,
  });

  return `data:${image.mimeType};base64,${image.base64}`;
}

export async function refineSlideContent(
  currentSlide: Slide,
  feedback: string,
) {
  appLogger.info('✏️ Refinando slide com feedback do usuário.');

  const result = await refineSlideContentWithFeedback(
    {
      scriptText: currentSlide.scriptText,
      narrationText: currentSlide.narrationText,
      visualPrompt: currentSlide.visualPrompt,
      userNotes: currentSlide.userNotes,
    },
    feedback,
    DEFAULT_AUDIENCE,
  );

  return result;
}
