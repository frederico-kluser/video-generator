import { useActionState, useState } from 'react';
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
import type { VideoGenerationPayload } from '@/features/video-generation/model/types';
import { OpenAIKeyModal } from '@/shared/components/OpenAIKeyModal/OpenAIKeyModal';
import { VoiceTextInput, VoiceTextarea } from '@/shared/components/VoiceInput/VoiceTextField';
import { useOpenAIKey } from '@/shared/hooks/useOpenAIKey';

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
  const [audience, setAudience] = useState<string>(
    VIDEO_CONFIG.DEFAULT_AUDIENCE,
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    VIDEO_CONFIG.DEFAULT_ASPECT_RATIO,
  );

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

      if (!topicValue || !materialsValue) {
        return 'Informe um tópico e materiais de referência para continuar.';
      }

      const payload: VideoGenerationPayload = {
        topic: topicValue,
        materials: materialsValue,
        targetAudience: targetAudienceValue,
        aspectRatio: safeAspectRatio,
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
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:mt-4">
              {hasApiKey && (
                <button
                  type="button"
                  onClick={openKeyModal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/80 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
                >
                  <Key size={12} className="sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Trocar chave OpenAI</span>
                  <span className="sm:hidden">Trocar API Key</span>
                </button>
              )}
            </div>
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
                <VoiceTextInput
                  id="topic"
                  name="topic"
                  type="text"
                  placeholder="Ex.: Teorema de Pitágoras..."
                  value={topic}
                  onValueChange={setTopic}
                  required
                  buttonAriaLabel="Ditado para o campo de tópico"
                />
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

              {/* Materials Textarea */}
              <div className="space-y-1.5 sm:space-y-2">
                <label className="label" htmlFor="materials">
                  <Wand2 size={14} className="text-primary-400 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Materiais ou notas de referência</span>
                  <span className="sm:hidden">Materiais de referência</span>
                </label>
                <VoiceTextarea
                  id="materials"
                  name="materials"
                  className="min-h-[100px] sm:min-h-[120px] md:min-h-[140px]"
                  placeholder="Cole materiais ou especifique slides (ex.: '6 slides em 5 min')."
                  value={materials}
                  onValueChange={setMaterials}
                  required
                  buttonAriaLabel="Ditado para materiais de referência"
                  buttonClassName="mt-0.5 sm:mt-1"
                />
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
                            className={`text-xs font-semibold sm:text-sm ${
                              isSelected ? 'text-primary-300' : 'text-white/80'
                            }`}
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
        </div>
      </div>
    </>
  );
}
