import { ErrorBoundary } from 'react-error-boundary';

import { Sparkles } from 'lucide-react';

import {
  VIDEO_CONFIG,
  VIDEO_GENERATION_STEP,
  type VideoGenerationStep,
} from '@/config/constants/video';
import { getPromptBlueprintById } from '@/content/prompts';
import { EditorStep } from '@/features/video-generation/components/EditorStep/EditorStep';
import { InputStep } from '@/features/video-generation/components/InputStep/InputStep';
import { LoadingStep } from '@/features/video-generation/components/LoadingStep/LoadingStep';
import { PreviewStep } from '@/features/video-generation/components/PreviewStep/PreviewStep';
import { RecordingStep } from '@/features/video-generation/components/RecordingStep/RecordingStep';
import { ScriptReviewStep } from '@/features/video-generation/components/ScriptReviewStep/ScriptReviewStep';
import { useVideoGeneration } from '@/features/video-generation/hooks/useVideoGeneration';
import { SectionErrorFallback } from '@/shared/components/error-boundary/SectionErrorFallback';

const STEP_LABELS: Record<VideoGenerationStep, string> = {
  [VIDEO_GENERATION_STEP.INPUT]: 'Briefing',
  [VIDEO_GENERATION_STEP.GENERATING_SCRIPT]: 'Roteiro',
  [VIDEO_GENERATION_STEP.SCRIPT_REVIEW]: 'Revisão',
  [VIDEO_GENERATION_STEP.GENERATING_VISUALS]: 'Visuais',
  [VIDEO_GENERATION_STEP.EDITOR]: 'Edição',
  [VIDEO_GENERATION_STEP.RECORDING]: 'Gravação',
  [VIDEO_GENERATION_STEP.PREVIEW]: 'Preview',
};

const STEP_ORDER = [
  VIDEO_GENERATION_STEP.INPUT,
  VIDEO_GENERATION_STEP.GENERATING_SCRIPT,
  VIDEO_GENERATION_STEP.SCRIPT_REVIEW,
  VIDEO_GENERATION_STEP.GENERATING_VISUALS,
  VIDEO_GENERATION_STEP.EDITOR,
  VIDEO_GENERATION_STEP.RECORDING,
  VIDEO_GENERATION_STEP.PREVIEW,
];

export function VideoGenerationFlow() {
  const { step, slides, projectData, progress, actions } = useVideoGeneration();
  const aspectRatio =
    projectData.aspectRatio ?? VIDEO_CONFIG.DEFAULT_ASPECT_RATIO;
  const blueprint = projectData.promptId
    ? getPromptBlueprintById(projectData.promptId)
    : null;
  const isDebugMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === 'true';

  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="relative min-h-screen animate-fade-in">
      {isDebugMode && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-50">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-400/40 bg-dark-900/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200 shadow-glow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse" />
            Debug mode ativo
          </div>
        </div>
      )}

      {/* Step indicator */}
      {step !== VIDEO_GENERATION_STEP.INPUT && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 p-4">
          <div className="mx-auto flex max-w-5xl flex-col gap-2">
            <div className="flex items-center justify-between">
              {/* Current step badge */}
              <div className="badge-primary animate-slide-down">
                <Sparkles size={12} className="animate-pulse" />
                <span>{STEP_LABELS[step] ?? 'Fluxo'}</span>
              </div>

              {/* Step progress dots */}
              <div className="flex items-center gap-2">
                {STEP_ORDER.slice(1).map((s, index) => {
                  const isActive = index <= currentStepIndex - 1;
                  const isCurrent = s === step;
                  return (
                    <div
                      key={s}
                      className={`h-2 rounded-full transition-all duration-500 ${
                        isCurrent
                          ? 'w-8 bg-gradient-to-r from-primary-500 to-accent-400'
                          : isActive
                            ? 'w-2 bg-primary-500'
                            : 'w-2 bg-dark-600'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === VIDEO_GENERATION_STEP.INPUT && (
        <InputStep onStart={actions.startGeneration} />
      )}

      {(step === VIDEO_GENERATION_STEP.GENERATING_SCRIPT ||
        step === VIDEO_GENERATION_STEP.GENERATING_VISUALS) && (
        <LoadingStep progress={progress} />
      )}

      {step === VIDEO_GENERATION_STEP.SCRIPT_REVIEW && (
        <ScriptReviewStep
          slides={slides}
          projectData={projectData}
          onSlideChange={actions.updateSlide}
          onInsertSlideAfter={actions.insertSlideAfter}
          onRemoveSlide={actions.removeSlide}
          onMoveSlide={actions.moveSlide}
          onAddSlide={actions.addSlide}
          onApplyInstructions={actions.regenerateScript}
          onContinue={actions.proceedToVisualEditing}
        />
      )}

      {step === VIDEO_GENERATION_STEP.EDITOR && (
        <ErrorBoundary
          FallbackComponent={SectionErrorFallback}
          resetKeys={[slides.length]}
        >
          <EditorStep
            slides={slides}
            aspectRatio={aspectRatio}
            onUpdateSlide={actions.updateSlide}
            onFinish={actions.startRecording}
          />
        </ErrorBoundary>
      )}

      {step === VIDEO_GENERATION_STEP.RECORDING && (
        <ErrorBoundary
          FallbackComponent={SectionErrorFallback}
          resetKeys={[slides.length]}
        >
          <RecordingStep
            slides={slides}
            aspectRatio={aspectRatio}
            onUpdateSlide={actions.updateSlide}
            onFinish={actions.openPreview}
            isDebugMode={isDebugMode}
            onExportSnapshot={actions.exportSnapshot}
            onImportSnapshot={actions.importSnapshot}
          />
        </ErrorBoundary>
      )}

      {step === VIDEO_GENERATION_STEP.PREVIEW && (
        <ErrorBoundary
          FallbackComponent={SectionErrorFallback}
          resetKeys={[slides.length]}
        >
          <PreviewStep
            slides={slides}
            aspectRatio={aspectRatio}
            onReset={actions.resetFlow}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
