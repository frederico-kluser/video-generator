import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
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
import { VoiceInputButton } from '@/shared/components/VoiceInput/VoiceInputButton';
import { mergeTranscript } from '@/shared/utils/transcription';

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
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl animate-slide-up">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-500/10 px-4 py-2 text-sm font-medium text-primary-300">
            <Sparkles size={16} className="animate-pulse" />
            Powered by AI
          </div>
          <h1 className="mb-3 text-4xl font-extrabold tracking-tight md:text-5xl">
            <span className="text-gradient">EduScript</span>
            <span className="text-white"> AI</span>
          </h1>
          <p className="text-lg text-white/60">
            Transforme suas anotações em videoaulas memoráveis
          </p>
        </div>

        {/* Main Card */}
        <div className="glass-card p-6 md:p-8">
          {actionError && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-danger-400 animate-slide-down">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-500/20">
                !
              </div>
              <p className="text-sm">{actionError}</p>
            </div>
          )}

          <form action={startAction} className="space-y-6">
            {/* Topic Input */}
            <div className="space-y-2">
              <label className="label" htmlFor="topic">
                <BookOpen size={16} className="text-primary-400" />
                Qual é o tópico principal?
              </label>
              <div className="relative">
                <input
                  id="topic"
                  name="topic"
                  type="text"
                  className="input pr-14"
                  placeholder="Ex.: Teorema de Pitágoras, Fotossíntese, Segunda Guerra Mundial..."
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  required
                />
                <VoiceInputButton
                  size="sm"
                  ariaLabel="Ditado para o campo de tópico"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onTranscription={(text) =>
                    setTopic((prev) =>
                      mergeTranscript(prev, text, { separator: ' ' }),
                    )
                  }
                />
              </div>
            </div>

            {/* Audience Select */}
            <div className="space-y-2">
              <label className="label" htmlFor="audience">
                <Users size={16} className="text-primary-400" />
                Público-alvo
              </label>
              <div className="relative">
                <select
                  id="audience"
                  name="audience"
                  className="input appearance-none pr-10"
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
                  size={18}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40"
                />
              </div>
            </div>

            {/* Prompt Blueprint Selection */}
            <div className="space-y-3">
              <label className="label">
                <Sparkles size={16} className="text-primary-400" />
                Finalidade e blueprint do prompt
              </label>
              <div className="flex flex-wrap gap-2">
                {PROMPT_CATEGORIES.map((category) => {
                  const metadata = PROMPT_CATEGORY_METADATA[category];
                  const isActive = category === selectedCategory;
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                        isActive
                          ? 'border-primary-500 bg-primary-500/15 text-primary-200 shadow-glow-sm'
                          : 'border-dark-600 bg-dark-800/50 text-white/70 hover:border-dark-500 hover:text-white'
                      }`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      <span className="mr-2">{metadata.icon}</span>
                      {metadata.label}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3">
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
            <div className="space-y-2">
              <label className="label" htmlFor="materials">
                <Wand2 size={16} className="text-primary-400" />
                Materiais ou notas de referência
              </label>
              <div className="relative">
                <textarea
                  id="materials"
                  name="materials"
                  className="input min-h-[140px] resize-none pr-14"
                  placeholder="Cole textos, tópicos, transcrições ou qualquer material que sirva de base para o roteiro..."
                  value={materials}
                  onChange={(event) => setMaterials(event.target.value)}
                  required
                />
                <VoiceInputButton
                  ariaLabel="Ditado para materiais de referência"
                  className="absolute right-3 top-3"
                  onTranscription={(text) =>
                    setMaterials((prev) => mergeTranscript(prev, text))
                  }
                />
              </div>
            </div>

            {/* Format Selection */}
            <div className="space-y-3">
              <label className="label">
                <LayoutTemplate size={16} className="text-primary-400" />
                Formato do vídeo
              </label>
              <div className="grid grid-cols-3 gap-3">
                {FORMAT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = aspectRatio === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`group relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-300 ${
                        isSelected
                          ? 'border-primary-500 bg-primary-500/15 shadow-glow-sm'
                          : 'border-dark-600 bg-dark-800/50 hover:border-dark-500 hover:bg-dark-700/50'
                      }`}
                      onClick={() => setAspectRatio(option.id)}
                    >
                      {isSelected && (
                        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] text-white">
                          ✓
                        </div>
                      )}
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-dark-700 text-white/50 group-hover:text-white/70'
                        }`}
                      >
                        <Icon size={20} />
                      </div>
                      <div className="text-center">
                        <div
                          className={`text-sm font-semibold ${isSelected ? 'text-primary-300' : 'text-white/80'}`}
                        >
                          {option.label}
                        </div>
                        <div className="text-xs text-white/40">
                          {option.sublabel}
                        </div>
                      </div>
                      <span
                        className={`rounded-md px-2 py-0.5 font-mono text-xs ${
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
              className="btn-primary w-full py-4 text-lg"
            >
              {isPending ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Gerando roteiro...
                </>
              ) : (
                <>
                  <Video size={20} />
                  Gerar roteiro e slides
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer hint */}
        <p className="mt-6 text-center text-sm text-white/40">
          A IA irá criar um roteiro pedagógico otimizado e gerar imagens para
          cada slide
        </p>
        {selectedBlueprint && (
          <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 p-4 text-sm text-white/70">
            <div className="mb-2 font-semibold text-white">
              {selectedBlueprint.icon} {selectedBlueprint.title}
            </div>
            <p className="text-white/70">{selectedBlueprint.summary}</p>
          </div>
        )}
      </div>
    </div>
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
  const formatRange = (range: { min: number; max: number }): string =>
    range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
        isSelected
          ? 'border-primary-500 bg-primary-500/10 shadow-glow-sm'
          : 'border-dark-600 bg-dark-800/40 hover:border-dark-500 hover:bg-dark-700/40'
      }`}
      aria-pressed={isSelected}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl" aria-hidden>
          {blueprint.icon}
        </span>
        {isSelected && (
          <span className="rounded-full bg-primary-500/20 px-3 py-1 text-xs font-semibold text-primary-200">
            Selecionado
          </span>
        )}
      </div>
      <div className="mt-3 text-lg font-semibold text-white">
        {blueprint.title}
      </div>
      <p className="mt-1 text-sm text-white/70">{blueprint.summary}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/60">
        <span className="rounded-full bg-white/5 px-2 py-1 font-mono">
          Slides: {formatRange(blueprint.slidesRange)}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-1 font-mono">
          Duração: {formatRange(blueprint.durationMinutes)} min
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
        {blueprint.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-dark-700/70 px-2 py-0.5 font-medium"
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}
