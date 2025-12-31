import { ErrorBoundary } from 'react-error-boundary';
import { VIDEO_CONFIG, VIDEO_GENERATION_STEP, type VideoGenerationStep } from '@/config/constants/video';
import { InputStep } from '@/features/video-generation/components/InputStep/InputStep';
import { LoadingStep } from '@/features/video-generation/components/LoadingStep/LoadingStep';
import { EditorStep } from '@/features/video-generation/components/EditorStep/EditorStep';
import { RecordingStep } from '@/features/video-generation/components/RecordingStep/RecordingStep';
import { PreviewStep } from '@/features/video-generation/components/PreviewStep/PreviewStep';
import { useVideoGeneration } from '@/features/video-generation/hooks/useVideoGeneration';
import { SectionErrorFallback } from '@/shared/components/error-boundary/SectionErrorFallback';

const STEP_LABELS: Record<VideoGenerationStep, string> = {
  [VIDEO_GENERATION_STEP.INPUT]: 'Briefing',
  [VIDEO_GENERATION_STEP.GENERATING_SCRIPT]: 'Roteiro',
  [VIDEO_GENERATION_STEP.GENERATING_VISUALS]: 'Visuais',
  [VIDEO_GENERATION_STEP.EDITOR]: 'Edição',
  [VIDEO_GENERATION_STEP.RECORDING]: 'Gravação',
  [VIDEO_GENERATION_STEP.PREVIEW]: 'Preview',
};

export function VideoGenerationFlow() {
  const { step, slides, projectData, progress, actions } = useVideoGeneration();
  const aspectRatio = projectData.aspectRatio ?? VIDEO_CONFIG.DEFAULT_ASPECT_RATIO;

  return (
    <div className="relative min-h-screen">
      {step !== VIDEO_GENERATION_STEP.INPUT && (
        <div className="pointer-events-none absolute left-0 top-0 z-50 p-4">
          <div className="flex items-center gap-2 rounded-full border border-blue-900/50 bg-black/50 px-3 py-1 text-blue-400">
            <span className="text-xs font-bold uppercase tracking-widest">
              {STEP_LABELS[step] ?? 'Fluxo'}
            </span>
          </div>
        </div>
      )}

      {step === VIDEO_GENERATION_STEP.INPUT && <InputStep onStart={actions.startGeneration} />}

      {(step === VIDEO_GENERATION_STEP.GENERATING_SCRIPT || step === VIDEO_GENERATION_STEP.GENERATING_VISUALS) && (
        <LoadingStep progress={progress} />
      )}

      {step === VIDEO_GENERATION_STEP.EDITOR && (
        <ErrorBoundary FallbackComponent={SectionErrorFallback} resetKeys={[slides.length]}>
          <EditorStep
            slides={slides}
            aspectRatio={aspectRatio}
            onUpdateSlide={actions.updateSlide}
            onFinish={actions.startRecording}
          />
        </ErrorBoundary>
      )}

      {step === VIDEO_GENERATION_STEP.RECORDING && (
        <ErrorBoundary FallbackComponent={SectionErrorFallback} resetKeys={[slides.length]}>
          <RecordingStep
            slides={slides}
            aspectRatio={aspectRatio}
            onUpdateSlide={actions.updateSlide}
            onFinish={actions.openPreview}
          />
        </ErrorBoundary>
      )}

      {step === VIDEO_GENERATION_STEP.PREVIEW && (
        <ErrorBoundary FallbackComponent={SectionErrorFallback} resetKeys={[slides.length]}>
          <PreviewStep slides={slides} aspectRatio={aspectRatio} onReset={actions.resetFlow} />
        </ErrorBoundary>
      )}
    </div>
  );
}
