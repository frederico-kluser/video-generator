import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Key,
  LayoutTemplate,
  Monitor,
  Smartphone,
  Sparkles,
  Square,
  Users,
  Video,
  Wand2,
} from 'lucide-react';

import {
  type AspectRatio,
  VIDEO_ASPECT_RATIOS,
  VIDEO_CONFIG,
} from '@/config/constants/video';
import {
  DEFAULT_PROMPT_BLUEPRINT_ID,
  PROMPT_CATEGORIES,
  PROMPT_CATEGORY_METADATA,
  getBlueprintsByCategory,
  getPromptBlueprintById,
  isPromptBlueprintId,
  type PromptBlueprint,
  type PromptBlueprintId,
  type PromptCategory,
} from '@/content/prompts';
import type { VideoGenerationPayload } from '@/features/video-generation/model/types';
import { OpenAIKeyModal } from '@/shared/components/OpenAIKeyModal/OpenAIKeyModal';
import { useOpenAIKey } from '@/shared/hooks/useOpenAIKey';
import { VoiceInputButton } from '@/shared/components/VoiceInput/VoiceInputButton';

const AUDIENCE_OPTIONS = [
  { value: 'Elementary School (K-5)', label: 'Ensino Fundamental', icon: '🎒' },
  { value: 'High School (6-12)', label: 'Ensino Médio', icon: '📚' },
  { value: 'University / Adult', label: 'Universidade / Adulto', icon: '🎓' },
  { value: 'General Public', label: 'Público Geral', icon: '🌍' },
];

const FORMAT_OPTIONS = [
  {
    id: '9:16' as AspectRatio,
    label: 'Shorts',
    sublabel: 'TikTok, Reels',
    icon: Smartphone,
  },
  {
    id: '16:9' as AspectRatio,
    label: 'YouTube',
    sublabel: 'Widescreen',
    icon: Monitor,
  },
  {
    id: '1:1' as AspectRatio,
    label: 'Quadrado',
    sublabel: 'Feed, Posts',
    icon: Square,
  },
];

const isAspectRatio = (value: string): value is AspectRatio =>
  (VIDEO_ASPECT_RATIOS as readonly string[]).some((ratio) => ratio === value);

const getStringValue = (
  entry: FormDataEntryValue | null,
  fallback = '',
): string => (typeof entry === 'string' ? entry : fallback);

type InputStepProps = {
  onStart: (data: VideoGenerationPayload) => Promise<void>;
};

export function InputStep({ onStart }: InputStepProps) {
  const {
    isKeyModalOpen,
    saveApiKey,
    closeKeyModal,
    openKeyModal,
    hasApiKey,
  } = useOpenAIKey();

  const [topic, setTopic] = useState('');
  const [materials, setMaterials] = useState('');
  const [audience, setAudience] = useState(VIDEO_CONFIG.DEFAULT_AUDIENCE);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    VIDEO_CONFIG.DEFAULT_ASPECT_RATIO,
  );
  const [selectedCategory, setSelectedCategory] = useState<PromptCategory>(
    getPromptBlueprintById(DEFAULT_PROMPT_BLUEPRINT_ID).category,
  );
  const [selectedPromptId, setSelectedPromptId] = useState<PromptBlueprintId>(
    DEFAULT_PROMPT_BLUEPRINT_ID,
  );

  const visibleBlueprints = useMemo(() => {
    return getBlueprintsByCategory(selectedCategory);
  }, [selectedCategory]);

  const selectedBlueprint = useMemo(() => {
    return getPromptBlueprintById(selectedPromptId);
  }, [selectedPromptId]);

  useEffect(() => {
    if (
      !visibleBlueprints.some((blueprint) => blueprint.id === selectedPromptId)
    ) {
      const fallback = visibleBlueprints[0];
      if (fallback) {
        setSelectedPromptId(fallback.id);
      }
    }
  }, [selectedPromptId, visibleBlueprints]);

  const [actionError, startAction, isPending] = useActionState(
    async (_: string | null, formData: FormData) => {
      const topicValue = getStringValue(formData.get('topic')).trim();
      const materialsValue = getStringValue(formData.get('materials')).trim();
      const targetAudienceValue = getStringValue(
        formData.get('audience'),
        VIDEO_CONFIG.DEFAULT_AUDIENCE,
      );
      const aspectRatioEntry = formData.get('aspectRatio');
      const safeAspectRatio =
        typeof aspectRatioEntry === 'string' && isAspectRatio(aspectRatioEntry)
          ? aspectRatioEntry
          : VIDEO_CONFIG.DEFAULT_ASPECT_RATIO;
      const promptIdEntry = formData.get('promptId');
      const safePromptId =
        typeof promptIdEntry === 'string' && isPromptBlueprintId(promptIdEntry)
          ? promptIdEntry
          : DEFAULT_PROMPT_BLUEPRINT_ID;

      if (!topicValue || !materialsValue) {
        return 'Informe um tópico e materiais de referência para continuar.';
      }

      const payload: VideoGenerationPayload = {
        topic: topicValue,
        materials: materialsValue,
        targetAudience: targetAudienceValue,
        aspectRatio: safeAspectRatio,
        promptId: safePromptId,
      };

      try {
        await onStart(payload);
        return null;
      } catch (error) {
        if (error instanceof Error) {
          return error.message;
        }
        return 'Não foi possível iniciar a geração. Tente novamente.';
      }
    },
    null,
  );

  return (
    <>
      <OpenAIKeyModal
        isOpen={isKeyModalOpen}
        onSave={saveApiKey}
        onClose={closeKeyModal}
        canClose={hasApiKey}
      />
      <div className="flex min-h-screen w-full flex-col items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8">
        <div className="w-full max-w-2xl animate-slide-up">
          {/* Header */}
          <div className="mb-4 text-center sm:mb-6 md:mb-8">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-300 sm:mb-3 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm md:mb-4">
              <Sparkles size={14} className="animate-pulse sm:h-4 sm:w-4" />
              Powered by AI
            </div>
            <h1 className="mb-2 text-3xl font-extrabold tracking-tight sm:mb-3 sm:text-4xl md:text-5xl">
              <span className="text-gradient">Grava</span>
            </h1>
            <p className="text-sm text-white/60 sm:text-base md:text-lg">
              Transforme suas anotações em videoaulas memoráveis
            </p>
            {hasApiKey && (
              <button
                type="button"
                onClick={openKeyModal}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/80 sm:mt-4 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
              >
                <Key size={12} className="sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Trocar chave OpenAI</span>
                <span className="sm:hidden">Trocar API Key</span>
              </button>
            )}
          </div>

        {/* Main Card */}
        <div className="glass-card p-4 sm:p-5 md:p-6 lg:p-8">
          {actionError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3 text-danger-400 animate-slide-down sm:mb-6 sm:gap-3 sm:rounded-xl sm:p-4">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-500/20 text-xs sm:h-8 sm:w-8 sm:text-sm">
                !
              </div>
              <p className="text-xs sm:text-sm">{actionError}</p>
            </div>
          )}

          <form action={startAction} className="space-y-4 sm:space-y-5 md:space-y-6">
            {/* Topic Input */}
            <div className="space-y-1.5 sm:space-y-2">
              <label className="label" htmlFor="topic">
                <BookOpen size={14} className="text-primary-400 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Qual é o tópico principal?</span>
                <span className="sm:hidden">Tópico principal</span>
              </label>
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  id="topic"
                  name="topic"
                  type="text"
                  className="input flex-1"
                  placeholder="Ex.: Teorema de Pitágoras..."
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  required
                />
                <VoiceInputButton
                  size="sm"
                  ariaLabel="Ditado para o campo de tópico"
                  onTranscription={(text) => setTopic(text)}
                />
              </div>
            </div>

            {/* Audience Select */}
            <div className="space-y-1.5 sm:space-y-2">
              <label className="label" htmlFor="audience">
                <Users size={14} className="text-primary-400 sm:h-4 sm:w-4" />
                Público-alvo
              </label>
              <div className="relative">
                <select
                  id="audience"
                  name="audience"
                  className="input appearance-none pr-8 sm:pr-10"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                >
                  {AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.icon} {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40 sm:right-4 sm:h-[18px] sm:w-[18px]"
                />
              </div>
            </div>

            {/* Prompt Blueprint Selection */}
            <div className="space-y-2 sm:space-y-3">
              <label className="label">
                <Sparkles size={14} className="text-primary-400 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Finalidade e blueprint</span>
                <span className="sm:hidden">Blueprint</span>
              </label>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {PROMPT_CATEGORIES.map((category) => {
                  const metadata = PROMPT_CATEGORY_METADATA[category];
                  const isActive = category === selectedCategory;
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:py-2 sm:text-sm ${
                        isActive
                          ? 'border-primary-500 bg-primary-500/15 text-primary-200'
                          : 'border-dark-600 bg-dark-800/50 text-white/70 hover:border-dark-500 hover:text-white'
                      }`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      <span className="mr-1 sm:mr-2">{metadata.icon}</span>
                      {metadata.label}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2 sm:space-y-3">
                {visibleBlueprints.map((blueprint) => {
                  const isSelected = blueprint.id === selectedPromptId;
                  return (
                    <PromptBlueprintCard
                      key={blueprint.id}
                      blueprint={blueprint}
                      isSelected={isSelected}
                      onSelect={() => setSelectedPromptId(blueprint.id)}
                    />
                  );
                })}
              </div>
              <input type="hidden" name="promptId" value={selectedPromptId} />
            </div>

            {/* Materials Textarea */}
            <div className="space-y-1.5 sm:space-y-2">
              <label className="label" htmlFor="materials">
                <Wand2 size={14} className="text-primary-400 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Materiais ou notas de referência</span>
                <span className="sm:hidden">Materiais de referência</span>
              </label>
              <div className="flex items-start gap-2 sm:gap-3">
                <textarea
                  id="materials"
                  name="materials"
                  className="input min-h-[100px] flex-1 resize-none sm:min-h-[120px] md:min-h-[140px]"
                  placeholder="Cole materiais ou especifique slides (ex.: '6 slides em 5 min')."
                  value={materials}
                  onChange={(event) => setMaterials(event.target.value)}
                  required
                />
                <VoiceInputButton
                  ariaLabel="Ditado para materiais de referência"
                  className="mt-0.5 shrink-0 sm:mt-1"
                  onTranscription={(text) => setMaterials(text)}
                />
              </div>
            </div>

            {/* Format Selection */}
            <div className="space-y-2 sm:space-y-3">
              <label className="label">
                <LayoutTemplate size={14} className="text-primary-400 sm:h-4 sm:w-4" />
                Formato do vídeo
              </label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {FORMAT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = aspectRatio === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`group relative flex flex-col items-center gap-1 rounded-lg border p-2 transition-all duration-300 sm:gap-2 sm:rounded-xl sm:p-3 md:p-4 ${
                        isSelected
                          ? 'border-primary-500 bg-primary-500/15'
                          : 'border-dark-600 bg-dark-800/50 hover:border-dark-500 hover:bg-dark-700/50'
                      }`}
                      onClick={() => setAspectRatio(option.id)}
                    >
                      {isSelected && (
                        <div className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[8px] text-white sm:-right-1 sm:-top-1 sm:h-5 sm:w-5 sm:text-[10px]">
                          ✓
                        </div>
                      )}
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors sm:h-10 sm:w-10 ${
                          isSelected
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-dark-700 text-white/50 group-hover:text-white/70'
                        }`}
                      >
                        <Icon size={16} className="sm:h-5 sm:w-5" />
                      </div>
                      <div className="text-center">
                        <div
                          className={`text-xs font-semibold sm:text-sm ${isSelected ? 'text-primary-300' : 'text-white/80'}`}
                        >
                          {option.label}
                        </div>
                        <div className="hidden text-xs text-white/40 sm:block">
                          {option.sublabel}
                        </div>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] sm:rounded-md sm:px-2 sm:text-xs ${
                          isSelected
                            ? 'bg-primary-500/20 text-primary-300'
                            : 'bg-dark-700 text-white/50'
                        }`}
                      >
                        {option.id}
                      </span>
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="aspectRatio" value={aspectRatio} />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="btn-primary w-full py-3 text-sm sm:py-3.5 sm:text-base md:py-4 md:text-lg"
            >
              {isPending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">Gerando roteiro...</span>
                  <span className="sm:hidden">Gerando...</span>
                </>
              ) : (
                <>
                  <Video size={18} className="sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">Gerar roteiro e slides</span>
                  <span className="sm:hidden">Gerar roteiro</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer hint */}
        <p className="mt-4 text-center text-xs text-white/40 sm:mt-5 sm:text-sm md:mt-6">
          A IA criará um roteiro otimizado e gerará imagens para cada slide
        </p>
        {selectedBlueprint && (
          <div className="mt-3 rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-white/70 sm:mt-4 sm:rounded-2xl sm:p-4 sm:text-sm">
            <div className="mb-1.5 font-semibold text-white sm:mb-2">
              {selectedBlueprint.icon} {selectedBlueprint.title}
            </div>
            <p className="text-white/70">{selectedBlueprint.summary}</p>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

type PromptBlueprintCardProps = {
  blueprint: PromptBlueprint;
  isSelected: boolean;
  onSelect: () => void;
};

function PromptBlueprintCard({
  blueprint,
  isSelected,
  onSelect,
}: PromptBlueprintCardProps) {
  const formatRange = (
    range?: { min: number; max: number } | null,
  ): string | null => {
    if (!range) {
      return null;
    }
    return range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
  };
  const slidesLabel = formatRange(blueprint.slidesRange);
  const durationLabel = formatRange(blueprint.durationMinutes);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:rounded-2xl sm:p-4 ${
        isSelected
          ? 'border-primary-500 bg-primary-500/10'
          : 'border-dark-600 bg-dark-800/40 hover:border-dark-500 hover:bg-dark-700/40'
      }`}
      aria-pressed={isSelected}
    >
      <div className="flex items-center justify-between">
        <span className="text-xl sm:text-2xl" aria-hidden>
          {blueprint.icon}
        </span>
        {isSelected && (
          <span className="rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-semibold text-primary-200 sm:px-3 sm:py-1 sm:text-xs">
            Selecionado
          </span>
        )}
      </div>
      <div className="mt-2 text-sm font-semibold text-white sm:mt-3 sm:text-base md:text-lg">
        {blueprint.title}
      </div>
      <p className="mt-0.5 text-xs text-white/70 sm:mt-1 sm:text-sm">{blueprint.summary}</p>
      {(slidesLabel || durationLabel) && (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/60 sm:mt-3 sm:gap-3 sm:text-xs">
          {slidesLabel && (
            <span className="rounded-full bg-white/5 px-1.5 py-0.5 font-mono sm:px-2 sm:py-1">
              Slides: {slidesLabel}
            </span>
          )}
          {durationLabel && (
            <span className="rounded-full bg-white/5 px-1.5 py-0.5 font-mono sm:px-2 sm:py-1">
              {durationLabel} min
            </span>
          )}
        </div>
      )}
      <div className="mt-2 hidden flex-wrap gap-1.5 text-[10px] text-white/60 sm:mt-3 sm:flex sm:gap-2 sm:text-xs">
        {blueprint.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-dark-700/70 px-1.5 py-0.5 font-medium sm:px-2"
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}
